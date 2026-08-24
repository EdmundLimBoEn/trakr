import Foundation

/// Remote-configurable feature flags. Stored at Firestore `config/featureFlags`.
/// A future web dashboard will write this document; clients only read it.
struct FeatureFlags: Equatable, Sendable {
    /// Enable hidden demo sign-in (long-press Sign in with Google) and simulator helper buttons.
    var isDemo: Bool
    /// Show Sign in with Google on the sign-in screen.
    var googleSignInEnabled: Bool
    /// Student Collect tab and checkout confirmation.
    var checkoutEnabled: Bool
    /// Teacher Returns tab.
    var returnsEnabled: Bool
    /// Teacher Equipment enrollment / tag replace UI.
    var enrollmentEnabled: Bool
    /// History tab (student + teacher).
    var historyEnabled: Bool
    /// Activity / notifications tab for students.
    var activityEnabled: Bool
    /// Block the app behind a maintenance message.
    var maintenanceMode: Bool
    /// Show “Simulate offline” under Profile → MVP controls.
    var simulateOfflineVisible: Bool

    static let bundled: FeatureFlags = {
        #if DEBUG
        FeatureFlags(
            isDemo: true,
            googleSignInEnabled: true,
            checkoutEnabled: true,
            returnsEnabled: true,
            enrollmentEnabled: true,
            historyEnabled: true,
            activityEnabled: true,
            maintenanceMode: false,
            simulateOfflineVisible: true
        )
        #else
        FeatureFlags(
            isDemo: false,
            googleSignInEnabled: true,
            checkoutEnabled: true,
            returnsEnabled: true,
            enrollmentEnabled: true,
            historyEnabled: true,
            activityEnabled: true,
            maintenanceMode: false,
            simulateOfflineVisible: false
        )
        #endif
    }()

    static func fromFirestore(_ data: [String: Any]?) -> FeatureFlags {
        let defaults = FeatureFlags.bundled
        guard let data else { return defaults }
        func bool(_ key: String, fallback: Bool) -> Bool {
            if let value = data[key] as? Bool { return value }
            return fallback
        }
        return FeatureFlags(
            isDemo: bool("isDemo", fallback: defaults.isDemo),
            googleSignInEnabled: bool("googleSignInEnabled", fallback: defaults.googleSignInEnabled),
            checkoutEnabled: bool("checkoutEnabled", fallback: defaults.checkoutEnabled),
            returnsEnabled: bool("returnsEnabled", fallback: defaults.returnsEnabled),
            enrollmentEnabled: bool("enrollmentEnabled", fallback: defaults.enrollmentEnabled),
            historyEnabled: bool("historyEnabled", fallback: defaults.historyEnabled),
            activityEnabled: bool("activityEnabled", fallback: defaults.activityEnabled),
            maintenanceMode: bool("maintenanceMode", fallback: defaults.maintenanceMode),
            simulateOfflineVisible: bool("simulateOfflineVisible", fallback: defaults.simulateOfflineVisible)
        )
    }
}
