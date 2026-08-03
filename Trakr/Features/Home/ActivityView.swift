import SwiftUI

struct ActivityView: View {
    @EnvironmentObject private var store: TrakrStore

    var body: some View {
        NavigationStack {
            Group {
                if let user = store.currentUser, store.notifications(for: user).isEmpty {
                    EmptyState(icon: "bell", title: "No activity yet", message: "Checkout, return, issue, and overdue updates appear here.")
                } else if let user = store.currentUser {
                    List(store.notifications(for: user)) { notification in
                        NotificationRow(notification: notification)
                            .contentShape(Rectangle())
                            .onTapGesture { store.markNotificationRead(notification.id) }
                    }
                }
            }
            .navigationTitle("Activity")
        }
    }
}

struct TeacherDashboardView: View {
    @EnvironmentObject private var store: TrakrStore
    @State private var error: Error?

    var body: some View {
        NavigationStack {
            List {
                Section {
                    HStack(spacing: 12) {
                        metric(value: store.equipment.count, label: "Equipment")
                        metric(value: store.claims.filter { $0.status == .active }.count, label: "Active claims")
                        metric(value: store.issues(status: .open).count, label: "Open issues")
                    }
                    .listRowInsets(EdgeInsets(top: 12, leading: 16, bottom: 12, trailing: 16))
                }

                Section("Issues requiring attention") {
                    let unresolved = store.issues.filter { $0.status != .resolved }
                    if unresolved.isEmpty {
                        Label("No unresolved issues", systemImage: "checkmark.circle.fill")
                            .foregroundStyle(TrakrTheme.pink)
                    } else {
                        ForEach(unresolved) { issue in
                            IssueRow(issue: issue) { status in
                                Task {
                                    do { try await store.updateIssueForWorkflow(id: issue.id, status: status) }
                                    catch { self.error = error }
                                }
                            }
                        }
                    }
                }

                Section("Notifications") {
                    if let user = store.currentUser {
                        let updates = Array(store.notifications(for: user).prefix(8))
                        if updates.isEmpty {
                            Text("No teacher notifications").foregroundStyle(.secondary)
                        } else {
                            ForEach(updates) { notification in
                                NotificationRow(notification: notification)
                                    .contentShape(Rectangle())
                                    .onTapGesture { store.markNotificationRead(notification.id) }
                            }
                        }
                    }
                }
            }
            .navigationTitle("Overview")
            .refreshable {
                if store.isCloudSession {
                    do { try await store.refreshFromFirebase() }
                    catch { self.error = error }
                } else {
                    store.processOverdue()
                }
            }
            .errorAlert($error)
        }
    }

    private func metric(value: Int, label: String) -> some View {
        VStack(spacing: 4) {
            Text(value.formatted())
                .font(.title2.bold())
                .foregroundStyle(TrakrTheme.pink)
            Text(label)
                .font(.caption)
                .foregroundStyle(.secondary)
                .multilineTextAlignment(.center)
        }
        .frame(maxWidth: .infinity)
    }
}

private struct IssueRow: View {
    @EnvironmentObject private var store: TrakrStore
    let issue: EquipmentIssue
    let update: (IssueStatus) -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack {
                VStack(alignment: .leading, spacing: 2) {
                    Text(store.equipment(withID: issue.equipmentID)?.name ?? "Equipment")
                        .font(.headline)
                    Text(issue.reportedByStudentEmail)
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
                Spacer()
                Menu {
                    ForEach(IssueStatus.allCases, id: \.self) { status in
                        Button(status.title) { update(status) }
                    }
                } label: {
                    StatusPill(text: issue.status.title, color: issue.status == .open ? .orange : TrakrTheme.pink)
                }
            }
            Text(issue.text)
                .font(.subheadline)
            Text(issue.reportedAt.formatted(date: .abbreviated, time: .shortened))
                .font(.caption2)
                .foregroundStyle(.secondary)
        }
        .padding(.vertical, 4)
    }
}

private struct NotificationRow: View {
    let notification: GearNotification

    var body: some View {
        HStack(alignment: .top, spacing: 12) {
            Image(systemName: icon)
                .font(.title3)
                .foregroundStyle(color)
                .frame(width: 30)
            VStack(alignment: .leading, spacing: 4) {
                HStack {
                    Text(notification.title).font(.headline)
                    if !notification.isRead {
                        Circle()
                            .fill(Color.blue)
                            .frame(width: 7, height: 7)
                    }
                }
                Text(notification.message)
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
                Text(notification.createdAt.formatted(date: .abbreviated, time: .shortened))
                    .font(.caption2)
                    .foregroundStyle(.tertiary)
            }
        }
        .padding(.vertical, 4)
    }

    private var icon: String {
        switch notification.kind {
        case .checkout: "shippingbox.fill"
        case .returned: "arrow.uturn.backward.circle.fill"
        case .issue: "exclamationmark.triangle.fill"
        case .overdue: "clock.badge.exclamationmark.fill"
        }
    }

    private var color: Color {
        switch notification.kind {
        case .checkout, .returned: TrakrTheme.pink
        case .issue, .overdue: .orange
        }
    }
}
