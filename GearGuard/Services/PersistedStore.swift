import Foundation

struct StoreSnapshot: Codable {
    var equipment: [Equipment] = []
    var claims: [Claim] = []
    var auditEvents: [AuditEvent] = []
    var requestResults: [String: String] = [:]
}

protocol SnapshotPersisting {
    func load() -> StoreSnapshot?
    func save(_ snapshot: StoreSnapshot)
}

struct UserDefaultsSnapshotPersistence: SnapshotPersisting {
    private let key = "GearGuard.Store.v1"

    func load() -> StoreSnapshot? {
        guard let data = UserDefaults.standard.data(forKey: key) else { return nil }
        return try? JSONDecoder().decode(StoreSnapshot.self, from: data)
    }

    func save(_ snapshot: StoreSnapshot) {
        guard let data = try? JSONEncoder().encode(snapshot) else { return }
        UserDefaults.standard.set(data, forKey: key)
    }
}

struct MemorySnapshotPersistence: SnapshotPersisting {
    func load() -> StoreSnapshot? { nil }
    func save(_ snapshot: StoreSnapshot) {}
}

