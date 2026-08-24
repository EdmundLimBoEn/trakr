import SwiftUI

struct SignInView: View {
    @EnvironmentObject private var store: TrakrStore
    @EnvironmentObject private var featureFlags: FeatureFlagsStore
    @State private var error: Error?
    @State private var isSigningIn = false
    @State private var showingDemoPicker = false
    @State private var ignoreNextGoogleTap = false

    private var flags: FeatureFlags { featureFlags.flags }

    var body: some View {
        NavigationStack {
            VStack(spacing: 0) {
                Spacer()

                VStack(spacing: 12) {
                    TrakrMark(size: 72)
                    Text("Trakr")
                        .font(.largeTitle.weight(.bold))
                    Text("School equipment checkout")
                        .font(.subheadline)
                        .foregroundStyle(.secondary)
                }
                .accessibilityElement(children: .combine)
                .accessibilityLabel("Trakr")

                Spacer()

                VStack(spacing: 16) {
                    if flags.googleSignInEnabled || flags.isDemo {
                        Button(action: signInWithGoogle) {
                            Text(isSigningIn ? "Signing in…" : "Sign in with Google")
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
                        .accessibilityIdentifier("sign-in-google")
                        .simultaneousGesture(
                            LongPressGesture(minimumDuration: 3)
                                .onEnded { _ in
                                    guard flags.isDemo else { return }
                                    ignoreNextGoogleTap = true
                                    showingDemoPicker = true
                                }
                        )
                    }

                    if !flags.googleSignInEnabled && !flags.isDemo {
                        Text("Sign-in is temporarily unavailable.")
                            .font(.footnote)
                            .foregroundStyle(.secondary)
                            .multilineTextAlignment(.center)
                    } else {
                        Text("Use your school Google account.")
                            .font(.footnote)
                            .foregroundStyle(.secondary)
                            .multilineTextAlignment(.center)
                    }
                }
                .padding(.horizontal, 24)
                .padding(.bottom, 36)
            }
            .frame(maxWidth: .infinity, maxHeight: .infinity)
            .background(Color(.systemGroupedBackground).ignoresSafeArea())
            .confirmationDialog("Demo account", isPresented: $showingDemoPicker, titleVisibility: .visible) {
                Button("Student") {
                    Task { await useDemo(.student) }
                }
                .accessibilityIdentifier("demo-student")

                Button("Teacher") {
                    Task { await useDemo(.teacher) }
                }
                .accessibilityIdentifier("demo-teacher")

                Button("Cancel", role: .cancel) {}
            } message: {
                Text("Choose a local demo role.")
            }
            .errorAlert($error)
        }
    }

    private func signInWithGoogle() {
        if ignoreNextGoogleTap {
            ignoreNextGoogleTap = false
            return
        }
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
