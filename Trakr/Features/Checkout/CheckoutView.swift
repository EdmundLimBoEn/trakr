import SwiftUI

struct CheckoutView: View {
    @EnvironmentObject private var store: TrakrStore
    @EnvironmentObject private var featureFlags: FeatureFlagsStore
    @StateObject private var nfc = NFCService()
    @State private var staged: [StagedCheckoutItem] = []
    @State private var condition: ItemCondition?
    @State private var requestID = UUID().uuidString
    @State private var receipt: CheckoutReceipt?
    @State private var error: Error?
    @State private var feedback: String?

    var body: some View {
        NavigationStack {
            List {
                if staged.isEmpty {
                    Section {
                        EmptyState(icon: "sensor.tag.radiowaves.forward", title: "No equipment scanned", message: "Scan an NFC tag to add it to this batch.")
                    }
                } else {
                    Section("Equipment (\(staged.count))") {
                        ForEach($staged) { $item in
                            CheckoutItemRow(item: $item, showIssue: condition == .hasIssue)
                        }
                        .onDelete { staged.remove(atOffsets: $0) }
                    }
                    Section("Condition") {
                        Picker("Batch condition", selection: $condition) {
                            Text("Choose").tag(ItemCondition?.none)
                            ForEach(ItemCondition.allCases, id: \.self) { item in
                                Text(item.title).tag(Optional(item))
                            }
                        }
                        .accessibilityIdentifier("condition-picker")
                        if condition == .hasIssue {
                            Text("Select every affected item and add a short description.")
                                .font(.caption)
                                .foregroundStyle(.secondary)
                        }
                    }
                }

                Section {
                    ScanButton(title: "Scan NFC tag") { scan() }
                        .disabled(!store.isOnline)
                    if featureFlags.flags.isDemo {
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
                        .accessibilityIdentifier("add-demo-equipment")
                    }
                } footer: {
                    if !store.isOnline {
                        Label("Connect to the internet before scanning.", systemImage: "wifi.slash")
                            .foregroundStyle(.red)
                    } else if let feedback {
                        Text(feedback)
                    }
                }
            }
            .navigationTitle("Collect")
            .safeAreaInset(edge: .bottom) {
                if !staged.isEmpty {
                    Button {
                        confirm()
                    } label: {
                        Text("Confirm checkout")
                            .font(.headline)
                            .frame(maxWidth: .infinity)
                            .padding(.vertical, 6)
                    }
                    .buttonStyle(.borderedProminent)
                    .controlSize(.large)
                    .disabled(!canConfirm)
                    .padding()
                    .background(.ultraThinMaterial)
                    .accessibilityIdentifier("confirm-checkout")
                }
            }
            .sheet(item: $receipt) { receipt in
                CheckoutReceiptView(receipt: receipt) {
                    staged = []
                    condition = nil
                    requestID = UUID().uuidString
                    self.receipt = nil
                }
            }
            .errorAlert($error)
        }
    }

    private func scan() {
        guard store.isOnline else { error = TrakrError.offline; return }
        nfc.scan { result in
            do {
                let scanned = try result.get()
                Task {
                    do { stage(try await store.resolveForWorkflow(tagID: scanned.tagID)) }
                    catch { self.error = error }
                }
            } catch {
                self.error = error
            }
        }
    }

    private func stage(_ equipment: Equipment) {
        guard !staged.contains(where: { $0.id == equipment.id }) else {
            feedback = "Already in this batch."
            return
        }
        staged.append(StagedCheckoutItem(equipment: equipment))
        feedback = "\(equipment.name) added."
    }

    private func confirm() {
        guard let condition else { return }
        var submitted = staged
        if condition == .noIssues {
            submitted = submitted.map {
                var copy = $0
                copy.hasIssue = false
                copy.issueText = ""
                return copy
            }
        }
        Task {
            do {
                receipt = try await store.confirmCheckoutForWorkflow(
                    items: submitted,
                    condition: condition,
                    requestID: requestID
                )
            } catch {
                self.error = error
            }
        }
    }

    private var canConfirm: Bool {
        guard let condition else { return false }
        if condition == .noIssues { return true }
        let affected = staged.filter(\.hasIssue)
        return !affected.isEmpty && affected.allSatisfy {
            let text = $0.issueText.trimmingCharacters(in: .whitespacesAndNewlines)
            return !text.isEmpty && text.count <= 500
        }
    }
}

private struct CheckoutItemRow: View {
    @Binding var item: StagedCheckoutItem
    let showIssue: Bool

    var body: some View {
        VStack(alignment: .leading, spacing: 10) {
            HStack {
                    Image(systemName: "checkmark.circle.fill")
                        .foregroundStyle(.tint)
                VStack(alignment: .leading) {
                    Text(item.equipment.name).font(.headline)
                    Text(item.equipment.internalSerial).font(.caption).foregroundStyle(.secondary)
                }
                Spacer()
            }
            if showIssue {
                Toggle("Issue with this item", isOn: $item.hasIssue)
                if item.hasIssue {
                    TextField("Describe the issue", text: $item.issueText, axis: .vertical)
                        .lineLimit(2...4)
                        .textFieldStyle(.roundedBorder)
                }
            }
        }
        .padding(.vertical, 5)
    }
}

private struct CheckoutReceiptView: View {
    let receipt: CheckoutReceipt
    let done: () -> Void

    var body: some View {
        NavigationStack {
            List {
                Section {
                    VStack(spacing: 8) {
                        Image(systemName: "checkmark.circle.fill")
                            .font(.system(size: 44))
                            .foregroundStyle(.tint)
                            .frame(maxWidth: .infinity)
                            .padding(.top, 8)
                        Text("Equipment checked out")
                            .font(.title2.weight(.semibold))
                            .frame(maxWidth: .infinity)
                        Text(receipt.timestamp.formatted(date: .abbreviated, time: .shortened))
                            .foregroundStyle(.secondary)
                            .frame(maxWidth: .infinity)
                    }
                    .multilineTextAlignment(.center)
                    .listRowBackground(Color.clear)
                }

                Section("Items") {
                    ForEach(receipt.equipment) { item in
                        LabeledContent(item.name, value: item.internalSerial)
                    }
                }

                Section {
                    Text("Return equipment to a teacher when finished.")
                        .foregroundStyle(.secondary)
                }
            }
            .navigationTitle("Receipt")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .confirmationAction) {
                    Button("Done", action: done)
                        .accessibilityIdentifier("receipt-done")
                }
            }
            .interactiveDismissDisabled()
        }
    }
}
