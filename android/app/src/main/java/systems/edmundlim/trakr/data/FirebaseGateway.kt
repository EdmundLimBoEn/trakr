package systems.edmundlim.trakr.data

import android.app.Activity
import android.content.Context
import androidx.credentials.CredentialManager
import androidx.credentials.CustomCredential
import androidx.credentials.GetCredentialRequest
import com.google.android.libraries.identity.googleid.GetSignInWithGoogleOption
import com.google.android.libraries.identity.googleid.GoogleIdTokenCredential
import com.google.firebase.Firebase
import com.google.firebase.FirebaseApp
import com.google.firebase.Timestamp
import com.google.firebase.auth.GoogleAuthProvider
import com.google.firebase.auth.auth
import com.google.firebase.firestore.FieldValue
import com.google.firebase.firestore.Query
import com.google.firebase.firestore.firestore
import com.google.firebase.installations.FirebaseInstallations
import com.google.firebase.messaging.FirebaseMessaging
import kotlinx.coroutines.tasks.await
import systems.edmundlim.trakr.R
import systems.edmundlim.trakr.domain.Claim
import systems.edmundlim.trakr.domain.ClaimStatus
import systems.edmundlim.trakr.domain.ClaimantSummary
import systems.edmundlim.trakr.domain.Equipment
import systems.edmundlim.trakr.domain.EquipmentIssue
import systems.edmundlim.trakr.domain.GearUser
import systems.edmundlim.trakr.domain.IssueStatus
import systems.edmundlim.trakr.domain.RepositorySnapshot
import systems.edmundlim.trakr.domain.ResolvedTag
import systems.edmundlim.trakr.domain.RoleDeriver
import systems.edmundlim.trakr.domain.UserRole
import java.time.Instant

class FirebaseGateway(private val context: Context) {
    private val auth get() = Firebase.auth
    private val firestore get() = Firebase.firestore

    val isConfigured: Boolean
        get() = FirebaseApp.getApps(context).isNotEmpty()

    suspend fun signIn(activity: Activity): GearUser {
        check(isConfigured) { "Firebase credentials are not installed in this build." }
        val clientId = webClientId()
        check(clientId.isNotBlank()) { "Google OAuth web client ID is missing." }
        val option = GetSignInWithGoogleOption.Builder(clientId).build()
        val request = GetCredentialRequest.Builder().addCredentialOption(option).build()
        val response = CredentialManager.create(activity).getCredential(activity, request)
        val credential = response.credential
        check(
            credential is CustomCredential &&
                credential.type == GoogleIdTokenCredential.TYPE_GOOGLE_ID_TOKEN_CREDENTIAL,
        ) { "Google returned an unsupported credential." }
        val googleCredential = GoogleIdTokenCredential.createFrom(credential.data)
        val firebaseCredential = GoogleAuthProvider.getCredential(googleCredential.idToken, null)
        val firebaseUser = requireNotNull(auth.signInWithCredential(firebaseCredential).await().user)
        check(firebaseUser.isEmailVerified) { "Verify your school Google account before signing in." }

        val email = requireNotNull(firebaseUser.email).lowercase()
        val role = RoleDeriver.derive(email)
        val user = GearUser(
            firebaseUser.uid,
            email,
            firebaseUser.displayName.orEmpty().ifBlank { email.substringBefore("@") },
            role,
        )
        upsertProfile(user)
        registerDevice()
        return user
    }

    fun currentUser(): GearUser? {
        if (!isConfigured) return null
        val user = auth.currentUser ?: return null
        val email = user.email?.lowercase() ?: return null
        val role = runCatching { RoleDeriver.derive(email) }.getOrNull() ?: return null
        return GearUser(user.uid, email, user.displayName.orEmpty().ifBlank { email.substringBefore("@") }, role)
    }

    fun signOut() {
        if (isConfigured) auth.signOut()
    }

    suspend fun snapshot(user: GearUser): RepositorySnapshot {
        val claimsQuery = if (user.role == UserRole.TEACHER) {
            firestore.collection("claims").orderBy("checkedOutAt", Query.Direction.DESCENDING)
        } else {
            firestore.collection("claims")
                .whereEqualTo("studentUid", user.id)
                .orderBy("checkedOutAt", Query.Direction.DESCENDING)
        }
        val issuesQuery = if (user.role == UserRole.TEACHER) {
            firestore.collection("issues").orderBy("reportedAt", Query.Direction.DESCENDING)
        } else {
            firestore.collection("issues")
                .whereEqualTo("reportedByStudentUid", user.id)
                .orderBy("reportedAt", Query.Direction.DESCENDING)
        }
        val claimsTask = claimsQuery.get()
        val issuesTask = issuesQuery.get()
        val equipmentTask = firestore.collection("equipment").get()
        val equipment = equipmentTask.await().documents.mapNotNull { document ->
            Equipment(
                id = document.id,
                name = document.getString("name") ?: return@mapNotNull null,
                internalSerial = document.getString("internalSerial").orEmpty(),
                tagId = document.getString("activeTagId").orEmpty(),
                isActive = document.getString("status") == "active",
            )
        }
        val claims = claimsTask.await().documents.mapNotNull { document ->
            Claim(
                id = document.id,
                equipmentId = document.getString("equipmentId") ?: return@mapNotNull null,
                studentId = document.getString("studentUid").orEmpty(),
                studentEmail = document.getString("studentEmail").orEmpty(),
                status = if (document.getString("status") == "returned") ClaimStatus.RETURNED else ClaimStatus.ACTIVE,
                checkedOutAt = document.getTimestamp("checkedOutAt").toInstant(),
                returnedAt = document.getTimestamp("returnedAt")?.toDate()?.toInstant(),
            )
        }
        val issues = issuesTask.await().documents.mapNotNull { document ->
            EquipmentIssue(
                id = document.id,
                claimId = document.getString("claimId") ?: return@mapNotNull null,
                equipmentId = document.getString("equipmentId").orEmpty(),
                text = document.getString("text").orEmpty(),
                status = when (document.getString("status")) {
                    "acknowledged" -> IssueStatus.ACKNOWLEDGED
                    "resolved" -> IssueStatus.RESOLVED
                    else -> IssueStatus.OPEN
                },
                reportedAt = document.getTimestamp("reportedAt").toInstant(),
            )
        }
        return RepositorySnapshot(equipment, claims, issues)
    }

    suspend fun resolveTags(tagIds: List<String>): List<ResolvedTag> {
        val user = requireNotNull(currentUser())
        return tagIds.map { tagId ->
            val tag = firestore.collection("tags").document(tagId).get().await()
            if (!tag.exists()) return@map ResolvedTag(tagId, "unknown", null, emptyList())
            val status = tag.getString("status") ?: "unknown"
            val equipmentId = tag.getString("equipmentId")
            val equipmentDocument = equipmentId?.let {
                firestore.collection("equipment").document(it).get().await()
            }
            val equipment = equipmentDocument?.takeIf { it.exists() }?.let {
                Equipment(
                    id = it.id,
                    name = it.getString("name").orEmpty(),
                    internalSerial = it.getString("internalSerial").orEmpty(),
                    tagId = it.getString("activeTagId").orEmpty(),
                    isActive = it.getString("status") == "active",
                )
            }
            val usableEquipment = equipment?.takeIf { status == "active" && it.isActive }
            val claimants = if (user.role == UserRole.TEACHER && equipmentId != null) {
                firestore.collection("claims")
                    .whereEqualTo("equipmentId", equipmentId)
                    .whereEqualTo("status", "active")
                    .get().await().documents.map {
                        ClaimantSummary(
                            studentId = it.getString("studentUid").orEmpty(),
                            studentEmail = it.getString("studentEmail").orEmpty(),
                            checkedOutAt = it.getTimestamp("checkedOutAt")?.toDate()?.toInstant(),
                        )
                    }
            } else {
                emptyList()
            }
            ResolvedTag(tagId, if (usableEquipment == null && status == "active") "inactive" else status, usableEquipment, claimants)
        }
    }

    suspend fun checkout(items: List<Pair<Equipment, String?>>, requestId: String): String {
        val user = requireNotNull(currentUser())
        check(user.role == UserRole.STUDENT) { "A student account is required for checkout." }
        require(items.isNotEmpty()) { "Scan at least one item." }
        require(items.size <= 20) { "A batch can contain at most 20 items." }
        val batch = firestore.batch()
        batch.set(
            firestore.collection("checkoutBatches").document(requestId),
            mapOf(
                "batchId" to requestId,
                "studentUid" to user.id,
                "studentEmail" to user.email,
                "itemCount" to items.size,
                "createdAt" to FieldValue.serverTimestamp(),
            ),
        )
        items.forEach { (equipment, rawIssueText) ->
            val issueText = rawIssueText?.trim()?.takeIf { it.isNotEmpty() }
            val claim = firestore.collection("claims").document()
            batch.set(
                claim,
                mapOf<String, Any?>(
                    "claimId" to claim.id,
                    "checkoutBatchId" to requestId,
                    "returnBatchId" to null,
                    "equipmentId" to equipment.id,
                    "tagIdAtCheckout" to equipment.tagId,
                    "studentUid" to user.id,
                    "studentEmail" to user.email,
                    "condition" to if (issueText == null) "no_issues" else "has_issue",
                    "issueText" to issueText,
                    "status" to "active",
                    "checkedOutAt" to FieldValue.serverTimestamp(),
                    "returnedAt" to null,
                    "returnedByTeacherUid" to null,
                    "overdueNotificationSentAt" to null,
                ),
            )
            if (issueText != null) {
                require(issueText.length <= 500) { "Issue details must contain at most 500 characters." }
                val issue = firestore.collection("issues").document()
                batch.set(
                    issue,
                    mapOf<String, Any?>(
                        "issueId" to issue.id,
                        "claimId" to claim.id,
                        "equipmentId" to equipment.id,
                        "reportedByStudentUid" to user.id,
                        "text" to issueText,
                        "status" to "open",
                        "reportedAt" to FieldValue.serverTimestamp(),
                        "resolvedAt" to null,
                        "resolvedByTeacherUid" to null,
                    ),
                )
            }
        }
        batch.commit().await()
        return requestId
    }

    suspend fun returnItems(items: List<Equipment>, requestId: String): Int {
        val user = requireNotNull(currentUser())
        check(user.role == UserRole.TEACHER) { "A teacher account is required for returns." }
        val claims = items.flatMap { equipment ->
            firestore.collection("claims")
                .whereEqualTo("equipmentId", equipment.id)
                .whereEqualTo("status", "active")
                .get().await().documents
        }.distinctBy { it.id }
        val batch = firestore.batch()
        batch.set(
            firestore.collection("returnBatches").document(requestId),
            mapOf(
                "batchId" to requestId,
                "teacherUid" to user.id,
                "claimCount" to claims.size,
                "createdAt" to FieldValue.serverTimestamp(),
            ),
        )
        claims.forEach {
            batch.update(
                it.reference,
                mapOf(
                    "status" to "returned",
                    "returnBatchId" to requestId,
                    "returnedAt" to FieldValue.serverTimestamp(),
                    "returnedByTeacherUid" to user.id,
                ),
            )
        }
        batch.commit().await()
        return claims.size
    }

    suspend fun enroll(name: String, serial: String, tagId: String, uid: String): String {
        val user = requireNotNull(currentUser())
        check(user.role == UserRole.TEACHER) { "A teacher account is required for enrollment." }
        val cleanName = name.trim()
        require(cleanName.length in 1..100) { "Equipment names must contain 1–100 characters." }
        val cleanSerial = normalizedSerial(serial)
        val equipment = firestore.collection("equipment").document()
        val batch = firestore.batch()
        batch.set(
            equipment,
            mapOf(
                "equipmentId" to equipment.id,
                "name" to cleanName,
                "internalSerial" to cleanSerial,
                "normalizedInternalSerial" to cleanSerial,
                "activeTagId" to tagId,
                "status" to "active",
                "enrolledBy" to user.id,
                "enrolledAt" to FieldValue.serverTimestamp(),
                "updatedBy" to user.id,
                "updatedAt" to FieldValue.serverTimestamp(),
            ),
        )
        batch.set(
            firestore.collection("tags").document(tagId),
            mapOf<String, Any?>(
                "tagId" to tagId,
                "equipmentId" to equipment.id,
                "hardwareUidHex" to uid.uppercase(),
                "chipFamily" to "NFC Forum Type 2",
                "status" to "active",
                "enrolledBy" to user.id,
                "enrolledAt" to FieldValue.serverTimestamp(),
                "replacedAt" to null,
                "replacedBy" to null,
            ),
        )
        batch.set(
            firestore.collection("equipmentSerials").document(cleanSerial),
            mapOf(
                "equipmentId" to equipment.id,
                "normalizedSerial" to cleanSerial,
                "createdAt" to FieldValue.serverTimestamp(),
            ),
        )
        batch.commit().await()
        return equipment.id
    }

    suspend fun updateIssue(issueId: String, status: IssueStatus) {
        val user = requireNotNull(currentUser())
        check(user.role == UserRole.TEACHER) { "A teacher account is required to update issues." }
        firestore.collection("issues").document(issueId).update(
            mapOf<String, Any?>(
                "status" to status.name.lowercase(),
                "resolvedAt" to if (status == IssueStatus.RESOLVED) FieldValue.serverTimestamp() else null,
                "resolvedByTeacherUid" to if (status == IssueStatus.RESOLVED) user.id else null,
            ),
        ).await()
    }

    private suspend fun upsertProfile(user: GearUser) {
        val profile = firestore.collection("users").document(user.id)
        if (profile.get().await().exists()) {
            profile.update(
                mapOf(
                    "displayName" to user.displayName,
                    "active" to true,
                    "updatedAt" to FieldValue.serverTimestamp(),
                    "lastLoginAt" to FieldValue.serverTimestamp(),
                ),
            ).await()
        } else {
            profile.set(
                mapOf(
                    "uid" to user.id,
                    "email" to user.email,
                    "displayName" to user.displayName,
                    "role" to user.role.name.lowercase(),
                    "emailDomain" to user.email.substringAfter("@"),
                    "active" to true,
                    "createdAt" to FieldValue.serverTimestamp(),
                    "updatedAt" to FieldValue.serverTimestamp(),
                    "lastLoginAt" to FieldValue.serverTimestamp(),
                ),
            ).await()
        }
    }

    private suspend fun registerDevice() {
        runCatching {
            val user = requireNotNull(currentUser())
            val installationId = FirebaseInstallations.getInstance().id.await()
            val token = FirebaseMessaging.getInstance().token.await()
            firestore.collection("users").document(user.id)
                .collection("devices").document(installationId).set(
                    mapOf(
                        "installationId" to installationId,
                        "fcmToken" to token,
                        "platform" to "android",
                        "notificationsEnabled" to true,
                        "updatedAt" to FieldValue.serverTimestamp(),
                    ),
                ).await()
        }
    }

    private fun normalizedSerial(serial: String): String {
        val value = serial.trim().uppercase()
        require(Regex("^[A-Z0-9_-]{1,50}$").matches(value)) {
            "Internal serials may contain only letters, numbers, underscores, and hyphens."
        }
        return value
    }

    private fun webClientId(): String = context.getString(R.string.default_web_client_id)

    private fun Timestamp?.toInstant(): Instant = this?.toDate()?.toInstant() ?: Instant.EPOCH
}
