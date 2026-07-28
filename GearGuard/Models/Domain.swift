import Foundation

enum UserRole: String, Codable, CaseIterable {
    case student
    case teacher

    var title: String { rawValue.capitalized }
}

struct GearUser: Codable, Identifiable, Equatable {
    let id: String
    let email: String
    let displayName: String
    let role: UserRole
}

struct Equipment: Codable, Identifiable, Hashable {
    let id: String
    var name: String
    var internalSerial: String
    var tagID: String
    var hardwareUID: String
    var isActive: Bool
    var enrolledAt: Date
}

enum ClaimStatus: String, Codable {
    case active
    case returned
}

enum ItemCondition: String, Codable, CaseIterable {
    case noIssues = "no_issues"
    case hasIssue = "has_issue"

    var title: String {
        self == .noIssues ? "No issues" : "Has issue"
    }
}

struct Claim: Codable, Identifiable, Hashable {
    let id: String
    let checkoutBatchID: String
    var returnBatchID: String?
    let equipmentID: String
    let tagIDAtCheckout: String
    let studentID: String
    let studentEmail: String
    let condition: ItemCondition
    let issueText: String?
    var status: ClaimStatus
    let checkedOutAt: Date
    var returnedAt: Date?
    var returnedByTeacherID: String?
}

struct AuditEvent: Codable, Identifiable {
    enum Kind: String, Codable {
        case equipmentEnrolled
        case checkoutConfirmed
        case returnConfirmed
        case returnWithoutClaim
    }

    let id: String
    let kind: Kind
    let actorID: String
    let equipmentIDs: [String]
    let claimIDs: [String]
    let createdAt: Date
}

struct StagedCheckoutItem: Identifiable, Equatable {
    let equipment: Equipment
    var hasIssue = false
    var issueText = ""

    var id: String { equipment.id }
}

struct ReturnCandidate: Identifiable, Equatable {
    let equipment: Equipment
    let activeClaims: [Claim]

    var id: String { equipment.id }
}

struct CheckoutReceipt: Identifiable {
    let id: String
    let equipment: [Equipment]
    let timestamp: Date
}

enum GearGuardError: LocalizedError, Equatable {
    case invalidEmail
    case unsupportedDomain
    case offline
    case unknownTag
    case inactiveTag
    case duplicateTag
    case duplicateSerial
    case emptyBatch
    case invalidIssue
    case nfcUnavailable
    case invalidTagPayload
    case tagNotWritable
    case tagTooSmall
    case verificationFailed

    var errorDescription: String? {
        switch self {
        case .invalidEmail: "Enter a valid school email address."
        case .unsupportedDomain: "Use an approved sst.edu.sg or *.ssts.edu.sg account."
        case .offline: "An internet connection is required."
        case .unknownTag: "Tag not enrolled."
        case .inactiveTag: "Tag inactive."
        case .duplicateTag: "This tag is already enrolled."
        case .duplicateSerial: "This internal serial is already in use."
        case .emptyBatch: "Scan at least one item."
        case .invalidIssue: "Add issue details for each affected item."
        case .nfcUnavailable: "NFC scanning is not available on this device."
        case .invalidTagPayload: "This is not a GearGuard tag."
        case .tagNotWritable: "This NFC tag cannot be written."
        case .tagTooSmall: "This NFC tag does not have enough capacity."
        case .verificationFailed: "The NFC write could not be verified."
        }
    }
}

enum RoleDeriver {
    static func role(for email: String) throws -> UserRole {
        let parts = email.lowercased().split(separator: "@", omittingEmptySubsequences: false)
        guard parts.count == 2, !parts[0].isEmpty else { throw GearGuardError.invalidEmail }
        let domain = String(parts[1])
        if domain == "sst.edu.sg" { return .teacher }
        if domain.hasSuffix(".ssts.edu.sg"), domain != "ssts.edu.sg" { return .student }
        throw GearGuardError.unsupportedDomain
    }
}

enum TagCodec {
    private static let alphabet = Array("0123456789ABCDEFGHJKMNPQRSTVWXYZ")

    static func generate() -> String {
        "gg:" + String((0..<26).map { _ in alphabet.randomElement()! })
    }

    static func isValid(_ value: String) -> Bool {
        guard value.hasPrefix("gg:"), value.count == 29 else { return false }
        return value.dropFirst(3).allSatisfy { alphabet.contains($0) }
    }

    static func normalizedUID(_ bytes: [UInt8]) -> String {
        bytes.map { String(format: "%02X", $0) }.joined()
    }
}

