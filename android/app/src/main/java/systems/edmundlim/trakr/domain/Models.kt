package systems.edmundlim.trakr.domain

import java.security.SecureRandom
import java.time.Instant

enum class UserRole { STUDENT, TEACHER }

data class GearUser(
    val id: String,
    val email: String,
    val displayName: String,
    val role: UserRole,
)

data class Equipment(
    val id: String,
    val name: String,
    val internalSerial: String,
    val tagId: String,
    val hardwareUid: String = "",
    val isActive: Boolean = true,
)

enum class ClaimStatus { ACTIVE, RETURNED }
enum class ItemCondition { NO_ISSUES, HAS_ISSUE }
enum class IssueStatus { OPEN, ACKNOWLEDGED, RESOLVED }

data class Claim(
    val id: String,
    val equipmentId: String,
    val studentId: String,
    val studentEmail: String,
    val status: ClaimStatus,
    val checkedOutAt: Instant,
    val returnedAt: Instant? = null,
)

data class EquipmentIssue(
    val id: String,
    val claimId: String,
    val equipmentId: String,
    val text: String,
    val status: IssueStatus,
    val reportedAt: Instant,
)

data class StagedCheckoutItem(
    val equipment: Equipment,
    val hasIssue: Boolean = false,
    val issueText: String = "",
)

data class ReturnCandidate(
    val equipment: Equipment,
    val activeClaims: List<Claim>,
)

data class ResolvedTag(
    val tagId: String,
    val status: String,
    val equipment: Equipment?,
    val activeClaimants: List<ClaimantSummary>,
)

data class ClaimantSummary(
    val studentId: String,
    val studentEmail: String,
    val checkedOutAt: Instant?,
)

data class RepositorySnapshot(
    val equipment: List<Equipment> = emptyList(),
    val claims: List<Claim> = emptyList(),
    val issues: List<EquipmentIssue> = emptyList(),
)

object RoleDeriver {
    fun derive(email: String): UserRole {
        val normalized = email.trim().lowercase()
        val parts = normalized.split("@")
        require(parts.size == 2 && parts[0].isNotBlank()) { "Enter a valid school email address." }
        val domain = parts[1]
        return when {
            domain == "sst.edu.sg" -> UserRole.TEACHER
            domain != "ssts.edu.sg" && domain.endsWith(".ssts.edu.sg") -> UserRole.STUDENT
            else -> error("Use an approved sst.edu.sg or *.ssts.edu.sg account.")
        }
    }
}

object TagCodec {
    private const val ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ"
    private val random = SecureRandom()
    private val pattern = Regex("^tr:[0-9A-HJKMNP-TV-Z]{26}$")

    fun generate(): String = buildString {
        append("tr:")
        repeat(26) { append(ALPHABET[random.nextInt(ALPHABET.length)]) }
    }

    fun isValid(value: String): Boolean = pattern.matches(value)

    fun normalizeUid(bytes: ByteArray): String =
        bytes.joinToString(separator = "") { "%02X".format(it.toInt() and 0xFF) }
}
