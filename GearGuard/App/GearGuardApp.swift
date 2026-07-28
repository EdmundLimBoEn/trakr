import SwiftUI

@main
struct GearGuardApp: App {
    @StateObject private var store = GearGuardStore()

    var body: some Scene {
        WindowGroup {
            RootView()
                .environmentObject(store)
                .tint(Color(red: 0.09, green: 0.31, blue: 0.24))
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

