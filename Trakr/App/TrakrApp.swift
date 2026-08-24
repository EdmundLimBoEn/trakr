import FirebaseCore
import GoogleSignIn
import SwiftUI

@main
struct TrakrApp: App {
    @StateObject private var store: TrakrStore
    @StateObject private var featureFlags = FeatureFlagsStore()
    @StateObject private var connectivity = ConnectivityMonitor()
    @AppStorage("trakr.appearance") private var appearance: AppAppearance = .system
    @AppStorage("trakr.accentColour") private var accentColour: AppAccentColour = .blue

    init() {
        FirebaseApp.configure()
        if let clientID = FirebaseApp.app()?.options.clientID {
            GIDSignIn.sharedInstance.configuration = GIDConfiguration(clientID: clientID)
        }
        _store = StateObject(wrappedValue: TrakrStore())
    }

    var body: some Scene {
        WindowGroup {
            RootView()
                .environmentObject(store)
                .environmentObject(featureFlags)
                .preferredColorScheme(appearance.colorScheme)
                .modifier(OptionalAccentTint(color: accentColour.color))
                .onReceive(connectivity.$isReachable) { store.setNetworkReachable($0) }
                .onAppear {
                    if ProcessInfo.processInfo.arguments.contains("--reset-data") {
                        store.resetDemoData()
                    }
                }
                .onOpenURL { GIDSignIn.sharedInstance.handle($0) }
        }
    }
}

struct RootView: View {
    @EnvironmentObject private var store: TrakrStore
    @EnvironmentObject private var featureFlags: FeatureFlagsStore

    var body: some View {
        Group {
            if featureFlags.flags.maintenanceMode {
                MaintenanceView()
            } else if store.currentUser == nil {
                SignInView()
            } else {
                HomeView()
            }
        }
        .animation(.default, value: store.currentUser)
        .animation(.default, value: featureFlags.flags.maintenanceMode)
    }
}

private struct MaintenanceView: View {
    var body: some View {
        ContentUnavailableView(
            "Trakr is undergoing maintenance",
            systemImage: "wrench.and.screwdriver",
            description: Text("Please try again later.")
        )
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(Color(.systemGroupedBackground).ignoresSafeArea())
    }
}
