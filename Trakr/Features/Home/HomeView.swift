import SwiftUI

struct HomeView: View {
    @EnvironmentObject private var store: TrakrStore
    @EnvironmentObject private var featureFlags: FeatureFlagsStore

    private var flags: FeatureFlags { featureFlags.flags }

    var body: some View {
        TabView {
            if store.currentUser?.role == .student {
                if flags.checkoutEnabled {
                    CheckoutView()
                        .tabItem { Label("Collect", systemImage: "shippingbox.fill") }
                }
                if flags.activityEnabled {
                    ActivityView()
                        .tabItem { Label("Activity", systemImage: "bell.fill") }
                }
            } else {
                TeacherDashboardView()
                    .tabItem { Label("Overview", systemImage: "rectangle.grid.2x2.fill") }
                if flags.returnsEnabled {
                    ReturnView()
                        .tabItem { Label("Returns", systemImage: "arrow.uturn.backward.circle.fill") }
                }
                if flags.enrollmentEnabled {
                    EquipmentListView()
                        .tabItem { Label("Equipment", systemImage: "camera.fill") }
                }
            }
            if flags.historyEnabled {
                HistoryView()
                    .tabItem { Label("History", systemImage: "clock.fill") }
            }
            SettingsView()
                .tabItem { Label("Settings", systemImage: "gearshape.fill") }
        }
    }
}

private struct SettingsView: View {
    @EnvironmentObject private var store: TrakrStore
    @EnvironmentObject private var featureFlags: FeatureFlagsStore
    @AppStorage("trakr.appearance") private var appearance: AppAppearance = .system
    @AppStorage("trakr.accentColour") private var accentColour: AppAccentColour = .blue

    var body: some View {
        NavigationStack {
            List {
                if let user = store.currentUser {
                    Section {
                        VStack(alignment: .leading, spacing: 2) {
                            Text(user.displayName)
                            Text(user.email)
                                .font(.subheadline)
                                .foregroundStyle(.secondary)
                        }
                        LabeledContent("Role", value: user.role.title)
                    }
                }

                Section {
                    Picker("Theme", selection: $appearance) {
                        ForEach(AppAppearance.allCases) { option in
                            Text(option.title).tag(option)
                        }
                    }
                    Picker("Accent colour", selection: $accentColour) {
                        ForEach(AppAccentColour.allCases) { option in
                            Text(option.title).tag(option)
                        }
                    }
                } header: {
                    Text("Appearance")
                } footer: {
                    Text("Theme follows Light, Dark, or the system setting. Accent colour tints buttons and selected controls.")
                }

                if featureFlags.flags.simulateOfflineVisible {
                    Section {
                        LabeledContent("Network", value: store.isNetworkReachable ? "Connected" : "Unavailable")
                        Toggle("Simulate offline", isOn: $store.simulateOffline)
                    } header: {
                        Text("Developer")
                    } footer: {
                        Text("Offline mode keeps staged items and blocks scan and confirmation until connectivity returns.")
                    }
                }

                Section {
                    Button("Sign Out", role: .destructive) { store.signOut() }
                }
            }
            .navigationTitle("Settings")
        }
    }
}
