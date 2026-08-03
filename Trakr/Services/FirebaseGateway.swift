import FirebaseAuth
@preconcurrency import FirebaseFirestore
import GoogleSignIn
import UIKit

@MainActor
final class FirebaseGateway {
    private lazy var database = Firestore.firestore()

    var currentUser: GearUser? {
        guard let user = Auth.auth().currentUser, let email = user.email?.lowercased(),
              let role = try? RoleDeriver.role(for: email) else { return nil }
        return GearUser(
            id: user.uid,
            email: email,
            displayName: user.displayName ?? email.split(separator: "@").first.map(String.init) ?? role.title,
            role: role
        )
    }

    func signIn() async throws -> GearUser {
        guard let presenting = UIApplication.shared.trakrPresentingViewController else {
            throw FirebaseGatewayError.noPresentingViewController
        }
        let result = try await GIDSignIn.sharedInstance.signIn(withPresenting: presenting)
        guard let idToken = result.user.idToken?.tokenString else {
            throw FirebaseGatewayError.missingIDToken
        }
        let credential = GoogleAuthProvider.credential(
            withIDToken: idToken,
            accessToken: result.user.accessToken.tokenString
        )
        let authentication = try await Auth.auth().signIn(with: credential)
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
        return user
    }

    func signOut() throws {
        GIDSignIn.sharedInstance.signOut()
        try Auth.auth().signOut()
    }

    func snapshot(for user: GearUser) async throws -> StoreSnapshot {
        async let claimDocuments = claimsQuery(for: user).getDocuments()
        async let issueDocuments = issuesQuery(for: user).getDocuments()
        async let equipmentDocuments = database.collection("equipment").getDocuments()

        let (claimSnapshot, issueSnapshot, equipmentSnapshot) = try await (
            claimDocuments,
            issueDocuments,
            equipmentDocuments
        )
        return StoreSnapshot(
            equipment: equipmentSnapshot.documents.compactMap(Self.equipment(from:)),
            claims: claimSnapshot.documents.compactMap(Self.claim(from:)),
            issues: issueSnapshot.documents.compactMap(Self.issue(from:))
        )
    }

    func resolve(tagID: String) async throws -> Equipment {
        let tag = try await database.collection("tags").document(tagID).getDocument()
        guard tag.exists else { throw TrakrError.unknownTag }
        guard tag.get("status") as? String == "active" else { throw TrakrError.inactiveTag }
        guard let equipmentID = tag.get("equipmentId") as? String else { throw TrakrError.unknownTag }
        let equipmentDocument = try await database.collection("equipment").document(equipmentID).getDocument()
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
        let batchReference = database.collection("checkoutBatches").document(requestID)
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
            let claimReference = database.collection("claims").document()
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
                let issueReference = database.collection("issues").document()
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
        ], forDocument: database.collection("returnBatches").document(requestID))
        for claimID in claimIDs {
            batch.updateData([
                "status": "returned",
                "returnBatchId": requestID,
                "returnedAt": FieldValue.serverTimestamp(),
                "returnedByTeacherUid": user.id,
            ], forDocument: database.collection("claims").document(claimID))
        }
        try await batch.commit()
        return ReturnReceipt(batchID: requestID, resolvedClaimIDs: claimIDs, resolvedCount: claimIDs.count)
    }

    func enroll(name: String, serial: String, tagID: String, hardwareUID: String) async throws {
        guard let user = currentUser, user.role == .teacher else { throw FirebaseGatewayError.teacherRequired }
        let cleanName = name.trimmingCharacters(in: .whitespacesAndNewlines)
        guard (1...100).contains(cleanName.count) else { throw TrakrError.invalidName }
        let cleanSerial = try Self.normalizedSerial(serial)
        let equipmentReference = database.collection("equipment").document()
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
        ], forDocument: database.collection("tags").document(tagID))
        batch.setData([
            "equipmentId": equipmentReference.documentID,
            "normalizedSerial": cleanSerial,
            "createdAt": FieldValue.serverTimestamp(),
        ], forDocument: database.collection("equipmentSerials").document(cleanSerial))
        try await batch.commit()
    }

    func updateEquipment(id: String, name: String, serial: String, isActive: Bool) async throws {
        guard let user = currentUser, user.role == .teacher else { throw FirebaseGatewayError.teacherRequired }
        let cleanName = name.trimmingCharacters(in: .whitespacesAndNewlines)
        guard (1...100).contains(cleanName.count) else { throw TrakrError.invalidName }
        let reference = database.collection("equipment").document(id)
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
            ], forDocument: database.collection("equipmentSerials").document(cleanSerial))
            batch.deleteDocument(database.collection("equipmentSerials").document(oldSerial))
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

    func replaceTag(equipmentID: String, tagID: String, hardwareUID: String) async throws {
        guard let user = currentUser, user.role == .teacher else { throw FirebaseGatewayError.teacherRequired }
        let equipmentReference = database.collection("equipment").document(equipmentID)
        let equipment = try await equipmentReference.getDocument()
        guard let oldTagID = equipment.get("activeTagId") as? String else {
            throw FirebaseGatewayError.missingEquipment
        }
        let batch = database.batch()
        batch.updateData([
            "status": "replaced",
            "replacedAt": FieldValue.serverTimestamp(),
            "replacedBy": user.id,
        ], forDocument: database.collection("tags").document(oldTagID))
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
        ], forDocument: database.collection("tags").document(tagID))
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
        try await database.collection("issues").document(id).updateData([
            "status": status.rawValue,
            "resolvedAt": status == .resolved ? FieldValue.serverTimestamp() : NSNull(),
            "resolvedByTeacherUid": status == .resolved ? user.id : NSNull(),
        ])
    }

    private func upsertProfile(_ user: GearUser) async throws {
        let reference = database.collection("users").document(user.id)
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
            ? database.collection("claims").order(by: "checkedOutAt", descending: true)
            : database.collection("claims")
                .whereField("studentUid", isEqualTo: user.id)
                .order(by: "checkedOutAt", descending: true)
    }

    private func issuesQuery(for user: GearUser) -> Query {
        user.role == .teacher
            ? database.collection("issues").order(by: "reportedAt", descending: true)
            : database.collection("issues")
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
    case missingIDToken
    case unverifiedEmail
    case studentRequired
    case teacherRequired
    case missingEquipment

    var errorDescription: String? {
        switch self {
        case .noPresentingViewController: "Unable to present Google Sign-In."
        case .missingIDToken: "Google did not return an identity token."
        case .unverifiedEmail: "Verify your school Google account before signing in."
        case .studentRequired: "A student account is required for checkout."
        case .teacherRequired: "A teacher account is required for this action."
        case .missingEquipment: "The equipment record no longer exists."
        }
    }
}

private extension UIApplication {
    var trakrPresentingViewController: UIViewController? {
        connectedScenes
            .compactMap { $0 as? UIWindowScene }
            .flatMap(\.windows)
            .first(where: \.isKeyWindow)?
            .rootViewController
    }
}
