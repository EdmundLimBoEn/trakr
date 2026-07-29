package systems.edmundlim.trakr

import android.app.Activity
import android.app.Application
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import systems.edmundlim.trakr.data.DemoRepository
import systems.edmundlim.trakr.data.FirebaseGateway
import systems.edmundlim.trakr.domain.Equipment
import systems.edmundlim.trakr.domain.GearUser
import systems.edmundlim.trakr.domain.IssueStatus
import systems.edmundlim.trakr.domain.RepositorySnapshot
import systems.edmundlim.trakr.domain.TagCodec
import systems.edmundlim.trakr.domain.UserRole
import java.util.UUID

data class TrakrUiState(
    val user: GearUser? = null,
    val snapshot: RepositorySnapshot = RepositorySnapshot(),
    val staged: List<Equipment> = emptyList(),
    val selectedReturns: Set<String> = emptySet(),
    val scannedHardwareUid: String = "",
    val pendingTagPayload: String? = null,
    val isCloudSession: Boolean = false,
    val isBusy: Boolean = false,
    val message: String? = null,
    val error: String? = null,
)

class TrakrViewModel(application: Application) : AndroidViewModel(application) {
    private val demo = DemoRepository()
    private val firebase = FirebaseGateway(application)
    private val mutableState = MutableStateFlow(TrakrUiState(user = firebase.currentUser(), isCloudSession = firebase.currentUser() != null))
    val state: StateFlow<TrakrUiState> = mutableState.asStateFlow()

    init {
        if (mutableState.value.user != null) refresh()
    }

    fun signInWithGoogle(activity: Activity) = launch {
        val user = firebase.signIn(activity)
        mutableState.value = mutableState.value.copy(user = user, isCloudSession = true)
        refreshInternal(user)
    }

    fun useDemo(role: UserRole) {
        val user = demo.demoUser(role)
        mutableState.value = TrakrUiState(user = user, snapshot = demo.snapshot(user), message = "Demo data is active.")
    }

    fun signOut() {
        firebase.signOut()
        mutableState.value = TrakrUiState()
    }

    fun refresh() = launch {
        mutableState.value.user?.let { refreshInternal(it) }
    }

    fun scan(payload: String?, hardwareUid: String) {
        val tagId = payload?.trim()
        if (tagId == null || !TagCodec.isValid(tagId)) {
            mutableState.value = mutableState.value.copy(
                scannedHardwareUid = hardwareUid,
                error = "This tag does not contain a valid Trakr payload.",
            )
            return
        }
        launch {
            val result = if (mutableState.value.isCloudSession) {
                firebase.resolveTags(listOf(tagId)).firstOrNull()
            } else {
                demo.resolve(tagId)
            }
            val item = result?.equipment ?: error("This tag is unknown or inactive.")
            if (item.id !in mutableState.value.staged.map { it.id }) {
                mutableState.value = mutableState.value.copy(
                    staged = mutableState.value.staged + item,
                    scannedHardwareUid = hardwareUid,
                    message = "${item.name} staged.",
                )
            }
        }
    }

    fun addDemoEquipment(item: Equipment) {
        if (item.id !in mutableState.value.staged.map { it.id }) {
            mutableState.value = mutableState.value.copy(staged = mutableState.value.staged + item)
        }
    }

    fun removeStaged(id: String) {
        mutableState.value = mutableState.value.copy(staged = mutableState.value.staged.filterNot { it.id == id })
    }

    fun checkout(issueText: String?) = launch {
        val user = requireNotNull(mutableState.value.user)
        val items = mutableState.value.staged
        check(user.role == UserRole.STUDENT) { "Only students can check out equipment." }
        check(items.isNotEmpty()) { "Scan at least one item." }
        if (!issueText.isNullOrBlank()) require(issueText.trim().length <= 500) { "Issue notes must be 500 characters or fewer." }
        if (mutableState.value.isCloudSession) {
            firebase.checkout(items.map { it to issueText }, UUID.randomUUID().toString())
        } else {
            demo.checkout(user, items.map { it to issueText }, UUID.randomUUID().toString())
        }
        mutableState.value = mutableState.value.copy(staged = emptyList(), message = "${items.size} item(s) checked out.")
        refreshInternal(user)
    }

    fun toggleReturn(equipmentId: String) {
        val selected = mutableState.value.selectedReturns.toMutableSet()
        if (!selected.add(equipmentId)) selected.remove(equipmentId)
        mutableState.value = mutableState.value.copy(selectedReturns = selected)
    }

    fun returnSelected() = launch {
        val user = requireNotNull(mutableState.value.user)
        val selected = mutableState.value.snapshot.equipment.filter { it.id in mutableState.value.selectedReturns }
        check(selected.isNotEmpty()) { "Select at least one item to return." }
        val count = if (mutableState.value.isCloudSession) {
            firebase.returnItems(selected, UUID.randomUUID().toString())
        } else {
            demo.returnItems(user, selected, UUID.randomUUID().toString())
        }
        mutableState.value = mutableState.value.copy(selectedReturns = emptySet(), message = "$count active claim(s) returned.")
        refreshInternal(user)
    }

    fun prepareEnrollmentTag(): String {
        val tag = TagCodec.generate()
        mutableState.value = mutableState.value.copy(pendingTagPayload = tag, message = "Tap a writable NFC tag.")
        return tag
    }

    fun tagWritten(payload: String, hardwareUid: String) {
        mutableState.value = mutableState.value.copy(
            pendingTagPayload = null,
            scannedHardwareUid = hardwareUid,
            message = "Tag written and verified: $payload",
        )
    }

    fun enroll(name: String, serial: String, tagId: String, hardwareUid: String) = launch {
        val user = requireNotNull(mutableState.value.user)
        check(user.role == UserRole.TEACHER) { "Only teachers can enroll equipment." }
        check(TagCodec.isValid(tagId)) { "Write a Trakr NFC tag first." }
        if (mutableState.value.isCloudSession) {
            firebase.enroll(name.trim(), serial.trim(), tagId, hardwareUid)
        } else {
            demo.enroll(name, serial, tagId, hardwareUid)
        }
        mutableState.value = mutableState.value.copy(message = "$name enrolled.")
        refreshInternal(user)
    }

    fun updateIssue(issueId: String, status: IssueStatus) = launch {
        val user = requireNotNull(mutableState.value.user)
        if (mutableState.value.isCloudSession) firebase.updateIssue(issueId, status) else demo.updateIssue(issueId, status)
        refreshInternal(user)
    }

    fun consumeFeedback() {
        mutableState.value = mutableState.value.copy(message = null, error = null)
    }

    fun reportError(message: String) {
        mutableState.value = mutableState.value.copy(error = message)
    }

    private suspend fun refreshInternal(user: GearUser) {
        val snapshot = if (mutableState.value.isCloudSession) firebase.snapshot(user) else demo.snapshot(user)
        mutableState.value = mutableState.value.copy(snapshot = snapshot)
    }

    private fun launch(block: suspend () -> Unit) {
        viewModelScope.launch {
            mutableState.value = mutableState.value.copy(isBusy = true, error = null)
            runCatching { block() }
                .onFailure { mutableState.value = mutableState.value.copy(error = it.message ?: "Something went wrong.") }
            mutableState.value = mutableState.value.copy(isBusy = false)
        }
    }
}
