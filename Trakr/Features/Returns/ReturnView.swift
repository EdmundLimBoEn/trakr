import SwiftUI

struct ReturnView: View {
    @EnvironmentObject private var store: TrakrStore
    @StateObject private var nfc = NFCService()
    @State private var staged: [ReturnCandidate] = []
    @State private var requestID = UUID().uuidString
    @State private var error: Error?
    @State private var showingConfirmation = false
    @State private var confirmationMessage = ""

    var body: some View {
        NavigationStack {
            List {
                Section {
                    VStack(alignment: .leading, spacing: 8) {
                        Text("Scan returns")
                            .font(.title2.bold())
                        Text("Every active claim for each scanned item will be closed together.")
                            .foregroundStyle(.secondary)
                    }
                    .listRowInsets(EdgeInsets(top: 18, leading: 20, bottom: 18, trailing: 20))
                }
                if staged.isEmpty {
                    Section {
                        EmptyState(icon: "arrow.uturn.backward.circle", title: "No returns staged", message: "Scan tags to see all active claimants before confirming.")
                    }
                } else {
                    Section("Return batch · \(staged.count)") {
                        ForEach(staged) { candidate in
                            VStack(alignment: .leading, spacing: 8) {
                                HStack {
                                    Text(candidate.equipment.name).font(.headline)
                                    Spacer()
                                    Text(candidate.equipment.internalSerial)
                                        .font(.caption)
                                        .foregroundStyle(.secondary)
                                }
                                if candidate.activeClaims.isEmpty {
                                    StatusPill(text: "No active claims", color: .secondary)
                                } else {
                                    ForEach(candidate.activeClaims) { claim in
                                        Label(claim.studentEmail, systemImage: "person.fill")
                                            .font(.subheadline)
                                    }
                                }
                            }
                            .padding(.vertical, 4)
                        }
                        .onDelete { staged.remove(atOffsets: $0) }
                    }
                }
                Section {
                    ScanButton(title: "Scan return tag") { scan() }
                        .disabled(!store.isOnline)
                    Menu {
                        ForEach(store.equipment.filter(\.isActive)) { item in
                            Button(item.name) { stage(item) }
                                .disabled(staged.contains { $0.id == item.id })
                        }
                    } label: {
                        Label("Add demo equipment", systemImage: "plus.circle")
                            .frame(maxWidth: .infinity)
                    }
                    .buttonStyle(.bordered)
                    .accessibilityIdentifier("add-demo-return")
                } footer: {
                    if !store.isOnline {
                        Label("Reconnect before scanning or confirming.", systemImage: "wifi.slash")
                            .foregroundStyle(.red)
                    }
                }
                if !staged.isEmpty {
                    Section {
                        Button {
                            confirm()
                        } label: {
                            Text("Confirm return")
                                .font(.headline)
                                .frame(maxWidth: .infinity)
                                .padding(.vertical, 8)
                        }
                        .buttonStyle(.borderedProminent)
                        .controlSize(.large)
                        .accessibilityIdentifier("confirm-return")
                    }
                }
            }
            .navigationTitle("Returns")
            .fullScreenCover(isPresented: $showingConfirmation) {
                ReturnConfirmationView(message: confirmationMessage) {
                        staged = []
                        requestID = UUID().uuidString
                        showingConfirmation = false
                    }
            }
            .errorAlert($error)
        }
    }

    private func scan() {
        guard store.isOnline else { error = TrakrError.offline; return }
        nfc.scan { result in
            do {
                let tagID = try result.get().tagID
                Task {
                    do { stage(try await store.resolveForWorkflow(tagID: tagID)) }
                    catch { self.error = error }
                }
            }
            catch { self.error = error }
        }
    }

    private func stage(_ equipment: Equipment) {
        guard !staged.contains(where: { $0.id == equipment.id }) else { return }
        staged.append(ReturnCandidate(equipment: equipment, activeClaims: store.activeClaims(for: equipment.id)))
    }

    private func confirm() {
        confirmationMessage = "Recording return…"
        showingConfirmation = true
        Task {
            do {
                let count = try await store.confirmReturnForWorkflow(items: staged, requestID: requestID).resolvedCount
                confirmationMessage = count == 0 ? "No active claims were found. An audit event was still created." : "\(count) active \(count == 1 ? "claim was" : "claims were") closed."
            } catch {
                showingConfirmation = false
                self.error = error
            }
        }
    }
}

private struct ReturnConfirmationView: View {
    let message: String
    let done: () -> Void

    var body: some View {
        NavigationStack {
            VStack(spacing: 24) {
                Image(systemName: "arrow.uturn.backward.circle.fill")
                    .font(.system(size: 64))
                    .foregroundStyle(TrakrTheme.forest)
                VStack(spacing: 8) {
                    Text("Return recorded")
                        .font(.title.bold())
                    Text(message)
                        .foregroundStyle(.secondary)
                        .multilineTextAlignment(.center)
                }
                Spacer()
                Button("Done", action: done)
                    .buttonStyle(.borderedProminent)
                    .controlSize(.large)
                    .frame(maxWidth: .infinity)
                    .accessibilityIdentifier("return-done")
            }
            .padding(24)
            .interactiveDismissDisabled()
        }
    }
}
