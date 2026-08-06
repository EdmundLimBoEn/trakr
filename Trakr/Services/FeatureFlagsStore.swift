import Foundation
@preconcurrency import FirebaseFirestore
import OSLog

/// Loads `config/featureFlags` from Firestore and publishes updates for SwiftUI.
/// Unauthenticated clients can read the doc (public) so the sign-in screen can hide demo.
@MainActor
final class FeatureFlagsStore: ObservableObject {
    @Published private(set) var flags: FeatureFlags
    @Published private(set) var isLoaded = false

    private var listener: ListenerRegistration?
    private let logger = Logger(subsystem: "systems.edmundlim.trakr", category: "FeatureFlags")

    init(flags: FeatureFlags = .bundled) {
        self.flags = Self.applyLaunchOverrides(to: flags)
        startListening()
    }

    func refresh() async {
        do {
            let snapshot = try await Firestore.firestore()
                .collection("config")
                .document("featureFlags")
                .getDocument()
            applyRemote(snapshot.data())
        } catch {
            logger.error("Feature flags fetch failed: \(error.localizedDescription, privacy: .public)")
            isLoaded = true
        }
    }

    private func startListening() {
        listener = Firestore.firestore()
            .collection("config")
            .document("featureFlags")
            .addSnapshotListener { [weak self] snapshot, error in
                Task { @MainActor in
                    guard let self else { return }
                    if let error {
                        self.logger.error("Feature flags listener error: \(error.localizedDescription, privacy: .public)")
                        self.isLoaded = true
                        return
                    }
                    self.applyRemote(snapshot?.data())
                }
            }
    }

    private func applyRemote(_ data: [String: Any]?) {
        let remote = FeatureFlags.fromFirestore(data)
        flags = Self.applyLaunchOverrides(to: remote)
        isLoaded = true
    }

    /// Launch arguments win over remote + bundled defaults (UI tests / local demos).
    private static func applyLaunchOverrides(to flags: FeatureFlags) -> FeatureFlags {
        var next = flags
        let args = ProcessInfo.processInfo.arguments
        if args.contains("--local-demo") || args.contains("--enable-demo") {
            next.isDemo = true
        }
        if args.contains("--disable-demo") {
            next.isDemo = false
        }
        if args.contains("--maintenance") {
            next.maintenanceMode = true
        }
        return next
    }
}
