package fr.qafila.browser.ui

import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.grid.GridCells
import androidx.compose.foundation.lazy.grid.LazyVerticalGrid
import androidx.compose.foundation.lazy.grid.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties
import fr.qafila.browser.data.BrowserStore
import fr.qafila.browser.data.BrowserTab
import fr.qafila.browser.data.TabsLayout
import fr.qafila.browser.data.TabsSort

/** Onglets : liste groupée par site ou grille de vignettes ; tri ; onglets privés séparés. */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun TabsScreen(store: BrowserStore, onDismiss: () -> Unit) {
    val state by store.state.collectAsState()
    val favicons by store.tabManager.favicons.collectAsState()
    var showPrivate by remember { mutableStateOf(false) }
    var menu by remember { mutableStateOf(false) }
    val s = state.settings
    val visible = state.tabs.filter { it.isPrivate == showPrivate }.let { t ->
        when (s.tabsSort) { TabsSort.DATE -> t.sortedByDescending { it.lastVisited }; TabsSort.READING_TIME -> t.sortedByDescending { it.readingMinutes }; TabsSort.TITLE -> t.sortedBy { it.displayTitle.lowercase() } }
    }
    val groups: List<Pair<String, List<BrowserTab>>> = if (!s.groupTabsByDomain) listOf("" to visible) else {
        val byHost = visible.groupBy { if (it.url == null) "Nouveaux onglets" else it.host }
        val multi = byHost.filter { it.value.size > 1 }.map { it.key to it.value }
        val singles = byHost.filter { it.value.size == 1 }.flatMap { it.value }
        multi + (if (singles.isEmpty()) emptyList() else listOf("Autres" to singles))
    }
    val snapshots = remember(state.tabs.size, showPrivate) { visible.associate { it.id to store.tabManager.snapshot(it.id) } }

    Dialog(onDismissRequest = onDismiss, properties = DialogProperties(usePlatformDefaultWidth = false, decorFitsSystemWindows = false)) {
        Scaffold(
            topBar = {
                TopAppBar(
                    title = { SingleChoiceSegmentedButtonRow { SegmentedButton(!showPrivate, { showPrivate = false }, SegmentedButtonDefaults.itemShape(0, 2)) { Text("Onglets") }; SegmentedButton(showPrivate, { showPrivate = true }, SegmentedButtonDefaults.itemShape(1, 2)) { Text("Privés") } } },
                    actions = {
                        IconButton(onClick = { menu = true }) { Icon(Icons.Filled.MoreVert, "Options") }
                        DropdownMenu(menu, { menu = false }) {
                            TabsLayout.entries.forEach { l -> DropdownMenuItem({ Text((if (s.tabsLayout == l) "✓ " else "") + l.label) }, { store.updateSettings { it.copy(tabsLayout = l) }; menu = false }) }
                            HorizontalDivider()
                            TabsSort.entries.forEach { o -> DropdownMenuItem({ Text((if (s.tabsSort == o) "✓ " else "") + "Trier par ${o.label.lowercase()}") }, { store.updateSettings { it.copy(tabsSort = o) }; menu = false }) }
                            HorizontalDivider()
                            DropdownMenuItem({ Text((if (s.groupTabsByDomain) "✓ " else "") + "Grouper par site") }, { store.updateSettings { it.copy(groupTabsByDomain = !it.groupTabsByDomain) }; menu = false })
                            DropdownMenuItem({ Text("Fermer tous les onglets", color = MaterialTheme.colorScheme.error) }, { store.closeAllTabs(); menu = false; onDismiss() })
                        }
                    },
                )
            },
            bottomBar = {
                BottomAppBar {
                    IconButton(onClick = { store.newTab(isPrivate = showPrivate); onDismiss() }) { Icon(Icons.Filled.Add, "Nouvel onglet") }
                    Spacer(Modifier.weight(1f)); Text("${visible.size} onglet${if (visible.size > 1) "s" else ""}", fontWeight = FontWeight.SemiBold); Spacer(Modifier.weight(1f))
                    TextButton(onClick = onDismiss) { Text("OK", fontWeight = FontWeight.SemiBold) }
                }
            },
        ) { pad ->
            if (s.tabsLayout == TabsLayout.LIST) {
                LazyColumn(Modifier.padding(pad).fillMaxSize(), contentPadding = PaddingValues(16.dp)) {
                    groups.forEach { (host, tabs) ->
                        if (host.isNotEmpty()) item { Text(host, fontSize = 12.sp, fontWeight = FontWeight.SemiBold, color = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.padding(start = 8.dp, top = 8.dp, bottom = 6.dp)) }
                        item {
                            Column(Modifier.fillMaxWidth().clip(RoundedCornerShape(14.dp)).background(MaterialTheme.colorScheme.surfaceVariant)) {
                                tabs.forEachIndexed { i, tab ->
                                    Row(Modifier.fillMaxWidth().clickable { store.select(tab.id); onDismiss() }.padding(12.dp), verticalAlignment = Alignment.CenterVertically) {
                                        val fav = favicons[tab.id]
                                        Box(Modifier.size(28.dp).clip(RoundedCornerShape(7.dp)).background(MaterialTheme.colorScheme.outlineVariant), contentAlignment = Alignment.Center) {
                                            if (fav != null) Image(fav.asImageBitmap(), null, Modifier.size(20.dp)) else Icon(if (tab.isPrivate) Icons.Filled.VisibilityOff else Icons.Filled.Language, null, Modifier.size(16.dp))
                                        }
                                        Spacer(Modifier.width(12.dp))
                                        Column(Modifier.weight(1f)) {
                                            Text(tab.displayTitle, fontSize = 15.sp, fontWeight = FontWeight.Medium, maxLines = 2, overflow = TextOverflow.Ellipsis)
                                            Text((tab.url?.removePrefix("https://") ?: "") + (if (s.showReadingTime && tab.readingLabel != null) " · ${tab.readingLabel}" else ""), fontSize = 12.sp, color = MaterialTheme.colorScheme.onSurfaceVariant, maxLines = 1, overflow = TextOverflow.Ellipsis)
                                        }
                                        if (tab.id == state.selectedTabId) Icon(Icons.Filled.Check, null, Modifier.size(16.dp), tint = MaterialTheme.colorScheme.primary)
                                        IconButton(onClick = { store.close(tab.id) }, Modifier.size(32.dp)) { Icon(Icons.Filled.Close, "Fermer", Modifier.size(16.dp)) }
                                    }
                                    if (i < tabs.lastIndex) HorizontalDivider(Modifier.padding(start = 52.dp), color = MaterialTheme.colorScheme.outlineVariant)
                                }
                            }
                            Spacer(Modifier.height(8.dp))
                        }
                    }
                }
            } else {
                LazyVerticalGrid(GridCells.Fixed(2), Modifier.padding(pad).fillMaxSize(), contentPadding = PaddingValues(16.dp), horizontalArrangement = Arrangement.spacedBy(12.dp), verticalArrangement = Arrangement.spacedBy(12.dp)) {
                    items(visible, key = { it.id }) { tab ->
                        Column(Modifier.clickable { store.select(tab.id); onDismiss() }) {
                            Box(Modifier.fillMaxWidth().height(200.dp).clip(RoundedCornerShape(14.dp)).background(MaterialTheme.colorScheme.surfaceVariant)
                                .border(if (tab.id == state.selectedTabId) 2.dp else 0.5.dp, if (tab.id == state.selectedTabId) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.outlineVariant, RoundedCornerShape(14.dp))) {
                                snapshots[tab.id]?.let { Image(it.asImageBitmap(), null, Modifier.fillMaxSize(), contentScale = ContentScale.Crop, alignment = Alignment.TopCenter) }
                                IconButton(onClick = { store.close(tab.id) }, Modifier.align(Alignment.TopEnd).padding(4.dp).size(28.dp)) { Icon(Icons.Filled.Close, "Fermer", Modifier.size(14.dp)) }
                            }
                            Spacer(Modifier.height(6.dp))
                            Text(tab.displayTitle, fontSize = 13.sp, fontWeight = FontWeight.Medium, maxLines = 1, overflow = TextOverflow.Ellipsis)
                            if (s.showReadingTime && tab.readingLabel != null) Text(tab.readingLabel!!, fontSize = 11.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
                        }
                    }
                }
            }
        }
    }
}
