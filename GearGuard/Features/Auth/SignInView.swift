import SwiftUI

struct SignInView: View {
    @EnvironmentObject private var store: GearGuardStore
    @State private var email = ""
    @State private var error: Error?

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 28) {
                    Spacer(minLength: 54)
                    GearMark(size: 76)

                    VStack(alignment: .leading, spacing: 10) {
                        Text("Know where every piece of gear is.")
                            .font(.system(size: 40, weight: .bold, design: .rounded))
                            .foregroundStyle(GearTheme.ink)
                        Text("Scan. Collect. Return. GearGuard replaces equipment forms with a tap.")
                            .font(.title3)
                            .foregroundStyle(.secondary)
                    }

                    VStack(alignment: .leading, spacing: 14) {
                        Text("School account")
                            .font(.headline)
                        TextField("name@school.ssts.edu.sg", text: $email)
                            .textContentType(.emailAddress)
                            .textInputAutocapitalization(.never)
                            .autocorrectionDisabled()
                            .padding()
                            .background(.background, in: RoundedRectangle(cornerRadius: 14))
                            .overlay {
                                RoundedRectangle(cornerRadius: 14)
                                    .stroke(.quaternary)
                            }
                        Button("Continue") {
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
            .background(GearTheme.paper.ignoresSafeArea())
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
    }
}

