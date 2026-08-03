import SwiftUI

struct EquipmentListView: View {
    @EnvironmentObject private var store: TrakrStore
    @State private var showingEnrollment = false

    var body: some View {
        NavigationStack {
            List(store.equipment) { item in
                NavigationLink {
                    EquipmentDetailView(equipmentID: item.id)
                } label: {
                    HStack(spacing: 13) {
                        Image(systemName: icon(for: item.name))
                            .font(.title3)
                            .frame(width: 38, height: 38)
                            .foregroundStyle(TrakrTheme.forest)
                            .background(TrakrTheme.mint, in: RoundedRectangle(cornerRadius: 10))
                        VStack(alignment: .leading, spacing: 3) {
                            Text(item.name).font(.headline)
                            Text(item.internalSerial).font(.subheadline).foregroundStyle(.secondary)
                        }
                        Spacer()
                        StatusPill(text: "\(store.activeClaims(for: item.id).count) out", color: store.activeClaims(for: item.id).isEmpty ? .secondary : TrakrTheme.amber)
                    }
                    .padding(.vertical, 4)
                }
            }
            .navigationTitle("Equipment")
            .toolbar {
                Button { showingEnrollment = true } label: {
                    Label("Enroll equipment", systemImage: "plus")
                }
                .accessibilityIdentifier("enroll-equipment")
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
    @EnvironmentObject private var store: TrakrStore
    let equipmentID: String
    @State private var showingEdit = false
    @State private var showingReplacement = false

    var body: some View {
        Group {
            if let equipment = store.equipment(withID: equipmentID) {
                List {
                    Section("Equipment") {
                        LabeledContent("Name", value: equipment.name)
                        LabeledContent("Internal serial", value: equipment.internalSerial)
                        LabeledContent("Status", value: equipment.isActive ? "Active" : "Retired")
                    }
                    Section {
                        LabeledContent("Payload", value: equipment.tagID)
                        LabeledContent("Hardware UID", value: equipment.hardwareUID.isEmpty ? "Unavailable" : equipment.hardwareUID)
                        Button("Replace tag") { showingReplacement = true }
                            .accessibilityIdentifier("replace-tag")
                    } header: {
                        Text("Tag")
                    } footer: {
                        Text("Replacing a tag keeps all history attached to this equipment record.")
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
                .toolbar {
                    Button("Edit") { showingEdit = true }
                        .accessibilityIdentifier("edit-equipment")
                }
                .sheet(isPresented: $showingEdit) {
                    EditEquipmentView(equipment: equipment)
                }
                .sheet(isPresented: $showingReplacement) {
                    TagReplacementView(equipment: equipment)
                }
            } else {
                EmptyState(icon: "shippingbox", title: "Equipment unavailable", message: "This equipment record could not be loaded.")
            }
        }
        .navigationBarTitleDisplayMode(.inline)
    }
}

private struct EditEquipmentView: View {
    @Environment(\.dismiss) private var dismiss
    @EnvironmentObject private var store: TrakrStore
    let equipment: Equipment
    @State private var name: String
    @State private var serial: String
    @State private var isActive: Bool
    @State private var error: Error?

    init(equipment: Equipment) {
        self.equipment = equipment
        _name = State(initialValue: equipment.name)
        _serial = State(initialValue: equipment.internalSerial)
        _isActive = State(initialValue: equipment.isActive)
    }

    var body: some View {
        NavigationStack {
            Form {
                Section("Equipment details") {
                    TextField("Display name", text: $name)
                        .accessibilityIdentifier("edit-name")
                    TextField("Internal serial", text: $serial)
                        .textInputAutocapitalization(.characters)
                        .accessibilityIdentifier("edit-serial")
                    Toggle("Active", isOn: $isActive)
                }
                Section {
                    Text("Retired equipment remains in history but its tag cannot be staged.")
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
            }
            .navigationTitle("Edit equipment")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { dismiss() }
                }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Save") {
                        Task {
                            do {
                                try await store.updateEquipmentForWorkflow(
                                    id: equipment.id,
                                    name: name,
                                    serial: serial,
                                    isActive: isActive
                                )
                                dismiss()
                            } catch {
                                self.error = error
                            }
                        }
                    }
                    .accessibilityIdentifier("save-equipment")
                }
            }
            .errorAlert($error)
        }
    }
}

private struct TagReplacementView: View {
    @Environment(\.dismiss) private var dismiss
    @EnvironmentObject private var store: TrakrStore
    @StateObject private var nfc = NFCService()
    let equipment: Equipment
    @State private var tagID = TagCodec.generate()
    @State private var isWriting = false
    @State private var error: Error?

    var body: some View {
        NavigationStack {
            Form {
                Section("Replacement tag") {
                    LabeledContent("Equipment", value: equipment.name)
                    LabeledContent("New payload", value: tagID)
                }
                Section {
                    Button {
                        write()
                    } label: {
                        Label(isWriting ? "Writing…" : "Write replacement tag", systemImage: "sensor.tag.radiowaves.forward.fill")
                    }
                    .disabled(isWriting)
                    Button("Use demo replacement") {
                        replace(UID: String(format: "F00D%04X", Int.random(in: 0...65535)))
                    }
                    .accessibilityIdentifier("replace-demo")
                } footer: {
                    Text("The previous payload becomes invalid immediately. Existing claims and history continue to reference the same equipment.")
                }
            }
            .navigationTitle("Replace tag")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") { dismiss() }
                }
            }
            .errorAlert($error)
        }
    }

    private func write() {
        isWriting = true
        nfc.write(tagID: tagID) { result in
            isWriting = false
            do {
                let scanned = try result.get()
                replace(UID: scanned.hardwareUID)
            } catch {
                self.error = error
            }
        }
    }

    private func replace(UID: String) {
        Task {
            do {
                try await store.replaceTagForWorkflow(equipmentID: equipment.id, tagID: tagID, hardwareUID: UID)
                dismiss()
            } catch {
                self.error = error
            }
        }
    }
}

private struct EnrollmentView: View {
    @Environment(\.dismiss) private var dismiss
    @EnvironmentObject private var store: TrakrStore
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
                        .accessibilityIdentifier("enroll-name")
                    TextField("Internal serial", text: $serial)
                        .textInputAutocapitalization(.characters)
                        .accessibilityIdentifier("enroll-serial")
                }
                Section {
                    LabeledContent("New payload", value: pendingTagID)
                    Button {
                        writeTag()
                    } label: {
                        Label(isWriting ? "Writing…" : "Write NFC tag", systemImage: "sensor.tag.radiowaves.forward.fill")
                    }
                    .disabled(name.trimmingCharacters(in: .whitespaces).isEmpty || serial.trimmingCharacters(in: .whitespaces).isEmpty || isWriting)
                    Button("Enroll demo tag") {
                        enroll(tagID: pendingTagID, UID: String(format: "F00D%04X", Int.random(in: 0...65535)))
                    }
                    .accessibilityIdentifier("enroll-demo")
                    .disabled(name.trimmingCharacters(in: .whitespaces).isEmpty || serial.trimmingCharacters(in: .whitespaces).isEmpty)
                } header: {
                    Text("NFC tag")
                } footer: {
                    Text("The backend record is created only after Core NFC confirms that the payload was written. Read-back verification is attempted when the tag remains connected.")
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
        Task {
            do {
                try await store.enrollForWorkflow(name: name, serial: serial, tagID: tagID, hardwareUID: UID)
                dismiss()
            } catch {
                self.error = error
            }
        }
    }
}
