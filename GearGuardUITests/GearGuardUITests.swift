import XCTest

final class GearGuardUITests: XCTestCase {
    private var app: XCUIApplication!

    override func setUpWithError() throws {
        continueAfterFailure = false
        app = XCUIApplication()
        app.launchArguments = ["--reset-data"]
        app.launch()
    }

    func testStudentCanCompleteCheckout() {
        app.buttons["demo-student"].tap()
        XCTAssertTrue(app.navigationBars["Collect"].waitForExistence(timeout: 3))

        app.buttons["add-demo-equipment"].tap()
        app.buttons["Canon R50"].tap()
        XCTAssertTrue(app.staticTexts["MC-CAM-01"].waitForExistence(timeout: 2))

        app.buttons["condition-picker"].tap()
        app.buttons["No issues"].tap()
        app.buttons["confirm-checkout"].tap()

        XCTAssertTrue(app.staticTexts["Equipment checked out"].waitForExistence(timeout: 3))
        XCTAssertTrue(app.staticTexts["Canon R50"].exists)
        app.buttons["receipt-done"].tap()
        app.tabBars.buttons.matching(identifier: "bell.fill").firstMatch.tap()
        XCTAssertTrue(app.staticTexts["Equipment checked out"].waitForExistence(timeout: 2))
    }

    func testTeacherCanRecordNoClaimReturn() {
        app.buttons["demo-teacher"].tap()
        XCTAssertTrue(app.navigationBars["Overview"].waitForExistence(timeout: 3))
        app.tabBars.buttons.matching(identifier: "arrow.uturn.backward.circle.fill").firstMatch.tap()

        app.buttons["add-demo-return"].tap()
        app.buttons["Manfrotto Tripod"].tap()
        XCTAssertTrue(app.staticTexts["No active claims"].waitForExistence(timeout: 2))
        app.buttons["confirm-return"].tap()

        XCTAssertTrue(app.staticTexts["Return recorded"].waitForExistence(timeout: 3))
        XCTAssertTrue(app.staticTexts["No active claims were found. An audit event was still created."].exists)
        app.buttons["return-done"].tap()
        XCTAssertTrue(app.staticTexts["No returns staged"].waitForExistence(timeout: 2))
    }

    func testTeacherCanEnrollAndReplaceDemoTag() {
        app.buttons["demo-teacher"].tap()
        XCTAssertTrue(app.navigationBars["Overview"].waitForExistence(timeout: 3))
        app.tabBars.buttons.matching(identifier: "camera.fill").firstMatch.tap()
        app.buttons["enroll-equipment"].tap()

        app.textFields["enroll-name"].tap()
        app.textFields["enroll-name"].typeText("LED Panel")
        app.textFields["enroll-serial"].tap()
        app.textFields["enroll-serial"].typeText("LED-01")
        app.buttons["enroll-demo"].tap()

        XCTAssertTrue(app.staticTexts["LED Panel"].waitForExistence(timeout: 3))
        app.staticTexts["LED Panel"].tap()
        app.buttons["replace-tag"].tap()
        app.buttons["replace-demo"].tap()

        XCTAssertTrue(app.navigationBars["LED Panel"].waitForExistence(timeout: 3))
    }
}
