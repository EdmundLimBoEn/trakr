import SwiftUI

struct CheckoutView: View {
    @EnvironmentObject private var store: GearGuardStore
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
                Section {
                    VStack(alignment: .leading, spacing: 8) {
                        Text("Tap each tag. Review once.")
                            .font(.title2.bold())
                        Text("Scan up to 20 items, then confirm their condition as one batch.")
                            .foregroundStyle(.secondary)
                    }
                    .listRowInsets(EdgeInsets(top: 18, leading: 20, bottom: 18, trailing: 20))
                }

                if staged.isEmpty {
                    Section {
                        EmptyState(icon: "sensor.tag.radiowaves.forward", title: "No equipment scanned", message: "Use Scan NFC tag, or add demo equipment in the simulator.")
                    }
                } else {
                    Section("Equipment · \(staged.count)") {
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
                    .disabled(condition == nil)
                    .padding()
                    .background(.ultraThinMaterial)
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
        guard store.isOnline else { error = GearGuardError.offline; return }
        nfc.scan { result in
            do {
                let scanned = try result.get()
                stage(try store.resolve(tagID: scanned.tagID))
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
        do {
            receipt = try store.confirmCheckout(items: submitted, requestID: requestID)
        } catch {
            self.error = error
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
                    .foregroundStyle(GearTheme.forest)
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
            VStack(spacing: 24) {
                Image(systemName: "checkmark.seal.fill")
                    .font(.system(size: 64))
                    .foregroundStyle(GearTheme.forest)
                VStack(spacing: 6) {
                    Text("Equipment checked out")
                        .font(.title.bold())
                    Text(receipt.timestamp.formatted(date: .abbreviated, time: .shortened))
                        .foregroundStyle(.secondary)
                }
                VStack(spacing: 0) {
                    ForEach(receipt.equipment) { item in
                        HStack {
                            Text(item.name)
                            Spacer()
                            Text(item.internalSerial).foregroundStyle(.secondary)
                        }
                        .padding()
                        if item.id != receipt.equipment.last?.id { Divider() }
                    }
                }
                .background(GearTheme.paper, in: RoundedRectangle(cornerRadius: 18))
                Text("Return equipment to a teacher when finished.")
                    .font(.callout)
                    .foregroundStyle(.secondary)
                Spacer()
                Button("Done", action: done)
                    .buttonStyle(.borderedProminent)
                    .controlSize(.large)
                    .frame(maxWidth: .infinity)
            }
            .padding(24)
            .interactiveDismissDisabled()
        }
    }
}

