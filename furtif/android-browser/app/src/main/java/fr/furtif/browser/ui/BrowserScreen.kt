package fr.furtif.browser.ui

import android.content.Intent
import android.view.ViewGroup
import android.webkit.WebView
import android.widget.FrameLayout
import androidx.activity.compose.BackHandler
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.slideInVertically
import androidx.compose.animation.slideOutVertically
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.KeyboardArrowDown
import androidx.compose.material.icons.filled.KeyboardArrowUp
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import androidx.compose.ui.viewinterop.AndroidView
import fr.furtif.browser.data.BrowserStore
import fr.furtif.browser.data.ToolbarPosition
import fr.furtif.browser.data.ToolbarStyle

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun BrowserScreen(store: BrowserStore) {
    val state by store.state.collectAsState()
    val settings = state.settings
    val tab = state.tabs.firstOrNull { it.id == state.selectedTabId }
    val barsHidden by store.barsHidden.collectAsState()
    val siteColor by store.siteThemeColor.collectAsState()
    val showMenu by store.showMenu.collectAsState()
    val showTabs by store.showTabs.collectAsState()
    val showSettings by store.showSettings.collectAsState()
    val showBookmarks by store.showBookmarks.collectAsState()
    val showHistory by store.showHistory.collectAsState()
    val showEditor by store.showToolbarEditor.collectAsState()
    val showGallery by store.showToolbarGallery.collectAsState()
    val shareUrl by store.shareRequest.collectAsState()
    val findTick by store.findRequest.collectAsState()
    val navStates by store.tabManager.navState.collectAsState()
    val context = LocalContext.current
    var showFind by remember { mutableStateOf(false) }

    LaunchedEffect(findTick) { if (findTick > 0) showFind = true }
    LaunchedEffect(shareUrl) {
        shareUrl?.let { u ->
            context.startActivity(Intent.createChooser(Intent(Intent.ACTION_SEND).apply { type = "text/plain"; putExtra(Intent.EXTRA_TEXT, u); putExtra(Intent.EXTRA_TITLE, tab?.displayTitle) }, null))
            store.shareRequest.value = null
        }
    }
    // Bouton Retour système : revient dans la page, sinon ferme les panneaux.
    BackHandler(enabled = tab != null && navStates[tab.id]?.canBack == true) { tab?.let { store.tabManager.goBack(it.id) } }

    val barColor = if (settings.adaptToSiteColor && siteColor != null) Color(siteColor!!) else MaterialTheme.colorScheme.background
    val barBg = if (settings.toolbar.style == ToolbarStyle.GLASS) MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.92f) else barColor

    Box(Modifier.fillMaxSize().background(MaterialTheme.colorScheme.background)) {
        if (tab != null) {
            AndroidView(
                modifier = Modifier.fillMaxSize(),
                factory = { ctx -> FrameLayout(ctx) },
                update = { container ->
                    val web = store.tabManager.webView(tab.id)
                    if (web.parent !== container) {
                        (web.parent as? ViewGroup)?.removeView(web)
                        container.removeAllViews()
                        container.addView(web)
                        web.setOnScrollChangeListener { _, _, y, _, oldY -> if (settings.hideBarsOnScroll) { if (y - oldY > 12 && y > 200) store.barsHidden.value = true else if (oldY - y > 12 || y < 60) store.barsHidden.value = false } }
                    }
                }
            )
        }
        Column(Modifier.fillMaxSize()) {
            if (settings.toolbar.position == ToolbarPosition.TOP) {
                AnimatedVisibility(!barsHidden, enter = slideInVertically { -it }, exit = slideOutVertically { -it }) {
                    Column(Modifier.background(barBg).statusBarsPadding()) { AddressBar(store); ToolbarRow(store, settings.toolbar.bar); ProgressLine(store) }
                }
            } else {
                AnimatedVisibility(!barsHidden, enter = slideInVertically { -it }, exit = slideOutVertically { -it }) {
                    Column(Modifier.background(barBg).statusBarsPadding()) { AddressBar(store) }
                }
            }
            Spacer(Modifier.weight(1f))
            if (showFind && tab != null) FindBar(store, tab.id) { showFind = false; store.tabManager.clearFind(tab.id) }
            if (settings.toolbar.position == ToolbarPosition.BOTTOM) {
                AnimatedVisibility(!barsHidden, enter = slideInVertically { it }, exit = slideOutVertically { it }) {
                    Column(Modifier.background(barBg).navigationBarsPadding()) { ProgressLine(store); HorizontalDivider(color = MaterialTheme.colorScheme.outlineVariant); ToolbarRow(store, settings.toolbar.bar) }
                }
            } else Spacer(Modifier.navigationBarsPadding())
        }
    }

    if (showMenu) MenuSheet(store) { store.showMenu.value = false }
    if (showTabs) TabsScreen(store) { store.showTabs.value = false }
    if (showSettings) SettingsScreen(store) { store.showSettings.value = false }
    if (showBookmarks) BookmarksScreen(store) { store.showBookmarks.value = false }
    if (showHistory) HistoryScreen(store) { store.showHistory.value = false }
    if (showEditor) ToolbarEditorScreen(store) { store.showToolbarEditor.value = false }
    if (showGallery) ToolbarGalleryScreen(store) { store.showToolbarGallery.value = false }
}

@Composable
fun ProgressLine(store: BrowserStore) {
    val state by store.state.collectAsState()
    val nav by store.tabManager.navState.collectAsState()
    val s = state.selectedTabId?.let { nav[it] }
    if (s != null && s.loading && s.progress < 1f) LinearProgressIndicator(progress = { s.progress }, modifier = Modifier.fillMaxWidth().height(2.dp), trackColor = Color.Transparent)
    else Spacer(Modifier.height(2.dp))
}

@Composable
fun FindBar(store: BrowserStore, tabId: String, onClose: () -> Unit) {
    var text by remember { mutableStateOf("") }
    Row(Modifier.fillMaxWidth().background(MaterialTheme.colorScheme.surfaceVariant).padding(horizontal = 8.dp, vertical = 4.dp), verticalAlignment = Alignment.CenterVertically) {
        OutlinedTextField(value = text, onValueChange = { text = it; store.tabManager.find(tabId, it) }, singleLine = true, placeholder = { Text("Rechercher dans la page") }, modifier = Modifier.weight(1f))
        IconButton(onClick = { store.tabManager.findNext(tabId, false) }) { Icon(Icons.Filled.KeyboardArrowUp, "Précédent") }
        IconButton(onClick = { store.tabManager.findNext(tabId, true) }) { Icon(Icons.Filled.KeyboardArrowDown, "Suivant") }
        IconButton(onClick = onClose) { Icon(Icons.Filled.Close, "Fermer") }
    }
}
