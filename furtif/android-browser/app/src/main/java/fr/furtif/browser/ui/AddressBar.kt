package fr.furtif.browser.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import fr.furtif.browser.data.BrowserStore
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.delay
import kotlinx.coroutines.withContext
import org.json.JSONArray
import java.net.URL
import java.net.URLEncoder

/** Barre d'adresse : icône du site, domaine ou titre, temps de lecture, cadenas ; mode saisie avec suggestions. */
@Composable
fun AddressBar(store: BrowserStore) {
    val state by store.state.collectAsState()
    val settings = state.settings
    val tab = state.tabs.firstOrNull { it.id == state.selectedTabId }
    val editing by store.isEditingAddress.collectAsState()
    val nav by store.tabManager.navState.collectAsState()
    val favicons by store.tabManager.favicons.collectAsState()
    var text by remember { mutableStateOf("") }
    var suggestions by remember { mutableStateOf<List<String>>(emptyList()) }
    val focus = remember { FocusRequester() }

    LaunchedEffect(text, editing) {
        if (!editing || !settings.showSuggestions || text.length < 2 || text.startsWith("!")) { suggestions = emptyList(); return@LaunchedEffect }
        delay(150)
        val local = (state.history.map { it.url } + state.bookmarks.map { it.url }).filter { it.contains(text, ignoreCase = true) }.take(2)
        val base = settings.searchEngine.suggestUrl(settings.searchBaseUrl)
        val remote = if (base == null) emptyList() else withContext(Dispatchers.IO) {
            runCatching {
                val raw = URL(base + URLEncoder.encode(text, "UTF-8")).readText()
                val arr = JSONArray(raw)
                val list = if (arr.length() >= 2 && arr.opt(1) is JSONArray) arr.getJSONArray(1) else arr
                (0 until list.length()).mapNotNull { i -> (list.opt(i) as? String) ?: (list.optJSONObject(i)?.optString("phrase")) }
            }.getOrDefault(emptyList())
        }
        suggestions = (local + remote).distinct().take(6)
    }

    Column(Modifier.padding(horizontal = 12.dp, vertical = 6.dp)) {
        Row(
            Modifier.fillMaxWidth().height(46.dp).clip(RoundedCornerShape(23.dp)).background(MaterialTheme.colorScheme.surfaceVariant).padding(start = 14.dp, end = 6.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            if (editing) {
                Icon(Icons.Filled.Search, null, tint = MaterialTheme.colorScheme.onSurfaceVariant)
                Spacer(Modifier.width(8.dp))
                BasicTextFieldCompat(text, { text = it }, Modifier.weight(1f).focusRequester(focus), onGo = { store.navigate(text); suggestions = emptyList() })
                if (text.isNotEmpty()) IconButton(onClick = { text = "" }) { Icon(Icons.Filled.Cancel, "Effacer", tint = MaterialTheme.colorScheme.onSurfaceVariant) }
                TextButton(onClick = { store.isEditingAddress.value = false }) { Text("Annuler") }
                LaunchedEffect(Unit) { focus.requestFocus() }
            } else {
                Row(Modifier.weight(1f).fillMaxHeight().clickable { text = tab?.url ?: ""; store.isEditingAddress.value = true; store.barsHidden.value = false }, verticalAlignment = Alignment.CenterVertically) {
                    if (settings.addressShowsFavicon) {
                        val fav = tab?.let { favicons[it.id] }
                        if (fav != null) androidx.compose.foundation.Image(fav.asImageBitmap(), null, Modifier.size(20.dp).clip(RoundedCornerShape(4.dp)))
                        else Icon(if (tab?.isPrivate == true) Icons.Filled.VisibilityOff else Icons.Filled.Language, null, Modifier.size(20.dp), tint = MaterialTheme.colorScheme.onSurfaceVariant)
                        Spacer(Modifier.width(10.dp))
                    }
                    Column(Modifier.weight(1f)) {
                        Row(verticalAlignment = Alignment.CenterVertically) {
                            if (tab?.url?.startsWith("https") == true) { Icon(Icons.Filled.Lock, null, Modifier.size(11.dp), tint = MaterialTheme.colorScheme.onSurfaceVariant); Spacer(Modifier.width(4.dp)) }
                            Text(if (tab?.url == null) "Rechercher ou saisir une adresse" else if (settings.addressShowsTitle) tab.displayTitle else tab.host, fontSize = 16.sp, maxLines = 1, overflow = TextOverflow.Ellipsis,
                                color = if (tab?.url == null) MaterialTheme.colorScheme.onSurfaceVariant else MaterialTheme.colorScheme.onSurface, style = MaterialTheme.typography.bodyLarge)
                        }
                        if (settings.addressShowsReadingTime && tab?.readingLabel != null) Text("${tab.readingLabel} de lecture", fontSize = 11.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
                    }
                }
                val loading = tab?.let { nav[it.id]?.loading } == true
                IconButton(onClick = { store.perform(if (loading) fr.furtif.browser.data.ToolbarAction.STOP else fr.furtif.browser.data.ToolbarAction.RELOAD) }) {
                    Icon(if (loading) Icons.Filled.Close else Icons.Filled.Refresh, if (loading) "Arrêter" else "Recharger")
                }
            }
        }
        if (editing && suggestions.isNotEmpty()) {
            Column(Modifier.padding(top = 6.dp).fillMaxWidth().clip(RoundedCornerShape(16.dp)).background(MaterialTheme.colorScheme.surfaceVariant)) {
                suggestions.forEach { s ->
                    Row(Modifier.fillMaxWidth().height(44.dp).clickable { store.navigate(s); suggestions = emptyList() }.padding(horizontal = 16.dp), verticalAlignment = Alignment.CenterVertically) {
                        Icon(if (s.contains('.') && !s.contains(' ')) Icons.Filled.Language else Icons.Filled.Search, null, Modifier.size(18.dp), tint = MaterialTheme.colorScheme.onSurfaceVariant)
                        Spacer(Modifier.width(12.dp))
                        Text(s, maxLines = 1, overflow = TextOverflow.Ellipsis)
                    }
                }
            }
        }
    }
}

@Composable
private fun BasicTextFieldCompat(value: String, onChange: (String) -> Unit, modifier: Modifier, onGo: () -> Unit) {
    androidx.compose.foundation.text.BasicTextField(
        value = value, onValueChange = onChange, modifier = modifier, singleLine = true,
        textStyle = MaterialTheme.typography.bodyLarge.copy(color = MaterialTheme.colorScheme.onSurface),
        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Uri, imeAction = ImeAction.Go, autoCorrectEnabled = false),
        keyboardActions = KeyboardActions(onGo = { onGo() }),
        cursorBrush = androidx.compose.ui.graphics.SolidColor(MaterialTheme.colorScheme.primary),
        decorationBox = { inner -> Box(contentAlignment = Alignment.CenterStart) { if (value.isEmpty()) Text("Rechercher ou saisir une adresse", color = MaterialTheme.colorScheme.onSurfaceVariant); inner() } },
    )
}
