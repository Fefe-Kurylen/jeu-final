package fr.qafila.browser.ui

import android.app.Activity
import android.content.Context
import android.content.ContextWrapper
import android.content.Intent
import android.content.res.Configuration
import android.view.ViewGroup
import android.widget.FrameLayout
import androidx.activity.compose.BackHandler
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.core.tween
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.scaleIn
import androidx.compose.animation.scaleOut
import androidx.compose.animation.slideInVertically
import androidx.compose.animation.slideOutVertically
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.WindowInsetsSides
import androidx.compose.foundation.layout.asPaddingValues
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.ime
import androidx.compose.foundation.layout.navigationBars
import androidx.compose.foundation.layout.only
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBars
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.layout.union
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.windowInsetsPadding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.SideEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableFloatStateOf
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.graphics.TransformOrigin
import androidx.compose.ui.graphics.luminance
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.layout.onSizeChanged
import androidx.compose.ui.platform.LocalConfiguration
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.platform.LocalView
import androidx.compose.ui.text.TextRange
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.input.TextFieldValue
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.viewinterop.AndroidView
import androidx.core.view.WindowCompat
import fr.qafila.browser.data.AddressLongPressAction
import fr.qafila.browser.data.AddressTapAction
import fr.qafila.browser.data.BrowserStore
import fr.qafila.browser.data.ScrollBehavior
import fr.qafila.browser.data.SettingsPage
import fr.qafila.browser.data.SuggestionsMode
import fr.qafila.browser.data.ToolbarAction
import fr.qafila.browser.data.ToolbarPosition
import fr.qafila.browser.data.ToolbarStyle
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.delay
import kotlinx.coroutines.withContext
import org.json.JSONArray
import org.json.JSONObject
import java.net.URL
import java.net.URLEncoder

private tailrec fun Context.findActivity(): Activity? = when (this) { is Activity -> this; is ContextWrapper -> baseContext.findActivity(); else -> null }

@Composable
fun BrowserScreen(store: BrowserStore) {
    val state by store.state.collectAsState()
    val s = state.settings
    val tab = state.tabs.firstOrNull { it.id == state.selectedTabId }
    val q = LocalQ.current
    val navStates by store.tabManager.navState.collectAsState()
    val icons by store.tabManager.favicons.icons.collectAsState()
    val reader by store.tabManager.readerActive.collectAsState()
    val hidden by store.barsHidden.collectAsState()
    val collapsed by store.barCollapsed.collectAsState()
    val editing by store.isEditingAddress.collectAsState()
    val showMenu by store.showMenu.collectAsState()
    val showTabs by store.showTabs.collectAsState()
    val showSettings by store.showSettings.collectAsState()
    val showBookmarks by store.showBookmarks.collectAsState()
    val showHistory by store.showHistory.collectAsState()
    val shareUrl by store.shareRequest.collectAsState()
    val findTick by store.findRequest.collectAsState()
    val context = LocalContext.current
    val density = LocalDensity.current
    val landscape = LocalConfiguration.current.orientation == Configuration.ORIENTATION_LANDSCAPE
    val top = s.toolbar.position == ToolbarPosition.TOP || (landscape && s.landscapeTopBar)
    var showFind by remember { mutableStateOf(false) }
    var chromeHeightPx by remember { mutableIntStateOf(0) }
    var rootSize by remember { mutableStateOf(androidx.compose.ui.unit.IntSize.Zero) }
    var menuAnchorX by remember { mutableFloatStateOf(Float.MAX_VALUE) }
    var query by remember { mutableStateOf(TextFieldValue("")) }
    var suggestions by remember { mutableStateOf<List<Suggestion>>(emptyList()) }

    LaunchedEffect(q.dark) { store.tabManager.refreshDarken() }
    LaunchedEffect(findTick) { if (findTick > 0) { showFind = true; store.expandBar() } }
    LaunchedEffect(shareUrl) {
        shareUrl?.let { u ->
            context.startActivity(Intent.createChooser(Intent(Intent.ACTION_SEND).apply { type = "text/plain"; putExtra(Intent.EXTRA_TEXT, u); putExtra(Intent.EXTRA_TITLE, tab?.displayTitle) }, null))
            store.shareRequest.value = null
        }
    }
    LaunchedEffect(editing) { if (editing) { val u = tab?.url ?: ""; query = TextFieldValue(u, TextRange(0, u.length)) } else suggestions = emptyList() }
    LaunchedEffect(query.text, editing) {
        val text = query.text
        val allowed = when (s.suggestionsMode) { SuggestionsMode.EVERYWHERE -> true; SuggestionsMode.NOT_PRIVATE -> tab?.isPrivate != true; SuggestionsMode.NEVER -> false }
        if (!editing || text.isBlank() || text == tab?.url) { suggestions = emptyList(); return@LaunchedEffect }
        delay(140)
        val local = (state.bookmarks.map { Suggestion(it.title, it.url, SuggestionKind.BOOKMARK) } + state.history.take(400).map { Suggestion(it.title, it.url, SuggestionKind.HISTORY) })
            .filter { it.url.contains(text, true) || it.title.contains(text, true) }.distinctBy { it.url }.take(3)
        val remote = if (!allowed || text.length < 2 || tab?.isPrivate == true && s.suggestionsMode != SuggestionsMode.EVERYWHERE) emptyList() else fetchSuggestions(s.searchEngine.suggestUrl(s.searchBaseUrl), text)
        suggestions = (local + remote.map { Suggestion(it, it, SuggestionKind.SEARCH) }).distinctBy { it.url }.take(7)
    }

    // Retour système : saisie → menu → page précédente.
    BackHandler(enabled = tab != null && navStates[tab.id]?.canBack == true && !editing && !showMenu) { tab?.let { store.tabManager.goBack(it.id) } }
    BackHandler(enabled = showFind && !editing && !showMenu) { showFind = false; tab?.let { store.tabManager.clearFind(it.id) } }
    BackHandler(enabled = editing) { store.isEditingAddress.value = false }
    BackHandler(enabled = showMenu) { store.showMenu.value = false }

    // ----- Couleurs -----
    val siteColor = parseHex(tab?.themeColor)
    val darkened = tab?.let { store.isDarkened(it) } == true
    val barBg = resolveBarColor(s, q.dark, siteColor, tab?.isPrivate == true, darkened)
    val bar = barColorsFor(barBg)
    val glass = s.toolbar.style == ToolbarStyle.GLASS
    val statusColor = when {
        tab?.url == null -> q.page
        siteColor != null && !darkened && (!q.dark || siteColor.luminance() < 0.5f) -> siteColor
        else -> if (q.dark || darkened) Color.Black else Color.White
    }
    val anyOverlay = showTabs || showSettings || showBookmarks || showHistory
    val view = LocalView.current
    SideEffect {
        val window = view.context.findActivity()?.window ?: return@SideEffect
        val ctl = WindowCompat.getInsetsController(window, view)
        ctl.isAppearanceLightStatusBars = if (anyOverlay) !q.dark else (if (top) bar.light else statusColor.luminance() > 0.5f)
        ctl.isAppearanceLightNavigationBars = if (anyOverlay) !q.dark else (if (top) statusColor.luminance() > 0.5f else bar.light)
    }

    // ----- Barre -----
    val n = tab?.let { navStates[it.id] }
    val active = buildSet {
        if (tab != null) {
            if (store.isBookmarked(tab)) add(ToolbarAction.ADD_BOOKMARK)
            if (store.isBlockerActive(store.hostOf(tab.url))) add(ToolbarAction.BLOCKER)
            if (darkened) add(ToolbarAction.DARKEN)
            if (store.isJavaScriptEnabled(tab.url)) add(ToolbarAction.JAVASCRIPT)
            if (store.isDesktop(tab)) add(ToolbarAction.DESKTOP_SITE)
            if (tab.id in reader) add(ToolbarAction.READER)
        }
    }
    val data = ChromeData(
        url = tab?.url, host = tab?.hostOrNull, title = tab?.displayTitle ?: "", readLabel = tab?.readingLabel, favicon = icons[store.tabManager.favicons.keyOf(tab?.url)],
        isPrivate = tab?.isPrivate == true, tabCount = state.tabs.count { it.isPrivate == (tab?.isPrivate == true) }, canBack = n?.canBack == true, canForward = n?.canForward == true,
        loading = n?.loading == true, progress = n?.progress ?: 1f, active = active,
    )
    fun startEdit() { store.expandBar(); store.showMenu.value = false; store.isEditingAddress.value = true }
    val cb = ChromeCallbacks(
        onAction = { a -> store.perform(a) },
        onLongAction = { a ->
            store.haptic()
            when (a) {
                ToolbarAction.TABS -> store.newTab(isPrivate = tab?.isPrivate == true)
                ToolbarAction.NEW_TAB -> store.newTab(isPrivate = true)
                ToolbarAction.BACK, ToolbarAction.FORWARD -> store.showHistory.value = true
                ToolbarAction.CLOSE_TAB -> store.reopenClosedTab()
                else -> store.openSettings(SettingsPage.EDITOR, standalone = true)
            }
        },
        onAddressTap = { if (s.addressTap == AddressTapAction.EDIT) startEdit() else store.showMenu.value = true },
        onAddressLongPress = {
            store.haptic()
            if (s.addressTap == AddressTapAction.MENU) startEdit() else when (s.addressLongPress) {
                AddressLongPressAction.MENU -> store.showMenu.value = true
                AddressLongPressAction.COPY -> tab?.url?.let { store.copyToClipboard(it) }
                AddressLongPressAction.NONE -> Unit
            }
        },
        onExpand = { store.expandBar() },
        onSwipe = { d -> tab?.let { store.haptic(); if (d < 0) store.tabManager.goBack(it.id) else store.tabManager.goForward(it.id) } },
        onMenuAnchor = { menuAnchorX = it },
    )

    Box(Modifier.fillMaxSize().background(statusColor).onSizeChanged { rootSize = it }) {
        val statusInset = WindowInsets.statusBars.asPaddingValues().calculateTopPadding()
        val navInset = WindowInsets.navigationBars.asPaddingValues().calculateBottomPadding()
        val chromeDp = with(density) { chromeHeightPx.toDp() }
        val reserve = when { hidden -> 0.dp; glass && s.scrollBehavior != ScrollBehavior.FIXED -> 0.dp; else -> chromeDp }
        val contentPad = if (top) Modifier.padding(top = if (hidden) statusInset else reserve.coerceAtLeast(statusInset)).windowInsetsPadding(WindowInsets.navigationBars.union(WindowInsets.ime).only(WindowInsetsSides.Bottom))
            else Modifier.padding(top = statusInset, bottom = reserve)

        // ----- Contenu : page de démarrage ou WebView -----
        Box(Modifier.fillMaxSize().then(contentPad)) {
            if (tab != null) {
                if (tab.url == null) StartPage(store, tab)
                else AndroidView(
                    modifier = Modifier.fillMaxSize(),
                    factory = { ctx -> FrameLayout(ctx) },
                    update = { container ->
                        val web = store.tabManager.webView(tab.id)
                        if (web.parent !== container) {
                            (web.parent as? ViewGroup)?.removeView(web)
                            container.removeAllViews()
                            container.addView(web)
                            web.setOnScrollChangeListener { _, _, y, _, oldY -> store.onWebScroll(y, oldY) }
                            store.tabManager.onSelected(tab.id)
                        }
                    },
                )
            }
        }

        // Barre masquée : un tap en bas (ou en haut) la fait revenir.
        if (hidden) Box(Modifier.align(if (top) Alignment.TopCenter else Alignment.BottomCenter).fillMaxWidth().height((if (top) statusInset else navInset) + 26.dp)
            .pointerInput(Unit) { detectTapGestures { store.expandBar() } })

        // ----- Suggestions, au-dessus de la barre (près du pouce) -----
        if (editing && suggestions.isNotEmpty()) {
            val list = if (top) suggestions else suggestions.reversed()
            Column(
                Modifier.align(if (top) Alignment.TopCenter else Alignment.BottomCenter).padding(top = if (top) chromeDp + 6.dp else 0.dp, bottom = if (top) 0.dp else chromeDp + 6.dp)
                    .padding(horizontal = 10.dp).fillMaxWidth().clip(RoundedCornerShape(16.dp)).background(q.card).blockTouches(),
            ) {
                list.forEachIndexed { i, sg ->
                    SuggestionRow(sg, onOpen = { store.navigate(sg.url) }, onFill = { query = TextFieldValue(sg.url, TextRange(sg.url.length)) })
                    if (i < list.lastIndex) RowDivider(46.dp)
                }
            }
        }

        // ----- La barre -----
        AnimatedVisibility(
            visible = !hidden, modifier = Modifier.align(if (top) Alignment.TopCenter else Alignment.BottomCenter),
            enter = slideInVertically(tween(200)) { if (top) -it else it }, exit = slideOutVertically(tween(200)) { if (top) -it else it },
        ) {
            Column(
                Modifier.fillMaxWidth().onSizeChanged { chromeHeightPx = it.height }.background(if (glass) bar.bg.copy(alpha = 0.80f) else bar.bg)
                    .then(if (top) Modifier.statusBarsPadding() else Modifier.windowInsetsPadding(WindowInsets.navigationBars.union(WindowInsets.ime).only(WindowInsetsSides.Bottom))),
            ) {
                if (showFind && tab != null && !top) FindBar(store, tab.id, bar) { showFind = false; store.tabManager.clearFind(tab.id) }
                ChromeContent(
                    data, s, s.toolbar, bar, collapsed = collapsed && !editing, cb = cb, background = false,
                    editing = if (editing) ({ AddressEditor(query, bar, { query = it }, { store.navigate(query.text) }, { store.isEditingAddress.value = false }) }) else null,
                )
                if (showFind && tab != null && top) FindBar(store, tab.id, bar) { showFind = false; store.tabManager.clearFind(tab.id) }
            }
        }

        // ----- Menu flottant, ancré au-dessus du bouton Menu -----
        val right = menuAnchorX > rootSize.width / 2f
        AnimatedVisibility(showMenu, enter = fadeIn(tween(150)), exit = fadeOut(tween(150))) {
            Box(Modifier.fillMaxSize().background(Color.Black.copy(alpha = 0.10f)).clickable(remember { MutableInteractionSource() }, null) { store.showMenu.value = false })
        }
        val origin = TransformOrigin(if (right) 1f else 0f, if (top) 0f else 1f)
        val maxMenu = with(density) { rootSize.height.toDp() } - chromeDp - statusInset - 24.dp
        AnimatedVisibility(
            showMenu,
            modifier = Modifier.align(if (top) (if (right) Alignment.TopEnd else Alignment.TopStart) else (if (right) Alignment.BottomEnd else Alignment.BottomStart))
                .padding(start = 10.dp, end = 10.dp, top = if (top) chromeDp + 6.dp else 0.dp, bottom = if (top) 0.dp else chromeDp + 6.dp),
            enter = scaleIn(tween(200), initialScale = 0.92f, transformOrigin = origin) + fadeIn(tween(140)),
            exit = scaleOut(tween(150), targetScale = 0.92f, transformOrigin = origin) + fadeOut(tween(120)),
        ) { MenuCard(store, maxMenu.coerceAtLeast(200.dp)) }

        // ----- Écrans plein écran -----
        Overlay(showTabs) { TabsScreen(store) { store.showTabs.value = false } }
        Overlay(showBookmarks) { BookmarksScreen(store) { store.showBookmarks.value = false } }
        Overlay(showHistory) { HistoryScreen(store) { store.showHistory.value = false } }
        Overlay(showSettings) { SettingsScreen(store) { store.showSettings.value = false } }
    }
}

@Composable
private fun Overlay(visible: Boolean, content: @Composable () -> Unit) {
    AnimatedVisibility(visible, enter = fadeIn(tween(180)) + slideInVertically(tween(220)) { it / 14 }, exit = fadeOut(tween(160)) + slideOutVertically(tween(180)) { it / 14 }) { content() }
}

// ----- Suggestions -----
enum class SuggestionKind { SEARCH, HISTORY, BOOKMARK }
data class Suggestion(val title: String, val url: String, val kind: SuggestionKind)

private suspend fun fetchSuggestions(base: String?, text: String): List<String> {
    if (base == null) return emptyList()
    return withContext(Dispatchers.IO) {
        runCatching {
            val c = URL(base + URLEncoder.encode(text, "UTF-8")).openConnection()
            c.connectTimeout = 3000; c.readTimeout = 3000
            val raw = c.getInputStream().bufferedReader().use { it.readText() }.trim()
            if (raw.startsWith("{")) {
                // Qwant : {"data":{"items":[{"value":"…"}]}}
                val items = JSONObject(raw).optJSONObject("data")?.optJSONArray("items") ?: JSONArray()
                (0 until items.length()).mapNotNull { i -> items.optJSONObject(i)?.optString("value")?.takeIf { it.isNotBlank() } }
            } else {
                val arr = JSONArray(raw)
                val list = if (arr.length() >= 2 && arr.opt(1) is JSONArray) arr.getJSONArray(1) else arr
                (0 until list.length()).mapNotNull { i -> (list.opt(i) as? String) ?: list.optJSONObject(i)?.optString("phrase") }
            }
        }.getOrDefault(emptyList()).take(5)
    }
}

@Composable
private fun SuggestionRow(sg: Suggestion, onOpen: () -> Unit, onFill: () -> Unit) {
    val q = LocalQ.current
    Row(Modifier.fillMaxWidth().height(46.dp).rowClick(onClick = onOpen).padding(start = 14.dp, end = 4.dp), verticalAlignment = Alignment.CenterVertically) {
        QIconView(when (sg.kind) { SuggestionKind.SEARCH -> QIcon.SEARCH; SuggestionKind.HISTORY -> QIcon.CLOCK; SuggestionKind.BOOKMARK -> QIcon.STAR }, null, q.secondary, 17.dp)
        Spacer(Modifier.width(14.dp))
        Column(Modifier.weight(1f)) {
            Text(sg.title, color = q.text, fontSize = 15.sp, maxLines = 1, overflow = TextOverflow.Ellipsis)
            if (sg.kind != SuggestionKind.SEARCH) Text(sg.url.removePrefix("https://").removePrefix("www."), color = q.secondary, fontSize = 11.5.sp, maxLines = 1, overflow = TextOverflow.Ellipsis)
        }
        Box(Modifier.size(40.dp).pressFade(onClick = onFill), contentAlignment = Alignment.Center) { QIconView(QIcon.CHEVRON_UP, "Compléter", q.tertiary, 15.dp) }
    }
}

/** Recherche dans la page, au-dessus de la rangée d'icônes. */
@Composable
private fun FindBar(store: BrowserStore, tabId: String, bar: BarColors, onClose: () -> Unit) {
    var text by remember { mutableStateOf("") }
    Row(Modifier.fillMaxWidth().padding(start = 10.dp, end = 4.dp, top = 8.dp), verticalAlignment = Alignment.CenterVertically) {
        Row(Modifier.weight(1f).height(38.dp).clip(RoundedCornerShape(10.dp)).background(bar.card).padding(horizontal = 10.dp), verticalAlignment = Alignment.CenterVertically) {
            QIconView(QIcon.FIND, null, bar.secondary, 16.dp)
            Spacer(Modifier.width(8.dp))
            BasicTextField(text, { text = it; store.tabManager.find(tabId, it) }, Modifier.weight(1f), singleLine = true, textStyle = TextStyle(color = bar.text, fontSize = 15.sp), cursorBrush = SolidColor(bar.text),
                decorationBox = { inner -> Box(contentAlignment = Alignment.CenterStart) { if (text.isEmpty()) Text("Rechercher dans la page", color = bar.secondary, fontSize = 15.sp); inner() } })
        }
        Box(Modifier.size(38.dp).pressFade { store.tabManager.findNext(tabId, false) }, contentAlignment = Alignment.Center) { QIconView(QIcon.CHEVRON_UP, "Précédent", bar.text, 17.dp) }
        Box(Modifier.size(38.dp).pressFade { store.tabManager.findNext(tabId, true) }, contentAlignment = Alignment.Center) { QIconView(QIcon.CHEVRON_DOWN, "Suivant", bar.text, 17.dp) }
        Text("OK", Modifier.pressFade(onClick = onClose).padding(horizontal = 10.dp, vertical = 8.dp), color = bar.text, fontSize = 15.sp)
    }
}
