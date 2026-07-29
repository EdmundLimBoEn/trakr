import XCTest
@testable import Trakr

final class TrakrTests: XCTestCase {
    func testRoleDerivation() throws {
        XCTAssertEqual(try RoleDeriver.role(for: "teacher@sst.edu.sg"), .teacher)
        XCTAssertEqual(try RoleDeriver.role(for: "student@class1.ssts.edu.sg"), .student)
        XCTAssertThrowsError(try RoleDeriver.role(for: "student@ssts.edu.sg"))
        XCTAssertThrowsError(try RoleDeriver.role(for: "person@gmail.com"))
    }

    func testTagValidationAndUIDNormalization() {
        let tag = TagCodec.generate()
        XCTAssertTrue(TagCodec.isValid(tag))
        XCTAssertEqual(tag.count, 29)
        XCTAssertFalse(TagCodec.isValid("tr:not-valid"))
        XCTAssertEqual(TagCodec.normalizedUID([0x04, 0x00, 0xAF]), "0400AF")
    }

    @MainActor
    func testCheckoutAllowsMultipleClaimsAndIsIdempotent() throws {
        let store = TrakrStore(persistence: MemorySnapshotPersistence())
        store.useDemo(role: .student)
        let equipment = try XCTUnwrap(store.equipment.first)
        let staged = [StagedCheckoutItem(equipment: equipment)]

        let first = try store.confirmCheckout(items: staged, condition: .noIssues, requestID: "request-1")
        let retry = try store.confirmCheckout(items: staged, condition: .noIssues, requestID: "request-1")
        _ = try store.confirmCheckout(items: staged, condition: .noIssues, requestID: "request-2")

        XCTAssertEqual(first.id, retry.id)
        XCTAssertEqual(store.activeClaims(for: equipment.id).count, 2)
        XCTAssertEqual(store.notifications.filter { $0.kind == .checkout }.count, 2)
    }

    @MainActor
    func testReturnClosesEveryActiveClaimAndIsIdempotent() throws {
        let store = TrakrStore(persistence: MemorySnapshotPersistence())
        store.useDemo(role: .student)
        let equipment = try XCTUnwrap(store.equipment.first)
        let staged = [StagedCheckoutItem(equipment: equipment)]
        _ = try store.confirmCheckout(items: staged, condition: .noIssues, requestID: "checkout-1")
        _ = try store.confirmCheckout(items: staged, condition: .noIssues, requestID: "checkout-2")

        store.useDemo(role: .teacher)
        let candidates = [ReturnCandidate(equipment: equipment, activeClaims: store.activeClaims(for: equipment.id))]
        XCTAssertEqual(try store.confirmReturn(items: candidates, requestID: "return-1").resolvedCount, 2)
        XCTAssertEqual(try store.confirmReturn(items: candidates, requestID: "return-1").resolvedCount, 2)
        XCTAssertTrue(store.activeClaims(for: equipment.id).isEmpty)
        XCTAssertEqual(store.notifications.filter { $0.kind == .returned }.count, 1)
    }

    @MainActor
    func testIssueRequiresText() throws {
        let store = TrakrStore(persistence: MemorySnapshotPersistence())
        store.useDemo(role: .student)
        let equipment = try XCTUnwrap(store.equipment.first)
        let invalid = StagedCheckoutItem(equipment: equipment, hasIssue: true, issueText: " ")
        XCTAssertThrowsError(try store.confirmCheckout(items: [invalid], condition: .hasIssue, requestID: "issue"))
        XCTAssertThrowsError(try store.confirmCheckout(items: [StagedCheckoutItem(equipment: equipment)], condition: .hasIssue, requestID: "no-affected-item"))
    }

    @MainActor
    func testOfflineConfirmationDoesNotMutateState() throws {
        let store = TrakrStore(persistence: MemorySnapshotPersistence())
        store.useDemo(role: .student)
        store.simulateOffline = true
        let equipment = try XCTUnwrap(store.equipment.first)
        XCTAssertThrowsError(try store.confirmCheckout(items: [StagedCheckoutItem(equipment: equipment)], condition: .noIssues, requestID: "offline"))
        XCTAssertTrue(store.claims.isEmpty)
    }

    @MainActor
    func testIssueLifecycleAndTeacherNotification() throws {
        let store = TrakrStore(persistence: MemorySnapshotPersistence())
        store.useDemo(role: .student)
        let equipment = try XCTUnwrap(store.equipment.first)
        let reported = StagedCheckoutItem(equipment: equipment, hasIssue: true, issueText: "Lens cap is cracked")
        _ = try store.confirmCheckout(items: [reported], condition: .hasIssue, requestID: "reported-issue")

        let issue = try XCTUnwrap(store.issues.first)
        XCTAssertEqual(issue.status, .open)
        XCTAssertEqual(store.notifications.filter { $0.kind == .issue && $0.recipientRole == .teacher }.count, 1)

        store.useDemo(role: .teacher)
        try store.updateIssue(id: issue.id, status: .resolved)
        XCTAssertEqual(store.issues.first?.status, .resolved)
        XCTAssertNotNil(store.issues.first?.resolvedAt)
    }

    @MainActor
    func testReplacingTagPreservesClaimHistory() throws {
        let store = TrakrStore(persistence: MemorySnapshotPersistence())
        store.useDemo(role: .student)
        let equipment = try XCTUnwrap(store.equipment.first)
        let oldTag = equipment.tagID
        _ = try store.confirmCheckout(items: [StagedCheckoutItem(equipment: equipment)], condition: .noIssues, requestID: "before-replacement")

        store.useDemo(role: .teacher)
        let newTag = TagCodec.generate()
        try store.replaceTag(equipmentID: equipment.id, tagID: newTag, hardwareUID: "0400AF")

        XCTAssertThrowsError(try store.resolve(tagID: oldTag)) {
            XCTAssertEqual($0 as? TrakrError, .inactiveTag)
        }
        XCTAssertEqual(try store.resolve(tagID: newTag).id, equipment.id)
        XCTAssertEqual(store.claims.first?.tagIDAtCheckout, oldTag)
        XCTAssertTrue(store.auditEvents.contains { $0.kind == .tagReplaced })
    }

    @MainActor
    func testOverdueNotificationsAreRoleScopedAndIdempotent() throws {
        let store = TrakrStore(persistence: MemorySnapshotPersistence())
        store.useDemo(role: .student)
        let equipment = try XCTUnwrap(store.equipment.first)
        _ = try store.confirmCheckout(items: [StagedCheckoutItem(equipment: equipment)], condition: .noIssues, requestID: "overdue-claim")

        store.processOverdue(now: .now.addingTimeInterval(25 * 60 * 60))
        store.processOverdue(now: .now.addingTimeInterval(26 * 60 * 60))

        let overdue = store.notifications.filter { $0.kind == .overdue }
        XCTAssertEqual(overdue.count, 2)
        XCTAssertEqual(Set(overdue.map(\.recipientRole)), Set([.student, .teacher]))
    }

    @MainActor
    func testEquipmentValidationAndUpdate() throws {
        let store = TrakrStore(persistence: MemorySnapshotPersistence())
        store.useDemo(role: .teacher)
        let equipment = try XCTUnwrap(store.equipment.first)

        XCTAssertThrowsError(try store.updateEquipment(id: equipment.id, name: "", serial: "X", isActive: true))
        XCTAssertThrowsError(try store.updateEquipment(id: equipment.id, name: "Camera", serial: String(repeating: "X", count: 51), isActive: true))
        let updated = try store.updateEquipment(id: equipment.id, name: "Canon R50 II", serial: "MC-CAM-99", isActive: false)
        XCTAssertEqual(updated.name, "Canon R50 II")
        XCTAssertFalse(updated.isActive)
    }

    func testSnapshotDecodesDataWrittenBeforeNotificationSupport() throws {
        let data = Data(#"{"equipment":[],"claims":[],"auditEvents":[],"requestResults":{}}"#.utf8)
        let snapshot = try JSONDecoder().decode(StoreSnapshot.self, from: data)
        XCTAssertTrue(snapshot.issues.isEmpty)
        XCTAssertTrue(snapshot.notifications.isEmpty)
    }

    @MainActor
    func testRoleBoundariesAreEnforcedByStore() throws {
        let store = TrakrStore(persistence: MemorySnapshotPersistence())
        let equipment = try XCTUnwrap(store.equipment.first)

        store.useDemo(role: .student)
        XCTAssertThrowsError(try store.enroll(name: "Camera", serial: "NEW-1", tagID: TagCodec.generate(), hardwareUID: "01"))
        XCTAssertThrowsError(try store.confirmReturn(items: [ReturnCandidate(equipment: equipment, activeClaims: [])], requestID: "student-return"))

        store.useDemo(role: .teacher)
        XCTAssertThrowsError(try store.confirmCheckout(items: [StagedCheckoutItem(equipment: equipment)], condition: .noIssues, requestID: "teacher-checkout"))
    }

    @MainActor
    func testStudentsOnlySeeTheirOwnClaimsAndNotifications() throws {
        let store = TrakrStore(persistence: MemorySnapshotPersistence())
        let equipment = try XCTUnwrap(store.equipment.first)

        try store.signIn(email: "alex@class1.ssts.edu.sg")
        let alex = try XCTUnwrap(store.currentUser)
        _ = try store.confirmCheckout(items: [StagedCheckoutItem(equipment: equipment)], condition: .noIssues, requestID: "alex-checkout")

        try store.signIn(email: "jamie@class2.ssts.edu.sg")
        let jamie = try XCTUnwrap(store.currentUser)
        _ = try store.confirmCheckout(items: [StagedCheckoutItem(equipment: equipment)], condition: .noIssues, requestID: "jamie-checkout")

        XCTAssertEqual(store.claims(for: alex).count, 1)
        XCTAssertEqual(store.claims(for: jamie).count, 1)
        XCTAssertEqual(store.notifications(for: alex).filter { $0.kind == .checkout }.count, 1)
        XCTAssertEqual(store.notifications(for: jamie).filter { $0.kind == .checkout }.count, 1)
    }

    func testSnapshotRoundTripPreservesNewCollections() throws {
        let issue = EquipmentIssue(
            id: "issue",
            claimID: "claim",
            equipmentID: "equipment",
            reportedByStudentID: "student",
            reportedByStudentEmail: "student@class.ssts.edu.sg",
            text: "Cracked casing",
            status: .open,
            reportedAt: .now
        )
        let notification = GearNotification(
            id: "notification",
            kind: .issue,
            recipientRole: .teacher,
            recipientUserID: nil,
            title: "Equipment issue reported",
            message: "A student reported an issue requiring review.",
            equipmentIDs: ["equipment"],
            claimID: "claim",
            createdAt: .now,
            isRead: false
        )
        let encoded = try JSONEncoder().encode(StoreSnapshot(issues: [issue], notifications: [notification], inactiveTagIDs: ["tr:01J9Z6M4Y7X3N8K2D5P0Q1R4TC"]))
        let decoded = try JSONDecoder().decode(StoreSnapshot.self, from: encoded)
        XCTAssertEqual(decoded.issues, [issue])
        XCTAssertEqual(decoded.notifications, [notification])
        XCTAssertEqual(decoded.inactiveTagIDs, ["tr:01J9Z6M4Y7X3N8K2D5P0Q1R4TC"])
    }
}
