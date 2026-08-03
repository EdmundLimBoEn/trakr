package systems.edmundlim.trakr

import android.app.Activity
import android.nfc.NfcAdapter
import android.nfc.Tag
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.viewModels
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.automirrored.filled.ExitToApp
import androidx.compose.material.icons.automirrored.filled.List
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material.icons.filled.Person
import androidx.compose.material.icons.filled.ShoppingCart
import androidx.compose.material.icons.filled.Warning
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.AssistChip
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.Checkbox
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.NavigationBar
import androidx.compose.material3.NavigationBarItem
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Scaffold
import androidx.compose.material3.SnackbarHost
import androidx.compose.material3.SnackbarHostState
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.darkColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.activity.compose.LocalActivity
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import systems.edmundlim.trakr.domain.ClaimStatus
import systems.edmundlim.trakr.domain.Equipment
import systems.edmundlim.trakr.domain.IssueStatus
import systems.edmundlim.trakr.domain.UserRole

class MainActivity : ComponentActivity(), NfcAdapter.ReaderCallback {
    private val viewModel: TrakrViewModel by viewModels()
    private val nfcAdapter by lazy { NfcAdapter.getDefaultAdapter(this) }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContent {
            TrakrTheme {
                TrakrRoot(viewModel)
            }
        }
    }

    override fun onResume() {
        super.onResume()
        nfcAdapter?.enableReaderMode(
            this,
            this,
            NfcAdapter.FLAG_READER_NFC_A or NfcAdapter.FLAG_READER_NFC_B or
                NfcAdapter.FLAG_READER_NFC_F or NfcAdapter.FLAG_READER_NFC_V or
                NfcAdapter.FLAG_READER_NO_PLATFORM_SOUNDS,
            null,
        )
    }

    override fun onPause() {
        nfcAdapter?.disableReaderMode(this)
        super.onPause()
    }

    override fun onTagDiscovered(tag: Tag) {
        val pending = viewModel.state.value.pendingTagPayload
        runCatching {
            if (pending != null) {
                NfcTagReader.write(tag, pending)
                val readBack = NfcTagReader.read(tag)
                check(readBack.payload == pending) { "The NFC write could not be verified." }
                runOnUiThread { viewModel.tagWritten(pending, readBack.hardwareUid) }
            } else {
                val scanned = NfcTagReader.read(tag)
                runOnUiThread { viewModel.scan(scanned.payload, scanned.hardwareUid) }
            }
        }.onFailure {
            runOnUiThread { viewModel.reportError(it.message ?: "NFC operation failed.") }
        }
    }
}

private val Bloom = Color(0xFFF294EA)
private val Ink = Color(0xFFF9F2F7)
private val Night = Color(0xFF100A0F)
private val Surface = Color(0xFF211820)
private val Blush = Color(0xFF342230)

@Composable
private fun TrakrTheme(content: @Composable () -> Unit) {
    MaterialTheme(
        colorScheme = darkColorScheme(
            primary = Bloom,
            onPrimary = Color(0xFF2A1025),
            secondary = Color(0xFFB36B18),
            onSecondary = Color.Black,
            primaryContainer = Color(0xFF5C2855),
            onPrimaryContainer = Ink,
            secondaryContainer = Blush,
            onSecondaryContainer = Ink,
            background = Night,
            onBackground = Ink,
            surface = Surface,
            onSurface = Ink,
            surfaceVariant = Blush,
            onSurfaceVariant = Color(0xFFDCC8D7),
            outline = Color(0xFF9C8197),
        ),
        content = content,
    )
}

@Composable
private fun TrakrRoot(viewModel: TrakrViewModel) {
    val state by viewModel.state.collectAsStateWithLifecycle()
    val snackbar = remember { SnackbarHostState() }
    LaunchedEffect(state.message, state.error) {
        (state.error ?: state.message)?.let {
            snackbar.showSnackbar(it)
            viewModel.consumeFeedback()
        }
    }
    Box(Modifier.fillMaxSize()) {
        if (state.user == null) {
            SignInScreen(viewModel)
        } else {
            Dashboard(viewModel, state)
        }
        SnackbarHost(snackbar, Modifier.align(Alignment.BottomCenter))
        if (state.isBusy) {
            Box(Modifier.fillMaxSize(), contentAlignment = Alignment.Center) {
                CircularProgressIndicator()
            }
        }
    }
}

@Composable
private fun SignInScreen(viewModel: TrakrViewModel) {
    val activity = LocalActivity.current ?: return
    Column(
        modifier = Modifier.fillMaxSize().padding(28.dp),
        verticalArrangement = Arrangement.Center,
    ) {
        Icon(Icons.Default.ShoppingCart, null, tint = Bloom, modifier = Modifier.height(72.dp))
        Spacer(Modifier.height(24.dp))
        Text("Trakr", style = MaterialTheme.typography.displayMedium, fontWeight = FontWeight.Bold)
        Text("Know where every piece of gear is.", style = MaterialTheme.typography.headlineSmall)
        Spacer(Modifier.height(12.dp))
        Text("Scan. Collect. Return. Equipment tracking for SST.")
        Spacer(Modifier.height(32.dp))
        Button(onClick = { viewModel.signInWithGoogle(activity) }, modifier = Modifier.fillMaxWidth()) {
            Text("Continue with Google")
        }
        Spacer(Modifier.height(20.dp))
        Text("Preview the complete MVP", style = MaterialTheme.typography.labelLarge)
        Row(horizontalArrangement = Arrangement.spacedBy(12.dp)) {
            OutlinedButton(onClick = { viewModel.useDemo(UserRole.STUDENT) }, modifier = Modifier.weight(1f)) {
                Text("Student")
            }
            OutlinedButton(onClick = { viewModel.useDemo(UserRole.TEACHER) }, modifier = Modifier.weight(1f)) {
                Text("Teacher")
            }
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun Dashboard(viewModel: TrakrViewModel, state: TrakrUiState) {
    var selectedTab by remember { mutableIntStateOf(0) }
    val teacher = state.user?.role == UserRole.TEACHER
    val tabs = if (teacher) {
        listOf("Overview" to Icons.AutoMirrored.Filled.List, "Returns" to Icons.AutoMirrored.Filled.ArrowBack, "Enroll" to Icons.Default.Add, "Issues" to Icons.Default.Warning)
    } else {
        listOf("Checkout" to Icons.Default.ShoppingCart, "Activity" to Icons.Default.CheckCircle)
    }
    Scaffold(
        topBar = {
            TopAppBar(
                title = {
                    Column {
                        Text("Trakr", fontWeight = FontWeight.Bold)
                        Text(state.user?.email.orEmpty(), style = MaterialTheme.typography.labelSmall)
                    }
                },
                actions = {
                    AssistChip(onClick = {}, label = { Text(if (state.isCloudSession) "Firebase" else "Demo") })
                    IconButton(onClick = viewModel::signOut) { Icon(Icons.AutoMirrored.Filled.ExitToApp, "Sign out") }
                },
            )
        },
        bottomBar = {
            NavigationBar {
                tabs.forEachIndexed { index, tab ->
                    NavigationBarItem(
                        selected = selectedTab == index,
                        onClick = { selectedTab = index },
                        icon = { Icon(tab.second, null) },
                        label = { Text(tab.first) },
                    )
                }
            }
        },
    ) { padding ->
        Box(Modifier.padding(padding)) {
            if (teacher) {
                when (selectedTab) {
                    0 -> EquipmentOverview(state)
                    1 -> ReturnsScreen(viewModel, state)
                    2 -> EnrollmentScreen(viewModel, state)
                    else -> IssuesScreen(viewModel, state)
                }
            } else {
                when (selectedTab) {
                    0 -> CheckoutScreen(viewModel, state)
                    else -> ActivityScreen(state)
                }
            }
        }
    }
}

@Composable
private fun CheckoutScreen(viewModel: TrakrViewModel, state: TrakrUiState) {
    var issueText by remember { mutableStateOf("") }
    AppList(title = "Checkout", subtitle = "Hold an NFC tag near the back of this phone.") {
        item {
            Card(colors = CardDefaults.cardColors(containerColor = Blush)) {
                Row(Modifier.fillMaxWidth().padding(18.dp), verticalAlignment = Alignment.CenterVertically) {
                    Icon(Icons.Default.ShoppingCart, null, tint = Bloom)
                    Column(Modifier.padding(start = 14.dp)) {
                        Text("Ready to scan", fontWeight = FontWeight.Bold)
                        Text("You can stage up to 20 items.")
                    }
                }
            }
        }
        if (!state.isCloudSession) {
            item { Text("Demo equipment", style = MaterialTheme.typography.titleMedium) }
            items(state.snapshot.equipment) { item ->
                OutlinedButton(onClick = { viewModel.addDemoEquipment(item) }, modifier = Modifier.fillMaxWidth()) {
                    Icon(Icons.Default.Add, null)
                    Text(" ${item.name}")
                }
            }
        }
        item { Text("Staged (${state.staged.size})", style = MaterialTheme.typography.titleMedium) }
        items(state.staged, key = { it.id }) { item ->
            EquipmentCard(item, trailing = {
                TextButton(onClick = { viewModel.removeStaged(item.id) }) { Text("Remove") }
            })
        }
        if (state.staged.isNotEmpty()) {
            item {
                OutlinedTextField(
                    value = issueText,
                    onValueChange = { if (it.length <= 500) issueText = it },
                    label = { Text("Optional issue applying to staged items") },
                    supportingText = { Text("${issueText.length}/500") },
                    modifier = Modifier.fillMaxWidth(),
                    minLines = 2,
                )
            }
            item {
                Button(onClick = { viewModel.checkout(issueText.ifBlank { null }) }, modifier = Modifier.fillMaxWidth()) {
                    Text("Confirm checkout")
                }
            }
        }
    }
}

@Composable
private fun ActivityScreen(state: TrakrUiState) {
    AppList(title = "My activity", subtitle = "Your checkout and return history.") {
        if (state.snapshot.claims.isEmpty()) item { EmptyMessage("No activity yet.") }
        items(state.snapshot.claims, key = { it.id }) { claim ->
            val equipment = state.snapshot.equipment.firstOrNull { it.id == claim.equipmentId }
            Card {
                Column(Modifier.fillMaxWidth().padding(16.dp)) {
                    Text(equipment?.name ?: claim.equipmentId, fontWeight = FontWeight.Bold)
                    Text(if (claim.status == ClaimStatus.ACTIVE) "Checked out" else "Returned")
                    Text(claim.checkedOutAt.toString(), style = MaterialTheme.typography.bodySmall)
                }
            }
        }
    }
}

@Composable
private fun EquipmentOverview(state: TrakrUiState) {
    AppList(title = "Equipment", subtitle = "${state.snapshot.equipment.count { it.isActive }} active items") {
        if (state.snapshot.equipment.isEmpty()) item { EmptyMessage("No equipment enrolled yet.") }
        items(state.snapshot.equipment, key = { it.id }) { EquipmentCard(it) }
    }
}

@Composable
private fun ReturnsScreen(viewModel: TrakrViewModel, state: TrakrUiState) {
    val activeEquipmentIds = state.snapshot.claims.filter { it.status == ClaimStatus.ACTIVE }.mapTo(mutableSetOf()) { it.equipmentId }
    val candidates = state.snapshot.equipment.filter { it.id in activeEquipmentIds }
    AppList(title = "Returns", subtitle = "Select scanned equipment and resolve every active claim.") {
        if (candidates.isEmpty()) item { EmptyMessage("Nothing is currently checked out.") }
        items(candidates, key = { it.id }) { item ->
            Card(onClick = { viewModel.toggleReturn(item.id) }) {
                Row(Modifier.fillMaxWidth().padding(12.dp), verticalAlignment = Alignment.CenterVertically) {
                    Checkbox(checked = item.id in state.selectedReturns, onCheckedChange = { viewModel.toggleReturn(item.id) })
                    Column {
                        Text(item.name, fontWeight = FontWeight.Bold)
                        Text("${state.snapshot.claims.count { it.equipmentId == item.id && it.status == ClaimStatus.ACTIVE }} active claim(s)")
                    }
                }
            }
        }
        if (state.selectedReturns.isNotEmpty()) {
            item {
                Button(onClick = viewModel::returnSelected, modifier = Modifier.fillMaxWidth()) {
                    Text("Confirm return (${state.selectedReturns.size})")
                }
            }
        }
    }
}

@Composable
private fun EnrollmentScreen(viewModel: TrakrViewModel, state: TrakrUiState) {
    var name by remember { mutableStateOf("") }
    var serial by remember { mutableStateOf("") }
    var tagId by remember { mutableStateOf("") }
    LaunchedEffect(state.pendingTagPayload, state.message) {
        state.pendingTagPayload?.let { tagId = it }
    }
    AppList(title = "Enroll equipment", subtitle = "Generate, write, verify, then register one NFC tag.") {
        item {
            OutlinedTextField(name, { name = it.take(100) }, label = { Text("Equipment name") }, modifier = Modifier.fillMaxWidth())
        }
        item {
            OutlinedTextField(serial, { serial = it.take(50) }, label = { Text("Internal serial") }, modifier = Modifier.fillMaxWidth())
        }
        item {
            OutlinedTextField(tagId, {}, readOnly = true, label = { Text("Trakr tag payload") }, modifier = Modifier.fillMaxWidth())
        }
        item {
            OutlinedButton(
                onClick = { tagId = viewModel.prepareEnrollmentTag() },
                modifier = Modifier.fillMaxWidth(),
            ) {
                Icon(Icons.Default.ShoppingCart, null)
                Text(if (state.pendingTagPayload == null) " Generate and write NFC tag" else " Tap tag now")
            }
        }
        item {
            Button(
                onClick = { viewModel.enroll(name, serial, tagId, state.scannedHardwareUid) },
                enabled = name.isNotBlank() && serial.isNotBlank() && state.scannedHardwareUid.isNotBlank() && state.pendingTagPayload == null,
                modifier = Modifier.fillMaxWidth(),
            ) {
                Text("Enroll equipment")
            }
        }
    }
}

@Composable
private fun IssuesScreen(viewModel: TrakrViewModel, state: TrakrUiState) {
    var selectedIssue by remember { mutableStateOf<String?>(null) }
    AppList(title = "Issues", subtitle = "Acknowledge and resolve student reports.") {
        if (state.snapshot.issues.isEmpty()) item { EmptyMessage("No equipment issues.") }
        items(state.snapshot.issues, key = { it.id }) { issue ->
            Card(onClick = { selectedIssue = issue.id }) {
                Column(Modifier.fillMaxWidth().padding(16.dp)) {
                    Text(issue.text, maxLines = 3, overflow = TextOverflow.Ellipsis)
                    Text(issue.status.name.lowercase().replaceFirstChar(Char::uppercase), color = Bloom, fontWeight = FontWeight.Bold)
                }
            }
        }
    }
    selectedIssue?.let { id ->
        val issue = state.snapshot.issues.first { it.id == id }
        AlertDialog(
            onDismissRequest = { selectedIssue = null },
            title = { Text("Update issue") },
            text = { Text(issue.text) },
            confirmButton = {
                TextButton(onClick = {
                    viewModel.updateIssue(id, IssueStatus.RESOLVED)
                    selectedIssue = null
                }) { Text("Resolve") }
            },
            dismissButton = {
                TextButton(onClick = {
                    viewModel.updateIssue(id, IssueStatus.ACKNOWLEDGED)
                    selectedIssue = null
                }) { Text("Acknowledge") }
            },
        )
    }
}

@Composable
private fun EquipmentCard(item: Equipment, trailing: @Composable (() -> Unit)? = null) {
    Card {
        Row(
            Modifier.fillMaxWidth().padding(16.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.SpaceBetween,
        ) {
            Row(Modifier.weight(1f), verticalAlignment = Alignment.CenterVertically) {
                Icon(Icons.AutoMirrored.Filled.List, null, tint = Bloom)
                Column(Modifier.padding(start = 12.dp)) {
                    Text(item.name, fontWeight = FontWeight.Bold)
                    Text(item.internalSerial, style = MaterialTheme.typography.bodySmall)
                }
            }
            trailing?.invoke()
        }
    }
}

@Composable
private fun EmptyMessage(text: String) {
    Card {
        Row(Modifier.fillMaxWidth().padding(20.dp), verticalAlignment = Alignment.CenterVertically) {
            Icon(Icons.Default.Person, null)
            Text(text, Modifier.padding(start = 12.dp))
        }
    }
}

@Composable
private fun AppList(
    title: String,
    subtitle: String,
    content: androidx.compose.foundation.lazy.LazyListScope.() -> Unit,
) {
    LazyColumn(
        modifier = Modifier.fillMaxSize(),
        contentPadding = PaddingValues(18.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp),
    ) {
        item {
            Text(title, style = MaterialTheme.typography.headlineMedium, fontWeight = FontWeight.Bold)
            Text(subtitle, color = Color.Gray)
        }
        content()
    }
}
