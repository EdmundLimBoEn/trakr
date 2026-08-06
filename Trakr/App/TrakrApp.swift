import FirebaseCore
import GoogleSignIn
import SwiftUI

@main
struct TrakrApp: App {
    @StateObject private var store: TrakrStore
    @StateObject private var featureFlags = FeatureFlagsStore()
    @StateObject private var connectivity = ConnectivityMonitor()

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
                .tint(TrakrTheme.pink)
                .preferredColorScheme(.dark)
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
        .animation(.snappy, value: store.currentUser)
        .animation(.snappy, value: featureFlags.flags.maintenanceMode)
    }
}

private struct MaintenanceView: View {
    var body: some View {
        VStack(spacing: 16) {
            Image(systemName: "wrench.and.screwdriver.fill")
                .font(.system(size: 44))
                .foregroundStyle(TrakrTheme.pink)
            Text("Trakr is undergoing maintenance")
                .font(.title2.weight(.semibold))
            Text("Please try again later.")
                .foregroundStyle(.secondary)
        }
        .padding(32)
        .frame(maxWidth: .infinity, maxHeight: .infinity)
        .background(Color.black.ignoresSafeArea())
    }
}
