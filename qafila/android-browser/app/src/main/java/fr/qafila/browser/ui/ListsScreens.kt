package fr.qafila.browser.ui

import androidx.activity.compose.BackHandler
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import fr.qafila.browser.data.BrowserStore
import java.text.DateFormat
import java.util.Date

@Composable
private fun SearchField(value: String, placeholder: String, onChange: (String) -> Unit) {
    val q = LocalQ.current
    Row(Modifier.padding(horizontal = 16.dp, vertical = 6.dp).fillMaxWidth().height(38.dp).clip(RoundedCornerShape(10.dp)).background(q.fill).padding(horizontal = 10.dp), verticalAlignment = Alignment.CenterVertically) {
        QIconView(QIcon.SEARCH, null, q.secondary, 16.dp)
        Spacer(Modifier.width(8.dp))
        BasicTextField(value, onChange, Modifier.weight(1f), singleLine = true, textStyle = TextStyle(color = q.text, fontSize = 15.sp), cursorBrush = SolidColor(q.text),
            decorationBox = { inner -> Box(contentAlignment = Alignment.CenterStart) { if (value.isEmpty()) Text(placeholder, color = q.secondary, fontSize = 15.sp); inner() } })
    }
}

@Composable
private fun SiteRow(store: BrowserStore, title: String, url: String, trailing: String?, onOpen: () -> Unit, onDelete: () -> Unit) {
    val q = LocalQ.current
    val icons by store.tabManager.favicons.icons.collectAsState()
    Row(Modifier.fillMaxWidth().rowClick(onClick = onOpen).padding(start = 14.dp, end = 4.dp, top = 9.dp, bottom = 9.dp), verticalAlignment = Alignment.CenterVertically) {
        Favicon(icons[store.tabManager.favicons.keyOf(url)], store.hostOf(url), 26.dp, corner = 6.dp)
        Spacer(Modifier.width(12.dp))
        Column(Modifier.weight(1f)) {
            Text(title.ifBlank { url }, color = q.text, fontSize = 14.sp, fontWeight = FontWeight.Medium, maxLines = 2, overflow = TextOverflow.Ellipsis, lineHeight = 18.sp)
            Text((store.hostOf(url) ?: url).uppercase(), color = q.secondary, fontSize = 10.sp, letterSpacing = 0.5.sp, maxLines = 1)
        }
        if (trailing != null) Text(trailing, color = q.secondary, fontSize = 12.sp)
        Box(Modifier.size(40.dp).pressFade(onClick = onDelete), contentAlignment = Alignment.Center) { QIconView(QIcon.CLOSE, "Supprimer", q.secondary, 14.dp) }
    }
}

@Composable
fun BookmarksScreen(store: BrowserStore, onDismiss: () -> Unit) {
    val state by store.state.collectAsState()
    val q = LocalQ.current
    var query by remember { mutableStateOf("") }
    val tab = state.tabs.firstOrNull { it.id == state.selectedTabId }
    val items = state.bookmarks.filter { query.isBlank() || it.title.contains(query, true) || it.url.contains(query, true) }
    fun open(url: String) { onDismiss(); store.navigate(url) }
    BackHandler(onBack = onDismiss)
    QPage("Favoris", onDismiss, backLabel = "OK", header = { SearchField(query, "Rechercher dans les favoris") { query = it } }) {
        if (tab?.url != null && !store.isBookmarked(tab)) item {
            Spacer(Modifier.height(10.dp))
            GroupCard { ActionRow("Ajouter « ${tab.displayTitle} »", icon = QIcon.STAR) { store.toggleBookmark(tab) } }
        }
        item {
            Spacer(Modifier.height(16.dp))
            GroupCard {
                if (items.isEmpty()) Text("Aucun favori pour l'instant.", Modifier.padding(16.dp), color = q.secondary, fontSize = 14.sp)
                items.forEachIndexed { i, b ->
                    SiteRow(store, b.title, b.url, null, { open(b.url) }) { store.removeBookmark(b.id) }
                    if (i < items.lastIndex) RowDivider(52.dp)
                }
            }
        }
    }
}

@Composable
fun HistoryScreen(store: BrowserStore, onDismiss: () -> Unit) {
    val state by store.state.collectAsState()
    val q = LocalQ.current
    var query by remember { mutableStateOf("") }
    var confirm by remember { mutableStateOf(false) }
    val items = state.history.filter { query.isBlank() || it.title.contains(query, true) || it.url.contains(query, true) }.take(500)
    val dayFmt = remember { DateFormat.getDateInstance(DateFormat.FULL) }
    val timeFmt = remember { DateFormat.getTimeInstance(DateFormat.SHORT) }
    val sections = items.groupBy { dayFmt.format(Date(it.visitedAt)) }
    fun open(url: String) { onDismiss(); store.navigate(url) }
    BackHandler(onBack = onDismiss)
    QPage("Historique", onDismiss, backLabel = "OK",
        trailing = { TextAction(if (confirm) "Confirmer" else "Effacer", q.destructive, bold = confirm, enabled = state.history.isNotEmpty()) { if (confirm) { store.clearHistory(); confirm = false } else confirm = true } },
        header = { SearchField(query, "Rechercher dans l'historique") { query = it } }) {
        if (items.isEmpty()) item { SectionFooter("Aucun historique. Les onglets privés n'y sont jamais enregistrés.") }
        sections.forEach { (day, entries) ->
            item(day) {
                SectionHeader(day)
                GroupCard {
                    entries.forEachIndexed { i, e ->
                        SiteRow(store, e.title, e.url, timeFmt.format(Date(e.visitedAt)), { open(e.url) }) { store.removeHistory(e.id) }
                        if (i < entries.lastIndex) RowDivider(52.dp)
                    }
                }
            }
        }
    }
}
