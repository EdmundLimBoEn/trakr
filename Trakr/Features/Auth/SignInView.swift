import SwiftUI

struct SignInView: View {
    @EnvironmentObject private var store: TrakrStore
    @EnvironmentObject private var featureFlags: FeatureFlagsStore
    @State private var error: Error?
    @State private var isSigningIn = false

    private var flags: FeatureFlags { featureFlags.flags }

    var body: some View {
        NavigationStack {
            GeometryReader { proxy in
                VStack(spacing: 18) {
                    Image("TrakrLogo")
                        .resizable()
                        .scaledToFit()
                        .frame(width: 300, height: 160)
                        .accessibilityLabel("Trakr")

                    Text("Sign in to Trakr")
                        .font(.title2.weight(.semibold))
                        .foregroundStyle(TrakrTheme.ink)

                    VStack(spacing: 12) {
                        if flags.googleSignInEnabled {
                            Button(action: signInWithGoogle) {
                                Text(isSigningIn ? "Signing in…" : "Continue with Google")
                                    .frame(maxWidth: .infinity)
                                    .overlay(alignment: .leading) {
                                        if isSigningIn {
                                            ProgressView()
                                                .padding(.leading, 18)
                                        }
                                    }
                            }
                            .buttonStyle(.borderedProminent)
                            .controlSize(.large)
                            .disabled(isSigningIn)
                        }

                        if flags.isDemo {
                            Menu {
                                Button {
                                    Task { await useDemo(.student) }
                                } label: {
                                    Label("Student", systemImage: "person.fill")
                                }
                                .accessibilityIdentifier("demo-student")

                                Button {
                                    Task { await useDemo(.teacher) }
                                } label: {
                                    Label("Teacher", systemImage: "person.badge.key.fill")
                                }
                                .accessibilityIdentifier("demo-teacher")
                            } label: {
                                Text("Use demo account")
                                    .font(.subheadline)
                                    .frame(maxWidth: .infinity)
                                    .overlay(alignment: .trailing) {
                                        Image(systemName: "chevron.up.chevron.down")
                                            .font(.caption.weight(.semibold))
                                            .padding(.trailing, 12)
                                    }
                            }
                            .buttonStyle(.bordered)
                            .controlSize(.small)
                            .accessibilityIdentifier("demo-account-menu")
                        }

                        if !flags.googleSignInEnabled && !flags.isDemo {
                            Text("Sign-in is temporarily unavailable.")
                                .font(.footnote)
                                .foregroundStyle(.secondary)
                                .multilineTextAlignment(.center)
                        }
                    }
                    .frame(maxWidth: 360)
                }
                .padding(24)
                .frame(width: proxy.size.width, height: proxy.size.height)
            }
            .background(Color.black.ignoresSafeArea())
            .errorAlert($error)
        }
    }

    private func signInWithGoogle() {
        guard flags.googleSignInEnabled else { return }
        isSigningIn = true
        Task {
            do { try await store.signInWithGoogle() }
            catch is CancellationError { /* user dismissed the Google sheet */ }
            catch { self.error = error }
            isSigningIn = false
        }
    }

    private func useDemo(_ role: UserRole) async {
        guard flags.isDemo else { return }
        do { try await store.useDemo(role: role) }
        catch { self.error = error }
    }
}
