package systems.edmundlim.trakr.data

import systems.edmundlim.trakr.domain.Claim
import systems.edmundlim.trakr.domain.ClaimStatus
import systems.edmundlim.trakr.domain.Equipment
import systems.edmundlim.trakr.domain.EquipmentIssue
import systems.edmundlim.trakr.domain.GearUser
import systems.edmundlim.trakr.domain.IssueStatus
import systems.edmundlim.trakr.domain.ItemCondition
import systems.edmundlim.trakr.domain.RepositorySnapshot
import systems.edmundlim.trakr.domain.ResolvedTag
import systems.edmundlim.trakr.domain.ClaimantSummary
import systems.edmundlim.trakr.domain.UserRole
import java.time.Instant
import java.time.temporal.ChronoUnit
import java.util.UUID

class DemoRepository {
    private val equipment = mutableListOf(
        Equipment("camera", "Canon R50", "MC-CAM-01", "tr:01J9Z6M4Y7X3N8K2D5P0Q1R4TC", "04A1B2C3D4E5F6"),
        Equipment("tripod", "Manfrotto Tripod", "MC-TRI-01", "tr:01J9Z6M4Y7X3N8K2D5P0Q1R4TD", "04A1B2C3D4E5F7"),
        Equipment("mic", "Rode Wireless GO", "MC-MIC-01", "tr:01J9Z6M4Y7X3N8K2D5P0Q1R4TE", "04A1B2C3D4E5F8"),
    )
    private val claims = mutableListOf(
        Claim(
            id = "demo-active-claim",
            equipmentId = "camera",
            studentId = "demo-other-student",
            studentEmail = "jamie@media.ssts.edu.sg",
            status = ClaimStatus.ACTIVE,
            checkedOutAt = Instant.now().minus(3, ChronoUnit.HOURS),
        ),
    )
    private val issues = mutableListOf<EquipmentIssue>()
    private val requestResults = mutableMapOf<String, String>()

    fun demoUser(role: UserRole): GearUser =
        if (role == UserRole.TEACHER) {
            GearUser("demo-teacher", "teacher@sst.edu.sg", "Ms Tan", role)
        } else {
            GearUser("demo-student", "alex@media.ssts.edu.sg", "Alex Lim", role)
        }

    fun snapshot(user: GearUser): RepositorySnapshot {
        val visibleClaims = if (user.role == UserRole.TEACHER) claims else claims.filter { it.studentId == user.id }
        val visibleIssues = if (user.role == UserRole.TEACHER) issues else {
            val claimIds = visibleClaims.mapTo(mutableSetOf()) { it.id }
            issues.filter { it.claimId in claimIds }
        }
        return RepositorySnapshot(equipment.toList(), visibleClaims, visibleIssues)
    }

    fun resolve(tagId: String): ResolvedTag {
        val item = equipment.firstOrNull { it.tagId == tagId && it.isActive }
            ?: return ResolvedTag(tagId, "unknown", null, emptyList())
        val active = claims.filter { it.equipmentId == item.id && it.status == ClaimStatus.ACTIVE }
            .map { ClaimantSummary(it.studentId, it.studentEmail, it.checkedOutAt) }
        return ResolvedTag(tagId, "active", item, active)
    }

    fun checkout(user: GearUser, items: List<Pair<Equipment, String?>>, requestId: String): String {
        require(user.role == UserRole.STUDENT)
        requestResults[requestId]?.let { return it }
        require(items.isNotEmpty() && items.size <= 20)
        val batchId = UUID.randomUUID().toString()
        val now = Instant.now()
        items.forEach { (item, issueText) ->
            val claim = Claim(
                id = UUID.randomUUID().toString(),
                equipmentId = item.id,
                studentId = user.id,
                studentEmail = user.email,
                status = ClaimStatus.ACTIVE,
                checkedOutAt = now,
            )
            claims += claim
            if (!issueText.isNullOrBlank()) {
                issues += EquipmentIssue(
                    id = UUID.randomUUID().toString(),
                    claimId = claim.id,
                    equipmentId = item.id,
                    text = issueText.trim(),
                    status = IssueStatus.OPEN,
                    reportedAt = now,
                )
            }
        }
        requestResults[requestId] = batchId
        return batchId
    }

    fun returnItems(user: GearUser, items: List<Equipment>, requestId: String): Int {
        require(user.role == UserRole.TEACHER)
        if (requestResults.containsKey(requestId)) return 0
        val ids = items.mapTo(mutableSetOf()) { it.id }
        var resolved = 0
        claims.indices.forEach { index ->
            val claim = claims[index]
            if (claim.equipmentId in ids && claim.status == ClaimStatus.ACTIVE) {
                claims[index] = claim.copy(status = ClaimStatus.RETURNED, returnedAt = Instant.now())
                resolved += 1
            }
        }
        requestResults[requestId] = UUID.randomUUID().toString()
        return resolved
    }

    fun enroll(name: String, serial: String, tagId: String, uid: String): Equipment {
        require(name.trim().isNotEmpty() && name.trim().length <= 100)
        require(serial.trim().isNotEmpty() && serial.trim().length <= 50)
        require(equipment.none { it.internalSerial.equals(serial.trim(), ignoreCase = true) })
        require(equipment.none { it.tagId == tagId })
        return Equipment(UUID.randomUUID().toString(), name.trim(), serial.trim(), tagId, uid).also(equipment::add)
    }

    fun updateIssue(issueId: String, status: IssueStatus) {
        val index = issues.indexOfFirst { it.id == issueId }
        require(index >= 0)
        issues[index] = issues[index].copy(status = status)
    }
}
