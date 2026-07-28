import Foundation

@MainActor
final class GearGuardStore: ObservableObject {
    @Published private(set) var currentUser: GearUser?
    @Published private(set) var equipment: [Equipment]
    @Published private(set) var claims: [Claim]
    @Published private(set) var auditEvents: [AuditEvent]
    @Published var isOnline = true

    private var requestResults: [String: String]
    private let persistence: SnapshotPersisting

    init(persistence: SnapshotPersisting = UserDefaultsSnapshotPersistence()) {
        self.persistence = persistence
        let snapshot = persistence.load() ?? Self.seedSnapshot
        equipment = snapshot.equipment
        claims = snapshot.claims
        auditEvents = snapshot.auditEvents
        requestResults = snapshot.requestResults
    }

    func signIn(email rawEmail: String) throws {
        let email = rawEmail.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        let role = try RoleDeriver.role(for: email)
        let name = email.split(separator: "@").first.map(String.init)?
            .replacingOccurrences(of: ".", with: " ")
            .capitalized ?? role.title
        currentUser = GearUser(id: "local-\(email)", email: email, displayName: name, role: role)
    }

    func useDemo(role: UserRole) {
        let email = role == .teacher ? "teacher@sst.edu.sg" : "alex@students.ssts.edu.sg"
        currentUser = GearUser(id: "demo-\(role.rawValue)", email: email, displayName: role == .teacher ? "Ms Tan" : "Alex Lim", role: role)
    }

    func signOut() {
        currentUser = nil
    }

    func resolve(tagID: String) throws -> Equipment {
        try requireOnline()
        guard TagCodec.isValid(tagID) else { throw GearGuardError.invalidTagPayload }
        guard let item = equipment.first(where: { $0.tagID == tagID }) else { throw GearGuardError.unknownTag }
        guard item.isActive else { throw GearGuardError.inactiveTag }
        return item
    }

    func activeClaims(for equipmentID: String) -> [Claim] {
        claims
            .filter { $0.equipmentID == equipmentID && $0.status == .active }
            .sorted { $0.checkedOutAt > $1.checkedOutAt }
    }

    func claims(for user: GearUser) -> [Claim] {
        let visible = user.role == .teacher ? claims : claims.filter { $0.studentID == user.id || $0.studentEmail == user.email }
        return visible.sorted { $0.checkedOutAt > $1.checkedOutAt }
    }

    @discardableResult
    func enroll(name: String, serial: String, tagID: String, hardwareUID: String) throws -> Equipment {
        _ = try requireTeacher()
        try requireOnline()
        let cleanName = name.trimmingCharacters(in: .whitespacesAndNewlines)
        let cleanSerial = serial.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !cleanName.isEmpty, !cleanSerial.isEmpty else { throw GearGuardError.invalidEmail }
        guard TagCodec.isValid(tagID) else { throw GearGuardError.invalidTagPayload }
        guard !equipment.contains(where: { $0.tagID == tagID && $0.isActive }) else { throw GearGuardError.duplicateTag }
        guard !equipment.contains(where: { $0.internalSerial.caseInsensitiveCompare(cleanSerial) == .orderedSame && $0.isActive }) else {
            throw GearGuardError.duplicateSerial
        }
        let item = Equipment(
            id: UUID().uuidString,
            name: cleanName,
            internalSerial: cleanSerial,
            tagID: tagID,
            hardwareUID: hardwareUID,
            isActive: true,
            enrolledAt: .now
        )
        equipment.append(item)
        auditEvents.append(AuditEvent(id: UUID().uuidString, kind: .equipmentEnrolled, actorID: currentUser!.id, equipmentIDs: [item.id], claimIDs: [], createdAt: .now))
        persist()
        return item
    }

    func confirmCheckout(items: [StagedCheckoutItem], requestID: String) throws -> CheckoutReceipt {
        let user = try requireStudent()
        try requireOnline()
        guard !items.isEmpty else { throw GearGuardError.emptyBatch }
        guard items.count <= 20 else { throw GearGuardError.emptyBatch }
        guard items.allSatisfy({ !$0.hasIssue || !$0.issueText.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty }) else {
            throw GearGuardError.invalidIssue
        }
        if let batchID = requestResults[requestID] {
            let IDs = claims.filter { $0.checkoutBatchID == batchID }.map(\.equipmentID)
            return CheckoutReceipt(id: batchID, equipment: equipment.filter { IDs.contains($0.id) }, timestamp: claims.first(where: { $0.checkoutBatchID == batchID })?.checkedOutAt ?? .now)
        }
        let batchID = UUID().uuidString
        let now = Date.now
        let newClaims = items.map { item in
            Claim(
                id: UUID().uuidString,
                checkoutBatchID: batchID,
                equipmentID: item.equipment.id,
                tagIDAtCheckout: item.equipment.tagID,
                studentID: user.id,
                studentEmail: user.email,
                condition: item.hasIssue ? .hasIssue : .noIssues,
                issueText: item.hasIssue ? item.issueText.trimmingCharacters(in: .whitespacesAndNewlines) : nil,
                status: .active,
                checkedOutAt: now
            )
        }
        claims.append(contentsOf: newClaims)
        requestResults[requestID] = batchID
        auditEvents.append(AuditEvent(id: UUID().uuidString, kind: .checkoutConfirmed, actorID: user.id, equipmentIDs: items.map(\.equipment.id), claimIDs: newClaims.map(\.id), createdAt: now))
        persist()
        return CheckoutReceipt(id: batchID, equipment: items.map(\.equipment), timestamp: now)
    }

    @discardableResult
    func confirmReturn(items: [ReturnCandidate], requestID: String) throws -> Int {
        let teacher = try requireTeacher()
        try requireOnline()
        guard !items.isEmpty else { throw GearGuardError.emptyBatch }
        if let batchID = requestResults[requestID] {
            return claims.filter { $0.returnBatchID == batchID }.count
        }
        let batchID = UUID().uuidString
        let equipmentIDs = Set(items.map(\.equipment.id))
        let now = Date.now
        var resolvedIDs: [String] = []
        for index in claims.indices where equipmentIDs.contains(claims[index].equipmentID) && claims[index].status == .active {
            claims[index].status = .returned
            claims[index].returnBatchID = batchID
            claims[index].returnedAt = now
            claims[index].returnedByTeacherID = teacher.id
            resolvedIDs.append(claims[index].id)
        }
        requestResults[requestID] = batchID
        auditEvents.append(AuditEvent(
            id: UUID().uuidString,
            kind: resolvedIDs.isEmpty ? .returnWithoutClaim : .returnConfirmed,
            actorID: teacher.id,
            equipmentIDs: Array(equipmentIDs),
            claimIDs: resolvedIDs,
            createdAt: now
        ))
        persist()
        return resolvedIDs.count
    }

    func equipment(withID id: String) -> Equipment? {
        equipment.first { $0.id == id }
    }

    private func requireOnline() throws {
        guard isOnline else { throw GearGuardError.offline }
    }

    private func requireStudent() throws -> GearUser {
        guard let user = currentUser, user.role == .student else { throw GearGuardError.unsupportedDomain }
        return user
    }

    private func requireTeacher() throws -> GearUser {
        guard let user = currentUser, user.role == .teacher else { throw GearGuardError.unsupportedDomain }
        return user
    }

    private func persist() {
        persistence.save(StoreSnapshot(equipment: equipment, claims: claims, auditEvents: auditEvents, requestResults: requestResults))
    }

    private static var seedSnapshot: StoreSnapshot {
        let camera = Equipment(id: "eq-camera", name: "Canon R50", internalSerial: "MC-CAM-01", tagID: "gg:01J9Z6M4Y7X3N8K2D5P0Q1R4TC", hardwareUID: "04A1B2C3D4E5F6", isActive: true, enrolledAt: .now)
        let tripod = Equipment(id: "eq-tripod", name: "Manfrotto Tripod", internalSerial: "MC-TRI-02", tagID: "gg:01J9Z6M4Y7X3N8K2D5P0Q1R4TD", hardwareUID: "04A1B2C3D4E5F7", isActive: true, enrolledAt: .now)
        let mic = Equipment(id: "eq-mic", name: "RØDE Wireless GO", internalSerial: "AV-MIC-03", tagID: "gg:01J9Z6M4Y7X3N8K2D5P0Q1R4TE", hardwareUID: "04A1B2C3D4E5F8", isActive: true, enrolledAt: .now)
        return StoreSnapshot(equipment: [camera, tripod, mic])
    }
}
