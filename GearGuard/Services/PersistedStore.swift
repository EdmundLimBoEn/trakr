import Foundation

struct StoreSnapshot: Codable {
    var equipment: [Equipment] = []
    var claims: [Claim] = []
    var issues: [EquipmentIssue] = []
    var notifications: [GearNotification] = []
    var auditEvents: [AuditEvent] = []
    var inactiveTagIDs: Set<String> = []
    var requestResults: [String: String] = [:]

    init(
        equipment: [Equipment] = [],
        claims: [Claim] = [],
        issues: [EquipmentIssue] = [],
        notifications: [GearNotification] = [],
        auditEvents: [AuditEvent] = [],
        inactiveTagIDs: Set<String> = [],
        requestResults: [String: String] = [:]
    ) {
        self.equipment = equipment
        self.claims = claims
        self.issues = issues
        self.notifications = notifications
        self.auditEvents = auditEvents
        self.inactiveTagIDs = inactiveTagIDs
        self.requestResults = requestResults
    }

    private enum CodingKeys: String, CodingKey {
        case equipment, claims, issues, notifications, auditEvents, inactiveTagIDs, requestResults
    }

    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        equipment = try container.decodeIfPresent([Equipment].self, forKey: .equipment) ?? []
        claims = try container.decodeIfPresent([Claim].self, forKey: .claims) ?? []
        issues = try container.decodeIfPresent([EquipmentIssue].self, forKey: .issues) ?? []
        notifications = try container.decodeIfPresent([GearNotification].self, forKey: .notifications) ?? []
        auditEvents = try container.decodeIfPresent([AuditEvent].self, forKey: .auditEvents) ?? []
        inactiveTagIDs = try container.decodeIfPresent(Set<String>.self, forKey: .inactiveTagIDs) ?? []
        requestResults = try container.decodeIfPresent([String: String].self, forKey: .requestResults) ?? [:]
    }
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
