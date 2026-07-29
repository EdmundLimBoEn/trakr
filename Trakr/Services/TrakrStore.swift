import Foundation

@MainActor
final class TrakrStore: ObservableObject {
    @Published private(set) var currentUser: GearUser?
    @Published private(set) var equipment: [Equipment]
    @Published private(set) var claims: [Claim]
    @Published private(set) var issues: [EquipmentIssue]
    @Published private(set) var notifications: [GearNotification]
    @Published private(set) var auditEvents: [AuditEvent]
    @Published private(set) var isNetworkReachable = true
    @Published var simulateOffline = false

    var isOnline: Bool { isNetworkReachable && !simulateOffline }
    @Published private(set) var isCloudSession = false

    private var requestResults: [String: String]
    private var inactiveTagIDs: Set<String>
    private let persistence: SnapshotPersisting
    private let firebase = FirebaseGateway()

    init(persistence: SnapshotPersisting = UserDefaultsSnapshotPersistence()) {
        self.persistence = persistence
        let snapshot = persistence.load() ?? Self.seedSnapshot
        equipment = snapshot.equipment
        claims = snapshot.claims
        issues = snapshot.issues
        notifications = snapshot.notifications
        auditEvents = snapshot.auditEvents
        inactiveTagIDs = snapshot.inactiveTagIDs
        requestResults = snapshot.requestResults
        if let user = firebase.currentUser {
            currentUser = user
            isCloudSession = true
            Task { try? await refreshFromFirebase() }
        }
    }

    func signInWithGoogle() async throws {
        let user = try await firebase.signIn()
        currentUser = user
        isCloudSession = true
        try await refreshFromFirebase()
    }

    func signIn(email rawEmail: String) throws {
        try? firebase.signOut()
        isCloudSession = false
        let email = rawEmail.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
        let role = try RoleDeriver.role(for: email)
        let name = email.split(separator: "@").first.map(String.init)?
            .replacingOccurrences(of: ".", with: " ")
            .capitalized ?? role.title
        currentUser = GearUser(id: "local-\(email)", email: email, displayName: name, role: role)
        processOverdue()
    }

    func useDemo(role: UserRole) {
        try? firebase.signOut()
        isCloudSession = false
        let email = role == .teacher ? "teacher@sst.edu.sg" : "alex@students.ssts.edu.sg"
        currentUser = GearUser(id: "demo-\(role.rawValue)", email: email, displayName: role == .teacher ? "Ms Tan" : "Alex Lim", role: role)
        processOverdue()
    }

    func signOut() {
        if isCloudSession { try? firebase.signOut() }
        currentUser = nil
        isCloudSession = false
    }

    func refreshFromFirebase() async throws {
        guard isCloudSession, let user = currentUser else { return }
        let snapshot = try await firebase.snapshot(for: user)
        equipment = snapshot.equipment
        claims = snapshot.claims
        issues = snapshot.issues
        notifications = snapshot.notifications
    }

    func resolveForWorkflow(tagID: String) async throws -> Equipment {
        guard isCloudSession else { return try resolve(tagID: tagID) }
        let item = try await firebase.resolve(tagID: tagID)
        if let index = equipment.firstIndex(where: { $0.id == item.id }) {
            equipment[index] = item
        } else {
            equipment.append(item)
        }
        return item
    }

    func confirmCheckoutForWorkflow(
        items: [StagedCheckoutItem],
        condition: ItemCondition,
        requestID: String
    ) async throws -> CheckoutReceipt {
        guard isCloudSession else {
            return try confirmCheckout(items: items, condition: condition, requestID: requestID)
        }
        let receipt = try await firebase.checkout(items: items, requestID: requestID)
        try await refreshFromFirebase()
        return receipt
    }

    func confirmReturnForWorkflow(items: [ReturnCandidate], requestID: String) async throws -> ReturnReceipt {
        guard isCloudSession else { return try confirmReturn(items: items, requestID: requestID) }
        let receipt = try await firebase.returnItems(items, requestID: requestID)
        try await refreshFromFirebase()
        return receipt
    }

    func enrollForWorkflow(name: String, serial: String, tagID: String, hardwareUID: String) async throws {
        guard isCloudSession else {
            _ = try enroll(name: name, serial: serial, tagID: tagID, hardwareUID: hardwareUID)
            return
        }
        try await firebase.enroll(name: name, serial: serial, tagID: tagID, hardwareUID: hardwareUID)
        try await refreshFromFirebase()
    }

    func updateEquipmentForWorkflow(id: String, name: String, serial: String, isActive: Bool) async throws {
        guard isCloudSession else {
            _ = try updateEquipment(id: id, name: name, serial: serial, isActive: isActive)
            return
        }
        try await firebase.updateEquipment(id: id, name: name, serial: serial, isActive: isActive)
        try await refreshFromFirebase()
    }

    func replaceTagForWorkflow(equipmentID: String, tagID: String, hardwareUID: String) async throws {
        guard isCloudSession else {
            _ = try replaceTag(equipmentID: equipmentID, tagID: tagID, hardwareUID: hardwareUID)
            return
        }
        try await firebase.replaceTag(equipmentID: equipmentID, tagID: tagID, hardwareUID: hardwareUID)
        try await refreshFromFirebase()
    }

    func updateIssueForWorkflow(id: String, status: IssueStatus) async throws {
        guard isCloudSession else {
            try updateIssue(id: id, status: status)
            return
        }
        try await firebase.updateIssue(id: id, status: status)
        try await refreshFromFirebase()
    }

    func setNetworkReachable(_ reachable: Bool) {
        isNetworkReachable = reachable
    }

    func resetDemoData() {
        let snapshot = Self.seedSnapshot
        currentUser = nil
        equipment = snapshot.equipment
        claims = snapshot.claims
        issues = snapshot.issues
        notifications = snapshot.notifications
        auditEvents = snapshot.auditEvents
        inactiveTagIDs = snapshot.inactiveTagIDs
        requestResults = snapshot.requestResults
        simulateOffline = false
        persist()
    }

    func resolve(tagID: String) throws -> Equipment {
        try requireOnline()
        guard TagCodec.isValid(tagID) else { throw TrakrError.invalidTagPayload }
        guard let item = equipment.first(where: { $0.tagID == tagID }) else {
            if inactiveTagIDs.contains(tagID) { throw TrakrError.inactiveTag }
            throw TrakrError.unknownTag
        }
        guard item.isActive else { throw TrakrError.inactiveTag }
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

    func notifications(for user: GearUser) -> [GearNotification] {
        notifications
            .filter {
                $0.recipientRole == user.role
                    && ($0.recipientUserID == nil || $0.recipientUserID == user.id)
            }
            .sorted { $0.createdAt > $1.createdAt }
    }

    func issues(status: IssueStatus? = nil) -> [EquipmentIssue] {
        issues
            .filter { status == nil || $0.status == status }
            .sorted { $0.reportedAt > $1.reportedAt }
    }

    @discardableResult
    func enroll(name: String, serial: String, tagID: String, hardwareUID: String) throws -> Equipment {
        _ = try requireTeacher()
        try requireOnline()
        let cleanName = name.trimmingCharacters(in: .whitespacesAndNewlines)
        let cleanSerial = serial.trimmingCharacters(in: .whitespacesAndNewlines)
        try validate(name: cleanName, serial: cleanSerial)
        guard TagCodec.isValid(tagID) else { throw TrakrError.invalidTagPayload }
        guard !equipment.contains(where: { $0.tagID == tagID }) && !inactiveTagIDs.contains(tagID) else { throw TrakrError.duplicateTag }
        guard !equipment.contains(where: { $0.internalSerial.caseInsensitiveCompare(cleanSerial) == .orderedSame && $0.isActive }) else {
            throw TrakrError.duplicateSerial
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

    @discardableResult
    func updateEquipment(id: String, name: String, serial: String, isActive: Bool) throws -> Equipment {
        let teacher = try requireTeacher()
        try requireOnline()
        let cleanName = name.trimmingCharacters(in: .whitespacesAndNewlines)
        let cleanSerial = serial.trimmingCharacters(in: .whitespacesAndNewlines)
        try validate(name: cleanName, serial: cleanSerial)
        guard !equipment.contains(where: {
            $0.id != id && $0.internalSerial.caseInsensitiveCompare(cleanSerial) == .orderedSame && $0.isActive
        }) else { throw TrakrError.duplicateSerial }
        guard let index = equipment.firstIndex(where: { $0.id == id }) else { throw TrakrError.unknownTag }
        equipment[index].name = cleanName
        equipment[index].internalSerial = cleanSerial
        equipment[index].isActive = isActive
        auditEvents.append(AuditEvent(id: UUID().uuidString, kind: .equipmentUpdated, actorID: teacher.id, equipmentIDs: [id], claimIDs: [], createdAt: .now))
        persist()
        return equipment[index]
    }

    @discardableResult
    func replaceTag(equipmentID: String, tagID: String, hardwareUID: String) throws -> Equipment {
        let teacher = try requireTeacher()
        try requireOnline()
        guard TagCodec.isValid(tagID) else { throw TrakrError.invalidTagPayload }
        guard !equipment.contains(where: { $0.id != equipmentID && $0.tagID == tagID }) && !inactiveTagIDs.contains(tagID) else { throw TrakrError.duplicateTag }
        guard let index = equipment.firstIndex(where: { $0.id == equipmentID }) else { throw TrakrError.unknownTag }
        inactiveTagIDs.insert(equipment[index].tagID)
        equipment[index].tagID = tagID
        equipment[index].hardwareUID = hardwareUID
        equipment[index].isActive = true
        auditEvents.append(AuditEvent(id: UUID().uuidString, kind: .tagReplaced, actorID: teacher.id, equipmentIDs: [equipmentID], claimIDs: [], createdAt: .now))
        persist()
        return equipment[index]
    }

    func confirmCheckout(items: [StagedCheckoutItem], condition: ItemCondition, requestID: String) throws -> CheckoutReceipt {
        let user = try requireStudent()
        try requireOnline()
        guard !items.isEmpty else { throw TrakrError.emptyBatch }
        guard items.count <= 20 else { throw TrakrError.batchTooLarge }
        let affected = items.filter(\.hasIssue)
        guard condition != .hasIssue || !affected.isEmpty else { throw TrakrError.invalidIssue }
        guard condition != .noIssues || affected.isEmpty else { throw TrakrError.invalidIssue }
        guard affected.allSatisfy({
            let text = $0.issueText.trimmingCharacters(in: .whitespacesAndNewlines)
            return !text.isEmpty && text.count <= 500
        }) else {
            throw TrakrError.invalidIssue
        }
        if let batchID = requestResults[requestID] {
            let existingClaims = claims.filter { $0.checkoutBatchID == batchID }
            let IDs = existingClaims.map(\.equipmentID)
            return CheckoutReceipt(id: batchID, equipment: equipment.filter { IDs.contains($0.id) }, claimIDs: existingClaims.map(\.id), timestamp: existingClaims.first?.checkedOutAt ?? .now)
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
        let newIssues = zip(newClaims, items).compactMap { pair -> EquipmentIssue? in
            let (claim, item) = pair
            guard item.hasIssue else { return nil }
            return EquipmentIssue(
                id: UUID().uuidString,
                claimID: claim.id,
                equipmentID: item.equipment.id,
                reportedByStudentID: user.id,
                reportedByStudentEmail: user.email,
                text: item.issueText.trimmingCharacters(in: .whitespacesAndNewlines),
                status: .open,
                reportedAt: now
            )
        }
        issues.append(contentsOf: newIssues)
        notifications.append(GearNotification(
            id: UUID().uuidString,
            kind: .checkout,
            recipientRole: .student,
            recipientUserID: user.id,
            title: "Equipment checked out",
            message: "\(items.count) \(items.count == 1 ? "item" : "items") checked out successfully.",
            equipmentIDs: items.map(\.equipment.id),
            claimID: nil,
            createdAt: now,
            isRead: false
        ))
        for issue in newIssues {
            notifications.append(GearNotification(
                id: UUID().uuidString,
                kind: .issue,
                recipientRole: .teacher,
                recipientUserID: nil,
                title: "Equipment issue reported",
                message: "A student reported an issue requiring review.",
                equipmentIDs: [issue.equipmentID],
                claimID: issue.claimID,
                createdAt: now,
                isRead: false
            ))
        }
        requestResults[requestID] = batchID
        auditEvents.append(AuditEvent(id: UUID().uuidString, kind: .checkoutConfirmed, actorID: user.id, equipmentIDs: items.map(\.equipment.id), claimIDs: newClaims.map(\.id), createdAt: now))
        persist()
        return CheckoutReceipt(id: batchID, equipment: items.map(\.equipment), claimIDs: newClaims.map(\.id), timestamp: now)
    }

    @discardableResult
    func confirmReturn(items: [ReturnCandidate], requestID: String) throws -> ReturnReceipt {
        let teacher = try requireTeacher()
        try requireOnline()
        guard !items.isEmpty else { throw TrakrError.emptyBatch }
        if let batchID = requestResults[requestID] {
            let IDs = claims.filter { $0.returnBatchID == batchID }.map(\.id)
            return ReturnReceipt(batchID: batchID, resolvedClaimIDs: IDs, resolvedCount: IDs.count)
        }
        let batchID = UUID().uuidString
        let equipmentIDs = Set(items.map(\.equipment.id))
        let now = Date.now
        var resolvedIDs: [String] = []
        var affectedStudents: [String: [String]] = [:]
        for index in claims.indices where equipmentIDs.contains(claims[index].equipmentID) && claims[index].status == .active {
            affectedStudents[claims[index].studentID, default: []].append(claims[index].equipmentID)
            claims[index].status = .returned
            claims[index].returnBatchID = batchID
            claims[index].returnedAt = now
            claims[index].returnedByTeacherID = teacher.id
            resolvedIDs.append(claims[index].id)
        }
        for (studentID, returnedEquipmentIDs) in affectedStudents {
            notifications.append(GearNotification(
                id: UUID().uuidString,
                kind: .returned,
                recipientRole: .student,
                recipientUserID: studentID,
                title: "Equipment returned",
                message: "\(Set(returnedEquipmentIDs).count) \(Set(returnedEquipmentIDs).count == 1 ? "item was" : "items were") returned.",
                equipmentIDs: Array(Set(returnedEquipmentIDs)),
                claimID: nil,
                createdAt: now,
                isRead: false
            ))
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
        return ReturnReceipt(batchID: batchID, resolvedClaimIDs: resolvedIDs, resolvedCount: resolvedIDs.count)
    }

    func updateIssue(id: String, status: IssueStatus) throws {
        let teacher = try requireTeacher()
        try requireOnline()
        guard let index = issues.firstIndex(where: { $0.id == id }) else { return }
        issues[index].status = status
        issues[index].resolvedAt = status == .resolved ? .now : nil
        issues[index].resolvedByTeacherID = status == .resolved ? teacher.id : nil
        auditEvents.append(AuditEvent(id: UUID().uuidString, kind: .issueUpdated, actorID: teacher.id, equipmentIDs: [issues[index].equipmentID], claimIDs: [issues[index].claimID], createdAt: .now))
        persist()
    }

    func markNotificationRead(_ id: String) {
        guard let index = notifications.firstIndex(where: { $0.id == id }) else { return }
        notifications[index].isRead = true
        persist()
    }

    func processOverdue(now: Date = .now, threshold: TimeInterval = 24 * 60 * 60) {
        let overdueClaims = claims.filter { $0.status == .active && now.timeIntervalSince($0.checkedOutAt) >= threshold }
        for claim in overdueClaims {
            let studentExists = notifications.contains {
                $0.kind == .overdue && $0.claimID == claim.id && $0.recipientRole == .student
            }
            if !studentExists {
                notifications.append(GearNotification(
                    id: UUID().uuidString,
                    kind: .overdue,
                    recipientRole: .student,
                    recipientUserID: claim.studentID,
                    title: "Equipment return overdue",
                    message: "An equipment item is overdue for return.",
                    equipmentIDs: [claim.equipmentID],
                    claimID: claim.id,
                    createdAt: now,
                    isRead: false
                ))
            }
            let teacherExists = notifications.contains {
                $0.kind == .overdue && $0.claimID == claim.id && $0.recipientRole == .teacher
            }
            if !teacherExists {
                notifications.append(GearNotification(
                    id: UUID().uuidString,
                    kind: .overdue,
                    recipientRole: .teacher,
                    recipientUserID: nil,
                    title: "Overdue equipment",
                    message: "An active equipment claim is overdue.",
                    equipmentIDs: [claim.equipmentID],
                    claimID: claim.id,
                    createdAt: now,
                    isRead: false
                ))
            }
        }
        if !overdueClaims.isEmpty { persist() }
    }

    func equipment(withID id: String) -> Equipment? {
        equipment.first { $0.id == id }
    }

    private func requireOnline() throws {
        guard isOnline else { throw TrakrError.offline }
    }

    private func validate(name: String, serial: String) throws {
        guard (1...100).contains(name.count) else { throw TrakrError.invalidName }
        guard (1...50).contains(serial.count) else { throw TrakrError.invalidSerial }
    }

    private func requireStudent() throws -> GearUser {
        guard let user = currentUser, user.role == .student else { throw TrakrError.unsupportedDomain }
        return user
    }

    private func requireTeacher() throws -> GearUser {
        guard let user = currentUser, user.role == .teacher else { throw TrakrError.unsupportedDomain }
        return user
    }

    private func persist() {
        persistence.save(StoreSnapshot(
            equipment: equipment,
            claims: claims,
            issues: issues,
            notifications: notifications,
            auditEvents: auditEvents,
            inactiveTagIDs: inactiveTagIDs,
            requestResults: requestResults
        ))
    }

    private static var seedSnapshot: StoreSnapshot {
        let camera = Equipment(id: "eq-camera", name: "Canon R50", internalSerial: "MC-CAM-01", tagID: "tr:01J9Z6M4Y7X3N8K2D5P0Q1R4TC", hardwareUID: "04A1B2C3D4E5F6", isActive: true, enrolledAt: .now)
        let tripod = Equipment(id: "eq-tripod", name: "Manfrotto Tripod", internalSerial: "MC-TRI-02", tagID: "tr:01J9Z6M4Y7X3N8K2D5P0Q1R4TD", hardwareUID: "04A1B2C3D4E5F7", isActive: true, enrolledAt: .now)
        let mic = Equipment(id: "eq-mic", name: "RØDE Wireless GO", internalSerial: "AV-MIC-03", tagID: "tr:01J9Z6M4Y7X3N8K2D5P0Q1R4TE", hardwareUID: "04A1B2C3D4E5F8", isActive: true, enrolledAt: .now)
        return StoreSnapshot(equipment: [camera, tripod, mic])
    }
}
