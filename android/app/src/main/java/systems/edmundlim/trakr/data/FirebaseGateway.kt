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
import com.google.firebase.firestore.Query
import com.google.firebase.firestore.firestore
import com.google.firebase.functions.FirebaseFunctions
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
    private val functions by lazy { FirebaseFunctions.getInstance("asia-southeast1") }

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
        val authResult = auth.signInWithCredential(firebaseCredential).await()
        val firebaseUser = requireNotNull(authResult.user)

        functions.getHttpsCallable("initializeUser").call(emptyMap<String, Any>()).await()
        val token = firebaseUser.getIdToken(true).await()
        val email = requireNotNull(firebaseUser.email).lowercase()
        val role = when (token.claims["role"]) {
            "teacher" -> UserRole.TEACHER
            "student" -> UserRole.STUDENT
            else -> RoleDeriver.derive(email)
        }
        registerDevice()
        return GearUser(firebaseUser.uid, email, firebaseUser.displayName.orEmpty().ifBlank { email.substringBefore("@") }, role)
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
        val equipment = if (user.role == UserRole.TEACHER) {
            firestore.collection("equipment").get().await().documents.mapNotNull { document ->
                Equipment(
                    id = document.id,
                    name = document.getString("name") ?: return@mapNotNull null,
                    internalSerial = document.getString("internalSerial").orEmpty(),
                    tagId = document.getString("activeTagId").orEmpty(),
                    isActive = document.getString("status") == "active",
                )
            }
        } else {
            emptyList()
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
        val response = functions.getHttpsCallable("resolveTags").call(mapOf("tagIds" to tagIds)).await()
        val data = response.data as? Map<*, *> ?: error("Invalid resolveTags response.")
        val results = data["results"] as? List<*> ?: emptyList<Any>()
        return results.mapNotNull { raw ->
            val item = raw as? Map<*, *> ?: return@mapNotNull null
            val tagId = item["tagId"] as? String ?: return@mapNotNull null
            val equipmentData = item["equipment"] as? Map<*, *>
            val equipment = equipmentData?.let {
                Equipment(
                    id = it["equipmentId"] as? String ?: return@let null,
                    name = it["name"] as? String ?: "",
                    internalSerial = it["internalSerial"] as? String ?: "",
                    tagId = tagId,
                )
            }
            val claimants = (item["activeClaimants"] as? List<*>).orEmpty().mapNotNull { claimantRaw ->
                val claimant = claimantRaw as? Map<*, *> ?: return@mapNotNull null
                ClaimantSummary(
                    studentId = claimant["studentUid"] as? String ?: "",
                    studentEmail = claimant["studentEmail"] as? String ?: "",
                    checkedOutAt = timestampValue(claimant["checkedOutAt"]),
                )
            }
            ResolvedTag(tagId, item["status"] as? String ?: "unknown", equipment, claimants)
        }
    }

    suspend fun checkout(items: List<Pair<Equipment, String?>>, requestId: String): String {
        val payload = items.map { (equipment, issueText) ->
            buildMap<String, Any> {
                put("tagId", equipment.tagId)
                put("condition", if (issueText.isNullOrBlank()) "no_issues" else "has_issue")
                if (!issueText.isNullOrBlank()) put("issueText", issueText.trim())
            }
        }
        val result = functions.getHttpsCallable("confirmCheckout")
            .call(mapOf("clientRequestId" to requestId, "items" to payload)).await().data as Map<*, *>
        return result["checkoutBatchId"] as? String ?: error("Checkout response was incomplete.")
    }

    suspend fun returnItems(items: List<Equipment>, requestId: String): Int {
        val result = functions.getHttpsCallable("confirmReturn")
            .call(mapOf("clientRequestId" to requestId, "tagIds" to items.map { it.tagId })).await().data as Map<*, *>
        return (result["claimIds"] as? List<*>)?.size ?: 0
    }

    suspend fun enroll(name: String, serial: String, tagId: String, uid: String): String {
        val result = functions.getHttpsCallable("enrollEquipment").call(
            mapOf(
                "name" to name,
                "internalSerial" to serial,
                "tagId" to tagId,
                "hardwareUidHex" to uid,
                "chipFamily" to "NFC Forum Type 2",
            ),
        ).await().data as Map<*, *>
        return result["equipmentId"] as? String ?: error("Enrollment response was incomplete.")
    }

    suspend fun updateIssue(issueId: String, status: IssueStatus) {
        functions.getHttpsCallable("updateIssue").call(
            mapOf("issueId" to issueId, "status" to status.name.lowercase()),
        ).await()
    }

    private suspend fun registerDevice() {
        runCatching {
            val installationId = FirebaseInstallations.getInstance().id.await()
            val token = FirebaseMessaging.getInstance().token.await()
            functions.getHttpsCallable("registerDevice").call(
                mapOf(
                    "installationId" to installationId,
                    "fcmToken" to token,
                    "platform" to "android",
                    "notificationsEnabled" to true,
                ),
            ).await()
        }
    }

    private fun webClientId(): String {
        return context.getString(R.string.default_web_client_id)
    }

    private fun Timestamp?.toInstant(): Instant = this?.toDate()?.toInstant() ?: Instant.EPOCH

    private fun timestampValue(value: Any?): Instant? = when (value) {
        is Timestamp -> value.toDate().toInstant()
        is Map<*, *> -> {
            val seconds = (value["_seconds"] as? Number)?.toLong() ?: (value["seconds"] as? Number)?.toLong()
            seconds?.let(Instant::ofEpochSecond)
        }
        else -> null
    }
}
