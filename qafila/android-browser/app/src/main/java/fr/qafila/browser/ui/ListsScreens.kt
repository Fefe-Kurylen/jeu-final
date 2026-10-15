package fr.qafila.browser.ui

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.Delete
import androidx.compose.material.icons.filled.Star
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties
import fr.qafila.browser.data.BrowserStore
import java.text.DateFormat
import java.util.Date

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun BookmarksScreen(store: BrowserStore, onDismiss: () -> Unit) {
    val state by store.state.collectAsState()
    var query by remember { mutableStateOf("") }
    val tab = state.tabs.firstOrNull { it.id == state.selectedTabId }
    val items = state.bookmarks.filter { query.isBlank() || it.title.contains(query, true) || it.url.contains(query, true) }
    fun open(url: String) { tab?.let { store.tabManager.load(url, it.id) }; onDismiss() }
    Dialog(onDismissRequest = onDismiss, properties = DialogProperties(usePlatformDefaultWidth = false, decorFitsSystemWindows = false)) {
        Scaffold(topBar = { TopAppBar(title = { Text("Favoris") }, navigationIcon = { IconButton(onDismiss) { Icon(Icons.Filled.Close, "Fermer") } }) }) { pad ->
            Column(Modifier.padding(pad)) {
                OutlinedTextField(query, { query = it }, Modifier.fillMaxWidth().padding(16.dp, 8.dp), placeholder = { Text("Rechercher dans les favoris") }, singleLine = true)
                if (tab?.url != null && !store.isBookmarked(tab)) TextButton(onClick = { store.toggleBookmark(tab) }, Modifier.padding(horizontal = 12.dp)) { Icon(Icons.Filled.Star, null); Spacer(Modifier.width(8.dp)); Text("Ajouter « ${tab.displayTitle} »", maxLines = 1, overflow = TextOverflow.Ellipsis) }
                LazyColumn(contentPadding = PaddingValues(bottom = 24.dp)) {
                    if (items.isEmpty()) item { Text("Aucun favori pour l'instant.", Modifier.padding(16.dp), color = MaterialTheme.colorScheme.onSurfaceVariant) }
                    items.forEach { b -> item(b.id) {
                        Row(Modifier.fillMaxWidth().clickable { open(b.url) }.padding(horizontal = 16.dp, vertical = 10.dp), verticalAlignment = Alignment.CenterVertically) {
                            Column(Modifier.weight(1f)) { Text(b.title, fontSize = 15.sp, fontWeight = FontWeight.Medium, maxLines = 2, overflow = TextOverflow.Ellipsis); Text(store.hostOf(b.url) ?: b.url, fontSize = 12.sp, color = MaterialTheme.colorScheme.onSurfaceVariant) }
                            IconButton(onClick = { store.removeBookmark(b.id) }) { Icon(Icons.Filled.Delete, "Supprimer") }
                        }
                    } }
                }
            }
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun HistoryScreen(store: BrowserStore, onDismiss: () -> Unit) {
    val state by store.state.collectAsState()
    var query by remember { mutableStateOf("") }
    val tab = state.tabs.firstOrNull { it.id == state.selectedTabId }
    val items = state.history.filter { query.isBlank() || it.title.contains(query, true) || it.url.contains(query, true) }
    val dayFmt = remember { DateFormat.getDateInstance(DateFormat.FULL) }
    val timeFmt = remember { DateFormat.getTimeInstance(DateFormat.SHORT) }
    val sections = items.groupBy { dayFmt.format(Date(it.visitedAt)) }
    fun open(url: String) { tab?.let { store.tabManager.load(url, it.id) }; onDismiss() }
    Dialog(onDismissRequest = onDismiss, properties = DialogProperties(usePlatformDefaultWidth = false, decorFitsSystemWindows = false)) {
        Scaffold(topBar = { TopAppBar(title = { Text("Historique") }, navigationIcon = { IconButton(onDismiss) { Icon(Icons.Filled.Close, "Fermer") } }, actions = { TextButton(onClick = { store.clearHistory() }, enabled = state.history.isNotEmpty()) { Text("Effacer", color = MaterialTheme.colorScheme.error) } }) }) { pad ->
            Column(Modifier.padding(pad)) {
                OutlinedTextField(query, { query = it }, Modifier.fillMaxWidth().padding(16.dp, 8.dp), placeholder = { Text("Rechercher dans l'historique") }, singleLine = true)
                LazyColumn(contentPadding = PaddingValues(bottom = 24.dp)) {
                    if (items.isEmpty()) item { Text("Aucun historique. Les onglets privés n'y sont jamais enregistrés.", Modifier.padding(16.dp), color = MaterialTheme.colorScheme.onSurfaceVariant) }
                    sections.forEach { (day, entries) ->
                        item(day) { Text(day, Modifier.padding(16.dp, 12.dp, 16.dp, 4.dp), fontSize = 12.sp, fontWeight = FontWeight.SemiBold, color = MaterialTheme.colorScheme.onSurfaceVariant) }
                        entries.forEach { e -> item(e.id) {
                            Row(Modifier.fillMaxWidth().clickable { open(e.url) }.padding(horizontal = 16.dp, vertical = 8.dp), verticalAlignment = Alignment.CenterVertically) {
                                Column(Modifier.weight(1f)) { Text(e.title, fontSize = 15.sp, fontWeight = FontWeight.Medium, maxLines = 2, overflow = TextOverflow.Ellipsis); Text(store.hostOf(e.url) ?: "", fontSize = 12.sp, color = MaterialTheme.colorScheme.onSurfaceVariant) }
                                Text(timeFmt.format(Date(e.visitedAt)), fontSize = 12.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
                                IconButton(onClick = { store.removeHistory(e.id) }) { Icon(Icons.Filled.Delete, "Supprimer") }
                            }
                        } }
                    }
                }
            }
        }
    }
}
