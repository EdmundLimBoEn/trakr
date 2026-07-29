import FirebaseAuth
@preconcurrency import FirebaseFirestore
import FirebaseFunctions
import FirebaseInstallations
import FirebaseMessaging
import GoogleSignIn
import UIKit

@MainActor
final class FirebaseGateway {
    private lazy var database = Firestore.firestore()
    private lazy var functions = Functions.functions(region: "asia-southeast1")

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

    @MainActor
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
        _ = try await functions.httpsCallable("initializeUser").call([:])
        _ = try await authentication.user.getIDTokenResult(forcingRefresh: true)
        let email = authentication.user.email?.lowercased() ?? ""
        let role = try RoleDeriver.role(for: email)
        let user = GearUser(
            id: authentication.user.uid,
            email: email,
            displayName: authentication.user.displayName ?? email.split(separator: "@").first.map(String.init) ?? role.title,
            role: role
        )
        Task { try? await registerDevice() }
        return user
    }

    func signOut() throws {
        GIDSignIn.sharedInstance.signOut()
        try Auth.auth().signOut()
    }

    func snapshot(for user: GearUser) async throws -> StoreSnapshot {
        async let claimDocuments = claimsQuery(for: user).getDocuments()
        async let issueDocuments = issuesQuery(for: user).getDocuments()
        async let equipmentDocuments: QuerySnapshot? = user.role == .teacher
            ? database.collection("equipment").getDocuments()
            : nil

        let (claimSnapshot, issueSnapshot, equipmentSnapshot) = try await (
            claimDocuments,
            issueDocuments,
            equipmentDocuments
        )
        let equipment = equipmentSnapshot?.documents.compactMap(Self.equipment(from:)) ?? []
        let claims = claimSnapshot.documents.compactMap(Self.claim(from:))
        let issues = issueSnapshot.documents.compactMap(Self.issue(from:))
        return StoreSnapshot(equipment: equipment, claims: claims, issues: issues)
    }

    func resolve(tagID: String) async throws -> Equipment {
        let result = try await functions.httpsCallable("resolveTags").call(["tagIds": [tagID]])
        guard let payload = result.data as? [String: Any],
              let first = (payload["results"] as? [[String: Any]])?.first else {
            throw TrakrError.unknownTag
        }
        guard first["status"] as? String == "active" else {
            throw first["status"] as? String == "inactive" ? TrakrError.inactiveTag : TrakrError.unknownTag
        }
        guard let raw = first["equipment"] as? [String: Any],
              let id = raw["equipmentId"] as? String,
              let name = raw["name"] as? String else {
            throw TrakrError.unknownTag
        }
        return Equipment(
            id: id,
            name: name,
            internalSerial: raw["internalSerial"] as? String ?? "",
            tagID: tagID,
            hardwareUID: "",
            isActive: true,
            enrolledAt: .now
        )
    }

    func checkout(items: [StagedCheckoutItem], requestID: String) async throws -> CheckoutReceipt {
        let payload = items.map { item -> [String: Any] in
            var value: [String: Any] = [
                "tagId": item.equipment.tagID,
                "condition": item.hasIssue ? "has_issue" : "no_issues",
            ]
            if item.hasIssue { value["issueText"] = item.issueText.trimmingCharacters(in: .whitespacesAndNewlines) }
            return value
        }
        let result = try await functions.httpsCallable("confirmCheckout").call([
            "clientRequestId": requestID,
            "items": payload,
        ])
        guard let raw = result.data as? [String: Any],
              let batchID = raw["checkoutBatchId"] as? String else {
            throw FirebaseGatewayError.invalidResponse
        }
        return CheckoutReceipt(
            id: batchID,
            equipment: items.map(\.equipment),
            claimIDs: raw["claimIds"] as? [String] ?? [],
            timestamp: .now
        )
    }

    func returnItems(_ items: [ReturnCandidate], requestID: String) async throws -> ReturnReceipt {
        let result = try await functions.httpsCallable("confirmReturn").call([
            "clientRequestId": requestID,
            "tagIds": items.map(\.equipment.tagID),
        ])
        guard let raw = result.data as? [String: Any] else { throw FirebaseGatewayError.invalidResponse }
        let ids = raw["claimIds"] as? [String] ?? []
        return ReturnReceipt(
            batchID: raw["returnBatchId"] as? String ?? requestID,
            resolvedClaimIDs: ids,
            resolvedCount: ids.count
        )
    }

    func enroll(name: String, serial: String, tagID: String, hardwareUID: String) async throws {
        _ = try await functions.httpsCallable("enrollEquipment").call([
            "name": name,
            "internalSerial": serial,
            "tagId": tagID,
            "hardwareUidHex": hardwareUID,
            "chipFamily": "NFC Forum Type 2",
        ])
    }

    func updateEquipment(id: String, name: String, serial: String, isActive: Bool) async throws {
        _ = try await functions.httpsCallable("editEquipment").call([
            "equipmentId": id,
            "name": name,
            "internalSerial": serial,
            "status": isActive ? "active" : "retired",
        ])
    }

    func replaceTag(equipmentID: String, tagID: String, hardwareUID: String) async throws {
        _ = try await functions.httpsCallable("replaceTag").call([
            "equipmentId": equipmentID,
            "tagId": tagID,
            "hardwareUidHex": hardwareUID,
            "chipFamily": "NFC Forum Type 2",
        ])
    }

    func updateIssue(id: String, status: IssueStatus) async throws {
        _ = try await functions.httpsCallable("updateIssue").call([
            "issueId": id,
            "status": status.rawValue,
        ])
    }

    private func claimsQuery(for user: GearUser) -> Query {
        if user.role == .teacher {
            return database.collection("claims").order(by: "checkedOutAt", descending: true)
        }
        return database.collection("claims")
            .whereField("studentUid", isEqualTo: user.id)
            .order(by: "checkedOutAt", descending: true)
    }

    private func issuesQuery(for user: GearUser) -> Query {
        if user.role == .teacher {
            return database.collection("issues").order(by: "reportedAt", descending: true)
        }
        return database.collection("issues")
            .whereField("reportedByStudentUid", isEqualTo: user.id)
            .order(by: "reportedAt", descending: true)
    }

    private func registerDevice() async throws {
        let installationID = try await Installations.installations().installationID()
        let token = try await Messaging.messaging().token()
        _ = try await functions.httpsCallable("registerDevice").call([
            "installationId": installationID,
            "fcmToken": token,
            "platform": "ios",
            "notificationsEnabled": true,
        ])
    }

    private static func equipment(from document: QueryDocumentSnapshot) -> Equipment? {
        let data = document.data()
        guard let name = data["name"] as? String else { return nil }
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
            reportedByStudentEmail: data["reportedByStudentEmail"] as? String ?? "",
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
    case invalidResponse

    var errorDescription: String? {
        switch self {
        case .noPresentingViewController: "Unable to present Google Sign-In."
        case .missingIDToken: "Google did not return an identity token."
        case .invalidResponse: "The Trakr backend returned an incomplete response."
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
