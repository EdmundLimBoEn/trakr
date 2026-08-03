import SwiftUI

struct SignInView: View {
    @EnvironmentObject private var store: TrakrStore
    @State private var email = ""
    @State private var error: Error?
    @State private var isSigningIn = false

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 28) {
                    Spacer(minLength: 54)
                    TrakrMark(size: 76)

                    VStack(alignment: .leading, spacing: 10) {
                        Text("Know where every piece of gear is.")
                            .font(.system(size: 40, weight: .bold, design: .rounded))
                            .foregroundStyle(TrakrTheme.ink)
                        Text("Scan. Collect. Return. Trakr replaces equipment forms with a tap.")
                            .font(.title3)
                            .foregroundStyle(.secondary)
                    }

                    VStack(alignment: .leading, spacing: 14) {
                        Text("School account")
                            .font(.headline)
                        Button {
                            isSigningIn = true
                            Task {
                                do { try await store.signInWithGoogle() }
                                catch { self.error = error }
                                isSigningIn = false
                            }
                        } label: {
                            HStack {
                                if isSigningIn { ProgressView() }
                                Text("Continue with Google")
                            }
                            .frame(maxWidth: .infinity)
                        }
                        .buttonStyle(.borderedProminent)
                        .controlSize(.large)
                        .disabled(isSigningIn)

                        Text("Or use local school-email validation")
                            .font(.caption)
                            .foregroundStyle(.secondary)
                        TextField("name@school.ssts.edu.sg", text: $email)
                            .textContentType(.emailAddress)
                            .textInputAutocapitalization(.never)
                            .autocorrectionDisabled()
                            .padding()
                            .background(TrakrTheme.surface, in: RoundedRectangle(cornerRadius: 14))
                            .overlay {
                                RoundedRectangle(cornerRadius: 14)
                                    .stroke(.quaternary)
                            }
                        Button("Continue locally") {
                            do { try store.signIn(email: email) }
                            catch { self.error = error }
                        }
                        .buttonStyle(.borderedProminent)
                        .controlSize(.large)
                        .frame(maxWidth: .infinity)
                    }

                    VStack(spacing: 10) {
                        Text("Preview the complete MVP")
                            .font(.subheadline.weight(.medium))
                            .foregroundStyle(.secondary)
                        HStack(spacing: 12) {
                            demoButton("Student", icon: "person.fill", role: .student)
                            demoButton("Teacher", icon: "person.badge.key.fill", role: .teacher)
                        }
                    }
                }
                .padding(24)
            }
            .background(TrakrTheme.paper.ignoresSafeArea())
            .errorAlert($error)
        }
    }

    private func demoButton(_ title: String, icon: String, role: UserRole) -> some View {
        Button {
            store.useDemo(role: role)
        } label: {
            Label(title, systemImage: icon)
                .frame(maxWidth: .infinity)
        }
        .buttonStyle(.bordered)
        .controlSize(.large)
        .accessibilityIdentifier("demo-\(role.rawValue)")
    }
}
