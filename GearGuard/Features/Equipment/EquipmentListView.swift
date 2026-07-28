import SwiftUI

struct EquipmentListView: View {
    @EnvironmentObject private var store: GearGuardStore
    @State private var showingEnrollment = false

    var body: some View {
        NavigationStack {
            List(store.equipment) { item in
                NavigationLink {
                    EquipmentDetailView(equipment: item)
                } label: {
                    HStack(spacing: 13) {
                        Image(systemName: icon(for: item.name))
                            .font(.title3)
                            .frame(width: 38, height: 38)
                            .foregroundStyle(GearTheme.forest)
                            .background(GearTheme.mint, in: RoundedRectangle(cornerRadius: 10))
                        VStack(alignment: .leading, spacing: 3) {
                            Text(item.name).font(.headline)
                            Text(item.internalSerial).font(.subheadline).foregroundStyle(.secondary)
                        }
                        Spacer()
                        StatusPill(text: "\(store.activeClaims(for: item.id).count) out", color: store.activeClaims(for: item.id).isEmpty ? .secondary : GearTheme.amber)
                    }
                    .padding(.vertical, 4)
                }
            }
            .navigationTitle("Equipment")
            .toolbar {
                Button { showingEnrollment = true } label: {
                    Label("Enroll equipment", systemImage: "plus")
                }
            }
            .sheet(isPresented: $showingEnrollment) {
                EnrollmentView()
            }
        }
    }

    private func icon(for name: String) -> String {
        let lower = name.lowercased()
        if lower.contains("camera") || lower.contains("canon") { return "camera.fill" }
        if lower.contains("mic") || lower.contains("røde") { return "mic.fill" }
        return "shippingbox.fill"
    }
}

private struct EquipmentDetailView: View {
    @EnvironmentObject private var store: GearGuardStore
    let equipment: Equipment

    var body: some View {
        List {
            Section("Equipment") {
                LabeledContent("Name", value: equipment.name)
                LabeledContent("Internal serial", value: equipment.internalSerial)
                LabeledContent("Status", value: equipment.isActive ? "Active" : "Retired")
            }
            Section("Tag") {
                LabeledContent("Payload", value: equipment.tagID)
                LabeledContent("Hardware UID", value: equipment.hardwareUID.isEmpty ? "Unavailable" : equipment.hardwareUID)
            }
            Section("Active claimants") {
                let active = store.activeClaims(for: equipment.id)
                if active.isEmpty {
                    Text("No active claims").foregroundStyle(.secondary)
                } else {
                    ForEach(active) { claim in
                        VStack(alignment: .leading) {
                            Text(claim.studentEmail)
                            Text(claim.checkedOutAt.formatted(date: .abbreviated, time: .shortened))
                                .font(.caption)
                                .foregroundStyle(.secondary)
                        }
                    }
                }
            }
        }
        .navigationTitle(equipment.name)
        .navigationBarTitleDisplayMode(.inline)
    }
}

private struct EnrollmentView: View {
    @Environment(\.dismiss) private var dismiss
    @EnvironmentObject private var store: GearGuardStore
    @StateObject private var nfc = NFCService()
    @State private var name = ""
    @State private var serial = "MC-"
    @State private var pendingTagID = TagCodec.generate()
    @State private var isWriting = false
    @State private var error: Error?

    var body: some View {
        NavigationStack {
            Form {
                Section("Equipment details") {
                    TextField("Display name", text: $name)
                    TextField("Internal serial", text: $serial)
                        .textInputAutocapitalization(.characters)
                }
                Section {
                    LabeledContent("New payload", value: pendingTagID)
                    Button {
                        writeTag()
                    } label: {
                        Label(isWriting ? "Writing…" : "Write and verify NFC tag", systemImage: "sensor.tag.radiowaves.forward.fill")
                    }
                    .disabled(name.trimmingCharacters(in: .whitespaces).isEmpty || serial.trimmingCharacters(in: .whitespaces).isEmpty || isWriting)
                    Button("Enroll demo tag") {
                        enroll(tagID: pendingTagID, UID: "SIMULATOR-\(Int.random(in: 1000...9999))")
                    }
                    .disabled(name.trimmingCharacters(in: .whitespaces).isEmpty || serial.trimmingCharacters(in: .whitespaces).isEmpty)
                } header: {
                    Text("NFC tag")
                } footer: {
                    Text("The backend record is created only after the NFC payload has been written and read back exactly.")
                }
            }
            .navigationTitle("Enroll equipment")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { dismiss() }
                }
            }
            .errorAlert($error)
        }
    }

    private func writeTag() {
        isWriting = true
        nfc.write(tagID: pendingTagID) { result in
            isWriting = false
            do {
                let scanned = try result.get()
                enroll(tagID: scanned.tagID, UID: scanned.hardwareUID)
            } catch {
                self.error = error
            }
        }
    }

    private func enroll(tagID: String, UID: String) {
        do {
            try store.enroll(name: name, serial: serial, tagID: tagID, hardwareUID: UID)
            dismiss()
        } catch {
            self.error = error
        }
    }
}
