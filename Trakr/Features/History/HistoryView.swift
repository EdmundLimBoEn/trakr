import SwiftUI

struct HistoryView: View {
    @EnvironmentObject private var store: TrakrStore

    var body: some View {
        NavigationStack {
            Group {
                if let user = store.currentUser, store.claims(for: user).isEmpty {
                    EmptyState(icon: "clock", title: "No history yet", message: "Confirmed checkouts and returns appear here.")
                } else if let user = store.currentUser {
                    List(store.claims(for: user)) { claim in
                        HStack(alignment: .top, spacing: 12) {
                            Image(systemName: claim.status == .active ? "arrow.up.right.circle.fill" : "checkmark.circle.fill")
                                .font(.title2)
                                .foregroundStyle(claim.status == .active ? Color.orange : Color.accentColor)
                            VStack(alignment: .leading, spacing: 5) {
                                Text(store.equipment(withID: claim.equipmentID)?.name ?? "Equipment")
                                    .font(.headline)
                                if user.role == .teacher {
                                    Text(claim.studentEmail).font(.subheadline)
                                }
                                Text("Collected \(claim.checkedOutAt.formatted(date: .abbreviated, time: .shortened))")
                                    .font(.caption)
                                    .foregroundStyle(.secondary)
                                if let returnedAt = claim.returnedAt {
                                    Text("Returned \(returnedAt.formatted(date: .abbreviated, time: .shortened))")
                                        .font(.caption)
                                        .foregroundStyle(.secondary)
                                }
                                if let issue = claim.issueText {
                                    Label(issue, systemImage: "exclamationmark.triangle.fill")
                                        .font(.caption)
                                        .foregroundStyle(.orange)
                                }
                            }
                            Spacer()
                            StatusPill(text: claim.status == .active ? "Active" : "Returned", color: claim.status == .active ? .orange : .accentColor)
                        }
                        .padding(.vertical, 5)
                    }
                }
            }
            .navigationTitle("History")
        }
    }
}
