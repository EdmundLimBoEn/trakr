import FirebaseCore
import GoogleSignIn
import SwiftUI

@main
struct TrakrApp: App {
    @StateObject private var store: TrakrStore
    @StateObject private var connectivity = ConnectivityMonitor()

    init() {
        FirebaseApp.configure()
        _store = StateObject(wrappedValue: TrakrStore())
    }

    var body: some Scene {
        WindowGroup {
            RootView()
                .environmentObject(store)
                .tint(TrakrTheme.pink)
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
