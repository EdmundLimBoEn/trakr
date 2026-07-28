import SwiftUI

@main
struct GearGuardApp: App {
    @StateObject private var store = GearGuardStore()
    @StateObject private var connectivity = ConnectivityMonitor()

    var body: some Scene {
        WindowGroup {
            RootView()
                .environmentObject(store)
                .tint(Color(red: 0.09, green: 0.31, blue: 0.24))
                .onReceive(connectivity.$isReachable) { store.setNetworkReachable($0) }
                .onAppear {
                    if ProcessInfo.processInfo.arguments.contains("--reset-data") {
                        store.resetDemoData()
                    }
                }
        }
    }
}

struct RootView: View {
    @EnvironmentObject private var store: GearGuardStore

    var body: some View {
        Group {
            if store.currentUser == nil {
                SignInView()
            } else {
                HomeView()
            }
        }
        .animation(.snappy, value: store.currentUser)
    }
}
