import SwiftUI

struct HomeView: View {
    @EnvironmentObject private var store: GearGuardStore

    var body: some View {
        TabView {
            if store.currentUser?.role == .student {
                CheckoutView()
                    .tabItem { Label("Collect", systemImage: "shippingbox.fill") }
            } else {
                ReturnView()
                    .tabItem { Label("Returns", systemImage: "arrow.uturn.backward.circle.fill") }
                EquipmentListView()
                    .tabItem { Label("Equipment", systemImage: "camera.fill") }
            }
            HistoryView()
                .tabItem { Label("History", systemImage: "clock.fill") }
            ProfileView()
                .tabItem { Label("Profile", systemImage: "person.crop.circle.fill") }
        }
    }
}

private struct ProfileView: View {
    @EnvironmentObject private var store: GearGuardStore

    var body: some View {
        NavigationStack {
            List {
                if let user = store.currentUser {
                    Section {
                        HStack(spacing: 14) {
                            GearMark(size: 52)
                            VStack(alignment: .leading, spacing: 3) {
                                Text(user.displayName).font(.headline)
                                Text(user.email).font(.subheadline).foregroundStyle(.secondary)
                            }
                        }
                        StatusPill(text: user.role.title, color: GearTheme.forest)
                    }
                }
                Section("MVP controls") {
                    Toggle("Internet available", isOn: $store.isOnline)
                    Text("Turn this off to verify that checkout and return confirmations preserve staged items and fail safely.")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
                Section {
                    Button("Sign out", role: .destructive) { store.signOut() }
                }
            }
            .navigationTitle("Profile")
        }
    }
}
