import XCTest
@testable import GearGuard

final class GearGuardTests: XCTestCase {
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
        XCTAssertFalse(TagCodec.isValid("gg:not-valid"))
        XCTAssertEqual(TagCodec.normalizedUID([0x04, 0x00, 0xAF]), "0400AF")
    }

    @MainActor
    func testCheckoutAllowsMultipleClaimsAndIsIdempotent() throws {
        let store = GearGuardStore(persistence: MemorySnapshotPersistence())
        store.useDemo(role: .student)
        let equipment = try XCTUnwrap(store.equipment.first)
        let staged = [StagedCheckoutItem(equipment: equipment)]

        let first = try store.confirmCheckout(items: staged, requestID: "request-1")
        let retry = try store.confirmCheckout(items: staged, requestID: "request-1")
        _ = try store.confirmCheckout(items: staged, requestID: "request-2")

        XCTAssertEqual(first.id, retry.id)
        XCTAssertEqual(store.activeClaims(for: equipment.id).count, 2)
    }

    @MainActor
    func testReturnClosesEveryActiveClaimAndIsIdempotent() throws {
        let store = GearGuardStore(persistence: MemorySnapshotPersistence())
        store.useDemo(role: .student)
        let equipment = try XCTUnwrap(store.equipment.first)
        let staged = [StagedCheckoutItem(equipment: equipment)]
        _ = try store.confirmCheckout(items: staged, requestID: "checkout-1")
        _ = try store.confirmCheckout(items: staged, requestID: "checkout-2")

        store.useDemo(role: .teacher)
        let candidates = [ReturnCandidate(equipment: equipment, activeClaims: store.activeClaims(for: equipment.id))]
        XCTAssertEqual(try store.confirmReturn(items: candidates, requestID: "return-1"), 2)
        XCTAssertEqual(try store.confirmReturn(items: candidates, requestID: "return-1"), 2)
        XCTAssertTrue(store.activeClaims(for: equipment.id).isEmpty)
    }

    @MainActor
    func testIssueRequiresText() throws {
        let store = GearGuardStore(persistence: MemorySnapshotPersistence())
        store.useDemo(role: .student)
        let equipment = try XCTUnwrap(store.equipment.first)
        let invalid = StagedCheckoutItem(equipment: equipment, hasIssue: true, issueText: " ")
        XCTAssertThrowsError(try store.confirmCheckout(items: [invalid], requestID: "issue"))
    }

    @MainActor
    func testOfflineConfirmationDoesNotMutateState() throws {
        let store = GearGuardStore(persistence: MemorySnapshotPersistence())
        store.useDemo(role: .student)
        store.isOnline = false
        let equipment = try XCTUnwrap(store.equipment.first)
        XCTAssertThrowsError(try store.confirmCheckout(items: [StagedCheckoutItem(equipment: equipment)], requestID: "offline"))
        XCTAssertTrue(store.claims.isEmpty)
    }
}

