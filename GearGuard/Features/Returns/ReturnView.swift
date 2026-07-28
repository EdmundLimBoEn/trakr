import SwiftUI

struct ReturnView: View {
    @EnvironmentObject private var store: GearGuardStore
    @StateObject private var nfc = NFCService()
    @State private var staged: [ReturnCandidate] = []
    @State private var requestID = UUID().uuidString
    @State private var error: Error?
    @State private var confirmation: ReturnConfirmation?

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
                } footer: {
                    if !store.isOnline {
                        Label("Reconnect before scanning or confirming.", systemImage: "wifi.slash")
                            .foregroundStyle(.red)
                    }
                }
            }
            .navigationTitle("Returns")
            .safeAreaInset(edge: .bottom) {
                if !staged.isEmpty {
                    Button("Confirm return") { confirm() }
                        .font(.headline)
                        .buttonStyle(.borderedProminent)
                        .controlSize(.large)
                        .frame(maxWidth: .infinity)
                        .padding()
                        .background(.ultraThinMaterial)
                }
            }
            .alert(item: $confirmation) { confirmation in
                Alert(
                    title: Text("Return recorded"),
                    message: Text(confirmation.message),
                    dismissButton: .default(Text("Done")) {
                        staged = []
                        requestID = UUID().uuidString
                    }
                )
            }
            .errorAlert($error)
        }
    }

    private func scan() {
        guard store.isOnline else { error = GearGuardError.offline; return }
        nfc.scan { result in
            do { stage(try store.resolve(tagID: try result.get().tagID)) }
            catch { self.error = error }
        }
    }

    private func stage(_ equipment: Equipment) {
        guard !staged.contains(where: { $0.id == equipment.id }) else { return }
        staged.append(ReturnCandidate(equipment: equipment, activeClaims: store.activeClaims(for: equipment.id)))
    }

    private func confirm() {
        do {
            let count = try store.confirmReturn(items: staged, requestID: requestID)
            confirmation = ReturnConfirmation(message: count == 0 ? "No active claims were found. An audit event was still created." : "\(count) active \(count == 1 ? "claim was" : "claims were") closed.")
        } catch {
            self.error = error
        }
    }
}

private struct ReturnConfirmation: Identifiable {
    let id = UUID()
    let message: String
}

