import FirebaseAuth
import FirebaseCore
@preconcurrency import FirebaseFirestore
import GoogleSignIn
import OSLog
import UIKit

private extension Array {
    func chunked(into size: Int) -> [[Element]] {
        stride(from: 0, to: count, by: size).map { start in
            Array(self[start ..< Swift.min(start + size, count)])
        }
    }
}

@MainActor
final class FirebaseGateway {
    private lazy var database = Firestore.firestore()

    private static let demoRoleDefaultsKey = "trakr.demoRole"

    private(set) var isDemoSession = false
    /// Authoritative signed-in user for this app session. Anonymous demo accounts
    /// have no email on the Firebase user, so role must not be re-derived from Auth alone.
    private var sessionUser: GearUser?

    var currentUser: GearUser? {
        if let sessionUser { return sessionUser }
        return adoptPersistedAuthSession()
    }

    private func collection(_ name: String) -> CollectionReference {
        database.collection(name)
    }

    /// Rebuild session state after process launch from Firebase Auth + demo role defaults.
    @discardableResult
    private func adoptPersistedAuthSession() -> GearUser? {
        if let authUser = Auth.auth().currentUser, authUser.isAnonymous,
           let raw = UserDefaults.standard.string(forKey: Self.demoRoleDefaultsKey),
           let role = UserRole(rawValue: raw) {
            isDemoSession = true
            let user = demoUser(role: role, uid: authUser.uid)
            sessionUser = user
            return user
        }
        guard let authUser = Auth.auth().currentUser,
              let email = authUser.email?.lowercased(),
              let role = try? RoleDeriver.role(for: email) else { return nil }
        isDemoSession = false
        let user = GearUser(
            id: authUser.uid,
            email: email,
            displayName: authUser.displayName ?? email.split(separator: "@").first.map(String.init) ?? role.title,
            role: role
        )
        sessionUser = user
        return user
    }

    func signIn() async throws -> GearUser {
        let logger = Logger.signIn
        guard FirebaseApp.app()?.options.clientID != nil else {
            logger.error("Google sign-in aborted: Firebase clientID missing; GoogleService-Info.plist was not loaded.")
            throw FirebaseGatewayError.missingClientID
        }
        guard let presenting = UIApplication.shared.trakrPresentingViewController else {
            logger.error("Google sign-in aborted: no presenting view controller available.")
            throw FirebaseGatewayError.noPresentingViewController
        }
        // Leave any prior anonymous demo session before exchanging a school credential.
        sessionUser = nil
        clearDemoSessionState()
        logger.info("Presenting Google sign-in.")
        let result: GIDSignInResult
        do {
            let presentingBox = UnsafeSendableBox(value: presenting)
            result = try await withSignInTimeout {
                try await GIDSignIn.sharedInstance.signIn(withPresenting: presentingBox.value)
            }
        } catch let error as GIDSignInError where error.code == .canceled {
            logger.info("Google sign-in cancelled by user.")
            throw CancellationError()
        }
        logger.info("Google sign-in returned; exchanging credential with Firebase.")
        guard let idToken = result.user.idToken?.tokenString else {
            logger.error("Google sign-in did not return an ID token.")
            throw FirebaseGatewayError.missingIDToken
        }
        let credential = GoogleAuthProvider.credential(
            withIDToken: idToken,
            accessToken: result.user.accessToken.tokenString
        )
        let authentication = try await Auth.auth().signIn(with: credential)
        logger.info("Firebase authentication succeeded.")
        guard authentication.user.isEmailVerified else {
            try? Auth.auth().signOut()
            throw FirebaseGatewayError.unverifiedEmail
        }

        let email = authentication.user.email?.lowercased() ?? ""
        let role = try RoleDeriver.role(for: email)
        let displayName = authentication.user.displayName
            ?? email.split(separator: "@").first.map(String.init)
            ?? role.title
        let user = GearUser(
            id: authentication.user.uid,
            email: email,
            displayName: displayName,
            role: role
        )
        try await upsertProfile(user)
        sessionUser = user
        logger.info("Profile upserted; sign-in complete.")
        return user
    }

    private func withSignInTimeout(
        seconds: UInt64 = 45,
        operation: @escaping @Sendable () async throws -> GIDSignInResult
    ) async throws -> GIDSignInResult {
        try await withThrowingTaskGroup(of: UnsafeSendableBox<GIDSignInResult>.self) { group in
            group.addTask {
                UnsafeSendableBox(value: try await operation())
            }
            group.addTask {
                try await Task.sleep(nanoseconds: seconds * 1_000_000_000)
                throw FirebaseGatewayError.signInTimedOut
            }
            defer { group.cancelAll() }
            return try await group.next()!.value
        }
    }

    // MARK: - Demo sessions (anonymous auth; shared inventory with school accounts)

    func restoreDemoSession() -> GearUser? {
        adoptPersistedAuthSession().flatMap { user in
            isDemoSession ? user : nil
        }
    }

    func signInDemo(role: UserRole) async throws -> GearUser {
        GIDSignIn.sharedInstance.signOut()
        try? Auth.auth().signOut()
        sessionUser = nil
        isDemoSession = false
        UserDefaults.standard.removeObject(forKey: Self.demoRoleDefaultsKey)
        _ = try await Auth.auth().signInAnonymously()
        isDemoSession = true
        UserDefaults.standard.set(role.rawValue, forKey: Self.demoRoleDefaultsKey)
        let user = demoUser(role: role)
        sessionUser = user
        try await upsertDemoProfile(user)
        Logger.signIn.info("Demo \(role.rawValue, privacy: .public) signed in anonymously.")
        return user
    }

    func demoUser(role: UserRole, uid: String? = nil) -> GearUser {
        GearUser(
            id: uid ?? Auth.auth().currentUser?.uid ?? "demo-\(role.rawValue)",
            email: role == .teacher ? "demo.teacher@sst.edu.sg" : "alex.lim@s2026.ssts.edu.sg",
            displayName: role == .teacher ? "Ms Tan" : "Alex Lim",
            role: role
        )
    }

    func seedDemoDataIfNeeded() async throws {
        guard let user = currentUser, user.role == .teacher else { throw FirebaseGatewayError.teacherRequired }
        let existing = try await collection("equipment").limit(to: 1).getDocuments()
        guard existing.documents.isEmpty else { return }
        let batch = database.batch()
        for item in DemoSeed.items {
            batch.setData([
                "equipmentId": item.equipmentID,
                "name": item.name,
                "internalSerial": item.serial,
                "normalizedInternalSerial": item.serial,
                "activeTagId": item.tagID,
                "status": "active",
                "enrolledBy": user.id,
                "enrolledAt": FieldValue.serverTimestamp(),
                "updatedBy": user.id,
                "updatedAt": FieldValue.serverTimestamp(),
            ], forDocument: collection("equipment").document(item.equipmentID))
            batch.setData([
                "tagId": item.tagID,
                "equipmentId": item.equipmentID,
                "hardwareUidHex": item.hardwareUID,
                "chipFamily": "NFC Forum Type 2",
                "status": "active",
                "enrolledBy": user.id,
                "enrolledAt": FieldValue.serverTimestamp(),
                "replacedAt": NSNull(),
                "replacedBy": NSNull(),
            ], forDocument: collection("tags").document(item.tagID))
            batch.setData([
                "equipmentId": item.equipmentID,
                "normalizedSerial": item.serial,
                "createdAt": FieldValue.serverTimestamp(),
            ], forDocument: collection("equipmentSerials").document(item.serial))
        }
        try await batch.commit()
    }

    private func upsertDemoProfile(_ user: GearUser) async throws {
        // Role for anonymous demo auth only; inventory uses the shared collections.
        try await database.collection("demoUsers").document(user.id).setData([
            "uid": user.id,
            "displayName": user.displayName,
            "role": user.role.rawValue,
            "demo": true,
            "createdAt": FieldValue.serverTimestamp(),
            "updatedAt": FieldValue.serverTimestamp(),
            "lastLoginAt": FieldValue.serverTimestamp(),
        ])
    }

    func signOut() throws {
        GIDSignIn.sharedInstance.signOut()
        try Auth.auth().signOut()
        sessionUser = nil
        clearDemoSessionState()
    }

    private func clearDemoSessionState() {
        isDemoSession = false
        UserDefaults.standard.removeObject(forKey: Self.demoRoleDefaultsKey)
    }

    func snapshot(for user: GearUser) async throws -> StoreSnapshot {
        // Load independently so a missing student history index does not block sign-in
        // or wipe the inventory the Collect/Return flows need.
        async let claims = loadClaims(for: user)
        async let issues = loadIssues(for: user)
        async let equipmentDocuments = collection("equipment").getDocuments()

        let equipmentSnapshot = try await equipmentDocuments
        return StoreSnapshot(
            equipment: equipmentSnapshot.documents.compactMap(Self.equipment(from:)),
            claims: await claims,
            issues: await issues
        )
    }

    private func loadClaims(for user: GearUser) async -> [Claim] {
        do {
            return try await claimsQuery(for: user).getDocuments().documents.compactMap(Self.claim(from:))
        } catch {
            Logger.signIn.error("Claims snapshot failed: \(error.localizedDescription, privacy: .public)")
            return []
        }
    }

    private func loadIssues(for user: GearUser) async -> [EquipmentIssue] {
        do {
            return try await issuesQuery(for: user).getDocuments().documents.compactMap(Self.issue(from:))
        } catch {
            Logger.signIn.error("Issues snapshot failed: \(error.localizedDescription, privacy: .public)")
            return []
        }
    }

    func resolve(tagID: String) async throws -> Equipment {
        let tag = try await collection("tags").document(tagID).getDocument()
        guard tag.exists else { throw TrakrError.unknownTag }
        guard tag.get("status") as? String == "active" else { throw TrakrError.inactiveTag }
        guard let equipmentID = tag.get("equipmentId") as? String else { throw TrakrError.unknownTag }
        let equipmentDocument = try await collection("equipment").document(equipmentID).getDocument()
        guard let equipment = Self.equipment(from: equipmentDocument), equipment.isActive else {
            throw TrakrError.inactiveTag
        }
        return equipment
    }

    func checkout(items: [StagedCheckoutItem], requestID: String) async throws -> CheckoutReceipt {
        guard let user = currentUser, user.role == .student else { throw FirebaseGatewayError.studentRequired }
        guard !items.isEmpty else { throw TrakrError.emptyBatch }
        guard items.count <= 20 else { throw TrakrError.batchTooLarge }

        let batch = database.batch()
        let batchReference = collection("checkoutBatches").document(requestID)
        batch.setData([
            "batchId": requestID,
            "studentUid": user.id,
            "studentEmail": user.email,
            "itemCount": items.count,
            "createdAt": FieldValue.serverTimestamp(),
        ], forDocument: batchReference)

        var claimIDs: [String] = []
        for item in items {
            let issueText = item.issueText.trimmingCharacters(in: .whitespacesAndNewlines)
            if item.hasIssue && issueText.isEmpty { throw TrakrError.invalidIssue }
            let claimReference = collection("claims").document()
            claimIDs.append(claimReference.documentID)
            batch.setData([
                "claimId": claimReference.documentID,
                "checkoutBatchId": requestID,
                "returnBatchId": NSNull(),
                "equipmentId": item.equipment.id,
                "tagIdAtCheckout": item.equipment.tagID,
                "studentUid": user.id,
                "studentEmail": user.email,
                "condition": item.hasIssue ? "has_issue" : "no_issues",
                "issueText": item.hasIssue ? issueText : NSNull(),
                "status": "active",
                "checkedOutAt": FieldValue.serverTimestamp(),
                "returnedAt": NSNull(),
                "returnedByTeacherUid": NSNull(),
                "overdueNotificationSentAt": NSNull(),
            ], forDocument: claimReference)

            if item.hasIssue {
                let issueReference = collection("issues").document()
                batch.setData([
                    "issueId": issueReference.documentID,
                    "claimId": claimReference.documentID,
                    "equipmentId": item.equipment.id,
                    "reportedByStudentUid": user.id,
                    "text": issueText,
                    "status": "open",
                    "reportedAt": FieldValue.serverTimestamp(),
                    "resolvedAt": NSNull(),
                    "resolvedByTeacherUid": NSNull(),
                ], forDocument: issueReference)
            }
        }
        try await batch.commit()
        return CheckoutReceipt(id: requestID, equipment: items.map(\.equipment), claimIDs: claimIDs, timestamp: .now)
    }

    func returnItems(_ items: [ReturnCandidate], requestID: String) async throws -> ReturnReceipt {
        guard let user = currentUser, user.role == .teacher else { throw FirebaseGatewayError.teacherRequired }
        let claimIDs = Array(Set(items.flatMap(\.activeClaims).map(\.id)))
        let batch = database.batch()
        batch.setData([
            "batchId": requestID,
            "teacherUid": user.id,
            "claimCount": claimIDs.count,
            "createdAt": FieldValue.serverTimestamp(),
        ], forDocument: collection("returnBatches").document(requestID))
        for claimID in claimIDs {
            batch.updateData([
                "status": "returned",
                "returnBatchId": requestID,
                "returnedAt": FieldValue.serverTimestamp(),
                "returnedByTeacherUid": user.id,
            ], forDocument: collection("claims").document(claimID))
        }
        try await batch.commit()
        return ReturnReceipt(batchID: requestID, resolvedClaimIDs: claimIDs, resolvedCount: claimIDs.count)
    }

    func enroll(name: String, serial: String, tagID: String, hardwareUID: String) async throws {
        guard let user = currentUser, user.role == .teacher else { throw FirebaseGatewayError.teacherRequired }
        let cleanName = name.trimmingCharacters(in: .whitespacesAndNewlines)
        guard (1...100).contains(cleanName.count) else { throw TrakrError.invalidName }
        let cleanSerial = try Self.normalizedSerial(serial)
        let equipmentReference = collection("equipment").document()
        let batch = database.batch()
        batch.setData([
            "equipmentId": equipmentReference.documentID,
            "name": cleanName,
            "internalSerial": cleanSerial,
            "normalizedInternalSerial": cleanSerial,
            "activeTagId": tagID,
            "status": "active",
            "enrolledBy": user.id,
            "enrolledAt": FieldValue.serverTimestamp(),
            "updatedBy": user.id,
            "updatedAt": FieldValue.serverTimestamp(),
        ], forDocument: equipmentReference)
        batch.setData([
            "tagId": tagID,
            "equipmentId": equipmentReference.documentID,
            "hardwareUidHex": hardwareUID.uppercased(),
            "chipFamily": "NFC Forum Type 2",
            "status": "active",
            "enrolledBy": user.id,
            "enrolledAt": FieldValue.serverTimestamp(),
            "replacedAt": NSNull(),
            "replacedBy": NSNull(),
        ], forDocument: collection("tags").document(tagID))
        batch.setData([
            "equipmentId": equipmentReference.documentID,
            "normalizedSerial": cleanSerial,
            "createdAt": FieldValue.serverTimestamp(),
        ], forDocument: collection("equipmentSerials").document(cleanSerial))
        try await batch.commit()
    }

    func updateEquipment(id: String, name: String, serial: String, isActive: Bool) async throws {
        guard let user = currentUser, user.role == .teacher else { throw FirebaseGatewayError.teacherRequired }
        let cleanName = name.trimmingCharacters(in: .whitespacesAndNewlines)
        guard (1...100).contains(cleanName.count) else { throw TrakrError.invalidName }
        let reference = collection("equipment").document(id)
        let existing = try await reference.getDocument()
        guard existing.exists, let oldSerial = existing.get("normalizedInternalSerial") as? String else {
            throw FirebaseGatewayError.missingEquipment
        }
        let cleanSerial = try Self.normalizedSerial(serial)
        let batch = database.batch()
        if cleanSerial != oldSerial {
            batch.setData([
                "equipmentId": id,
                "normalizedSerial": cleanSerial,
                "createdAt": FieldValue.serverTimestamp(),
            ], forDocument: collection("equipmentSerials").document(cleanSerial))
            batch.deleteDocument(collection("equipmentSerials").document(oldSerial))
        }
        batch.updateData([
            "name": cleanName,
            "internalSerial": cleanSerial,
            "normalizedInternalSerial": cleanSerial,
            "status": isActive ? "active" : "retired",
            "updatedBy": user.id,
            "updatedAt": FieldValue.serverTimestamp(),
        ], forDocument: reference)
        try await batch.commit()
    }

    func deleteEquipment(id: String) async throws {
        guard let user = currentUser, user.role == .teacher else { throw FirebaseGatewayError.teacherRequired }
        let equipmentReference = collection("equipment").document(id)
        let equipment = try await equipmentReference.getDocument()
        guard equipment.exists else { throw FirebaseGatewayError.missingEquipment }

        if equipment.get("status") as? String != "retired" {
            try await equipmentReference.updateData([
                "status": "retired",
                "updatedBy": user.id,
                "updatedAt": FieldValue.serverTimestamp(),
            ])
        }

        async let tagDocuments = collection("tags")
            .whereField("equipmentId", isEqualTo: id)
            .getDocuments()
        async let serialDocuments = collection("equipmentSerials")
            .whereField("equipmentId", isEqualTo: id)
            .getDocuments()
        async let claimDocuments = collection("claims")
            .whereField("equipmentId", isEqualTo: id)
            .getDocuments()
        async let issueDocuments = collection("issues")
            .whereField("equipmentId", isEqualTo: id)
            .getDocuments()

        let (tags, serials, claims, issues) = try await (
            tagDocuments,
            serialDocuments,
            claimDocuments,
            issueDocuments
        )
        let relatedReferences = tags.documents.map(\.reference)
            + serials.documents.map(\.reference)
            + claims.documents.map(\.reference)
            + issues.documents.map(\.reference)

        for references in relatedReferences.chunked(into: 400) {
            let batch = database.batch()
            references.forEach { batch.deleteDocument($0) }
            try await batch.commit()
        }

        try await equipmentReference.delete()
    }

    func replaceTag(equipmentID: String, tagID: String, hardwareUID: String) async throws {
        guard let user = currentUser, user.role == .teacher else { throw FirebaseGatewayError.teacherRequired }
        let equipmentReference = collection("equipment").document(equipmentID)
        let equipment = try await equipmentReference.getDocument()
        guard let oldTagID = equipment.get("activeTagId") as? String else {
            throw FirebaseGatewayError.missingEquipment
        }
        let batch = database.batch()
        batch.updateData([
            "status": "replaced",
            "replacedAt": FieldValue.serverTimestamp(),
            "replacedBy": user.id,
        ], forDocument: collection("tags").document(oldTagID))
        batch.setData([
            "tagId": tagID,
            "equipmentId": equipmentID,
            "hardwareUidHex": hardwareUID.uppercased(),
            "chipFamily": "NFC Forum Type 2",
            "status": "active",
            "enrolledBy": user.id,
            "enrolledAt": FieldValue.serverTimestamp(),
            "replacedAt": NSNull(),
            "replacedBy": NSNull(),
        ], forDocument: collection("tags").document(tagID))
        batch.updateData([
            "activeTagId": tagID,
            "status": "active",
            "updatedBy": user.id,
            "updatedAt": FieldValue.serverTimestamp(),
        ], forDocument: equipmentReference)
        try await batch.commit()
    }

    func updateIssue(id: String, status: IssueStatus) async throws {
        guard let user = currentUser, user.role == .teacher else { throw FirebaseGatewayError.teacherRequired }
        try await collection("issues").document(id).updateData([
            "status": status.rawValue,
            "resolvedAt": status == .resolved ? FieldValue.serverTimestamp() : NSNull(),
            "resolvedByTeacherUid": status == .resolved ? user.id : NSNull(),
        ])
    }

    private func upsertProfile(_ user: GearUser) async throws {
        let reference = collection("users").document(user.id)
        let snapshot = try await reference.getDocument()
        if snapshot.exists {
            try await reference.updateData([
                "displayName": user.displayName,
                "active": true,
                "updatedAt": FieldValue.serverTimestamp(),
                "lastLoginAt": FieldValue.serverTimestamp(),
            ])
        } else {
            try await reference.setData([
                "uid": user.id,
                "email": user.email,
                "displayName": user.displayName,
                "role": user.role.rawValue,
                "emailDomain": user.email.split(separator: "@").last.map(String.init) ?? "",
                "active": true,
                "createdAt": FieldValue.serverTimestamp(),
                "updatedAt": FieldValue.serverTimestamp(),
                "lastLoginAt": FieldValue.serverTimestamp(),
            ])
        }
    }

    private func claimsQuery(for user: GearUser) -> Query {
        user.role == .teacher
            ? collection("claims").order(by: "checkedOutAt", descending: true)
            : collection("claims")
                .whereField("studentUid", isEqualTo: user.id)
                .order(by: "checkedOutAt", descending: true)
    }

    private func issuesQuery(for user: GearUser) -> Query {
        user.role == .teacher
            ? collection("issues").order(by: "reportedAt", descending: true)
            : collection("issues")
                .whereField("reportedByStudentUid", isEqualTo: user.id)
                .order(by: "reportedAt", descending: true)
    }

    private static func normalizedSerial(_ serial: String) throws -> String {
        let value = serial.trimmingCharacters(in: .whitespacesAndNewlines).uppercased()
        guard value.range(of: #"^[A-Z0-9_-]{1,50}$"#, options: .regularExpression) != nil else {
            throw TrakrError.invalidSerial
        }
        return value
    }

    private static func equipment(from document: DocumentSnapshot) -> Equipment? {
        guard let data = document.data(), let name = data["name"] as? String else { return nil }
        return Equipment(
            id: document.documentID,
            name: name,
            internalSerial: data["internalSerial"] as? String ?? "",
            tagID: data["activeTagId"] as? String ?? "",
            hardwareUID: "",
            isActive: data["status"] as? String == "active",
            enrolledAt: (data["enrolledAt"] as? Timestamp)?.dateValue() ?? .distantPast
        )
    }

    private static func claim(from document: QueryDocumentSnapshot) -> Claim? {
        let data = document.data()
        guard let equipmentID = data["equipmentId"] as? String else { return nil }
        return Claim(
            id: document.documentID,
            checkoutBatchID: data["checkoutBatchId"] as? String ?? "",
            returnBatchID: data["returnBatchId"] as? String,
            equipmentID: equipmentID,
            tagIDAtCheckout: data["tagIdAtCheckout"] as? String ?? "",
            studentID: data["studentUid"] as? String ?? "",
            studentEmail: data["studentEmail"] as? String ?? "",
            condition: ItemCondition(rawValue: data["condition"] as? String ?? "") ?? .noIssues,
            issueText: data["issueText"] as? String,
            status: ClaimStatus(rawValue: data["status"] as? String ?? "") ?? .active,
            checkedOutAt: (data["checkedOutAt"] as? Timestamp)?.dateValue() ?? .distantPast,
            returnedAt: (data["returnedAt"] as? Timestamp)?.dateValue(),
            returnedByTeacherID: data["returnedByTeacherUid"] as? String
        )
    }

    private static func issue(from document: QueryDocumentSnapshot) -> EquipmentIssue? {
        let data = document.data()
        guard let claimID = data["claimId"] as? String,
              let equipmentID = data["equipmentId"] as? String else { return nil }
        return EquipmentIssue(
            id: document.documentID,
            claimID: claimID,
            equipmentID: equipmentID,
            reportedByStudentID: data["reportedByStudentUid"] as? String ?? "",
            reportedByStudentEmail: "",
            text: data["text"] as? String ?? "",
            status: IssueStatus(rawValue: data["status"] as? String ?? "") ?? .open,
            reportedAt: (data["reportedAt"] as? Timestamp)?.dateValue() ?? .distantPast,
            resolvedAt: (data["resolvedAt"] as? Timestamp)?.dateValue(),
            resolvedByTeacherID: data["resolvedByTeacherUid"] as? String
        )
    }
}

enum FirebaseGatewayError: LocalizedError {
    case noPresentingViewController
    case missingClientID
    case missingIDToken
    case signInTimedOut
    case unverifiedEmail
    case studentRequired
    case teacherRequired
    case missingEquipment

    var errorDescription: String? {
        switch self {
        case .noPresentingViewController: "Unable to present Google Sign-In."
        case .missingClientID: "Google sign-in is not configured. Reinstall the app with a valid GoogleService-Info.plist."
        case .missingIDToken: "Google did not return an identity token."
        case .signInTimedOut: "Google sign-in timed out. Check your connection and that your school account allows this app, then try again."
        case .unverifiedEmail: "Verify your school Google account before signing in."
        case .studentRequired: "A student account is required for checkout."
        case .teacherRequired: "A teacher account is required for this action."
        case .missingEquipment: "The equipment record no longer exists."
        }
    }
}

private struct UnsafeSendableBox<T>: @unchecked Sendable {
    let value: T
}

private enum DemoSeed {
    struct Item {
        let equipmentID: String
        let name: String
        let serial: String
        let tagID: String
        let hardwareUID: String
    }

    static let items: [Item] = [
        Item(equipmentID: "eq-camera", name: "Canon R50", serial: "MC-CAM-01", tagID: "tr:01J9Z6M4Y7X3N8K2D5P0Q1R4TC", hardwareUID: "04A1B2C3D4E5F6"),
        Item(equipmentID: "eq-tripod", name: "Manfrotto Tripod", serial: "MC-TRI-02", tagID: "tr:01J9Z6M4Y7X3N8K2D5P0Q1R4TD", hardwareUID: "04A1B2C3D4E5F7"),
        Item(equipmentID: "eq-mic", name: "RØDE Wireless GO", serial: "AV-MIC-03", tagID: "tr:01J9Z6M4Y7X3N8K2D5P0Q1R4TE", hardwareUID: "04A1B2C3D4E5F8"),
    ]
}

private extension Logger {
    static let signIn = Logger(subsystem: "systems.edmundlim.trakr", category: "SignIn")
}

private extension UIApplication {
    var trakrPresentingViewController: UIViewController? {
        let scenes = connectedScenes
            .compactMap { $0 as? UIWindowScene }
        let activeScenes = scenes.filter { $0.activationState == .foregroundActive }
        let root = (activeScenes.isEmpty ? scenes : activeScenes)
            .flatMap(\.windows)
            .first(where: \.isKeyWindow)?
            .rootViewController
        var topmost = root
        while let presented = topmost?.presentedViewController {
            topmost = presented
        }
        return topmost
    }
}
