package fr.furtif.browser.data

import android.app.Application
import android.content.Intent
import android.os.VibrationEffect
import android.os.Vibrator
import android.os.VibratorManager
import android.os.Build
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import fr.furtif.browser.web.TabManager
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json
import java.io.File
import java.net.URI

/** État global de l'application (onglets, favoris, historique, réglages) + persistance JSON. */
class BrowserStore(app: Application) : AndroidViewModel(app) {
    private val json = Json { ignoreUnknownKeys = true; encodeDefaults = true }
    private val file = File(app.filesDir, "state.json")

    private val _state = MutableStateFlow(load())
    val state: StateFlow<PersistedState> = _state

    // UI éphémère
    val showTabs = MutableStateFlow(false)
    val showMenu = MutableStateFlow(false)
    val showSettings = MutableStateFlow(false)
    val showBookmarks = MutableStateFlow(false)
    val showHistory = MutableStateFlow(false)
    val showToolbarEditor = MutableStateFlow(false)
    val showToolbarGallery = MutableStateFlow(false)
    val isEditingAddress = MutableStateFlow(false)
    val barsHidden = MutableStateFlow(false)
    val siteThemeColor = MutableStateFlow<Long?>(null)
    val shareRequest = MutableStateFlow<String?>(null)
    val findRequest = MutableStateFlow(0)

    val tabManager = TabManager(app, this)
    private var saveJob: Job? = null

    init {
        if (_state.value.tabs.isEmpty()) newTab()
        if (_state.value.selectedTabId == null) _state.update { it.copy(selectedTabId = it.tabs.firstOrNull()?.id) }
    }

    val settings: Settings get() = _state.value.settings
    val tabs: List<BrowserTab> get() = _state.value.tabs
    val selectedTab: BrowserTab? get() = _state.value.tabs.firstOrNull { it.id == _state.value.selectedTabId }

    private fun mutate(change: (PersistedState) -> PersistedState) { _state.update(change); scheduleSave() }
    fun updateSettings(change: (Settings) -> Settings) = mutate { it.copy(settings = change(it.settings)) }
    fun updateTab(id: String, change: (BrowserTab) -> BrowserTab) = mutate { s -> s.copy(tabs = s.tabs.map { if (it.id == id) change(it) else it }) }

    // ----- Onglets -----
    fun newTab(url: String? = null, isPrivate: Boolean = false, select: Boolean = true) {
        val tab = BrowserTab(url = url ?: newTabUrl(), isPrivate = isPrivate)
        mutate { it.copy(tabs = it.tabs + tab, selectedTabId = if (select) tab.id else it.selectedTabId) }
        haptic()
    }
    fun select(id: String) { mutate { it.copy(selectedTabId = id) }; siteThemeColor.value = null; barsHidden.value = false }
    fun close(id: String) {
        val idx = tabs.indexOfFirst { it.id == id }.takeIf { it >= 0 } ?: return
        tabManager.discard(id)
        mutate { s ->
            val rest = s.tabs.filterNot { it.id == id }
            val sel = if (s.selectedTabId == id) rest.getOrNull(minOf(idx, rest.size - 1))?.id else s.selectedTabId
            s.copy(tabs = rest, selectedTabId = sel)
        }
        if (tabs.isEmpty()) newTab()
        haptic()
    }
    fun closeAllTabs() { tabs.forEach { tabManager.discard(it.id) }; mutate { it.copy(tabs = emptyList(), selectedTabId = null) }; newTab(); haptic() }

    fun newTabUrl(): String? = when (settings.newTabPage) {
        NewTabPage.START -> null
        NewTabPage.BLANK -> "about:blank"
        NewTabPage.SEARCH -> settings.searchEngine.url("", settings.searchBaseUrl).substringBefore("?")
        NewTabPage.CUSTOM -> settings.newTabCustomUrl.ifBlank { null }
    }

    // ----- Navigation -----
    fun navigate(text: String) {
        val tab = selectedTab ?: return
        tabManager.load(urlFromInput(text), tab.id)
        isEditingAddress.value = false
    }
    fun urlFromInput(raw: String): String {
        val t = raw.trim()
        if (Regex("^(https?|about|file)://.*|^about:.*").matches(t)) return t
        val looksLikeHost = !t.contains(' ') && t.contains('.') && !t.endsWith('.')
        if (looksLikeHost) return (if (settings.upgradeToHttps) "https://" else "http://") + t
        return settings.searchEngine.url(t, settings.searchBaseUrl)
    }

    fun perform(action: ToolbarAction) {
        val tab = selectedTab ?: return
        haptic()
        when (action) {
            ToolbarAction.BACK -> tabManager.goBack(tab.id)
            ToolbarAction.FORWARD -> tabManager.goForward(tab.id)
            ToolbarAction.RELOAD -> tabManager.reload(tab.id)
            ToolbarAction.STOP -> tabManager.stop(tab.id)
            ToolbarAction.TABS -> showTabs.value = true
            ToolbarAction.NEW_TAB -> newTab()
            ToolbarAction.NEW_PRIVATE_TAB -> newTab(isPrivate = true)
            ToolbarAction.CLOSE_TAB -> close(tab.id)
            ToolbarAction.CLOSE_ALL_TABS -> closeAllTabs()
            ToolbarAction.BOOKMARKS -> showBookmarks.value = true
            ToolbarAction.ADD_BOOKMARK -> toggleBookmark(tab)
            ToolbarAction.HISTORY -> showHistory.value = true
            ToolbarAction.SHARE -> shareRequest.value = tab.url
            ToolbarAction.FIND -> findRequest.update { it + 1 }
            ToolbarAction.BLOCKER -> { updateSettings { it.copy(blockerEnabled = !it.blockerEnabled) }; tabManager.reload(tab.id) }
            ToolbarAction.DARKEN -> toggleDarken(tab)
            ToolbarAction.READER -> tabManager.toggleReader(tab.id)
            ToolbarAction.JAVASCRIPT -> { toggleJavaScript(tab); tabManager.applySettings(tab.id); tabManager.reload(tab.id) }
            ToolbarAction.DESKTOP_SITE -> { toggleDesktop(tab); tabManager.applySettings(tab.id); tabManager.reload(tab.id) }
            ToolbarAction.TRANSLATE -> tab.url?.let { tabManager.load("https://translate.google.com/translate?sl=auto&tl=fr&u=" + java.net.URLEncoder.encode(it, "UTF-8"), tab.id) }
            ToolbarAction.SCROLL_TOP -> tabManager.js(tab.id, "window.scrollTo({top:0,behavior:'smooth'})")
            ToolbarAction.SCROLL_BOTTOM -> tabManager.js(tab.id, "window.scrollTo({top:document.body.scrollHeight,behavior:'smooth'})")
            ToolbarAction.HOME -> tabManager.load(newTabUrl(), tab.id)
            ToolbarAction.SETTINGS -> showSettings.value = true
            ToolbarAction.CUSTOMIZE -> showToolbarEditor.value = true
            ToolbarAction.MENU -> showMenu.value = true
            ToolbarAction.SEPARATOR -> Unit
        }
    }

    // ----- Réglages par site -----
    fun hostOf(url: String?): String? = runCatching { URI(url ?: return null).host }.getOrNull()
    fun isJavaScriptEnabled(url: String?): Boolean { if (!settings.javascriptEnabled) return false; val h = hostOf(url) ?: return true; return h !in settings.javascriptDisabledHosts }
    fun toggleJavaScript(tab: BrowserTab) { val h = hostOf(tab.url) ?: return updateSettings { it.copy(javascriptEnabled = !it.javascriptEnabled) }; updateSettings { it.copy(javascriptDisabledHosts = if (h in it.javascriptDisabledHosts) it.javascriptDisabledHosts - h else it.javascriptDisabledHosts + h) } }
    fun isDarkened(tab: BrowserTab): Boolean { val h = hostOf(tab.url) ?: return settings.darkenSites; return settings.darkenSites != (h in settings.darkenHosts) }
    fun toggleDarken(tab: BrowserTab) {
        val h = hostOf(tab.url)
        if (h == null) updateSettings { it.copy(darkenSites = !it.darkenSites) }
        else updateSettings { it.copy(darkenHosts = if (h in it.darkenHosts) it.darkenHosts - h else it.darkenHosts + h) }
        tabManager.applyDarken(tab.id, isDarkened(tab))
    }
    fun isDesktop(tab: BrowserTab): Boolean = hostOf(tab.url)?.let { it in settings.desktopHosts } ?: false
    fun toggleDesktop(tab: BrowserTab) { val h = hostOf(tab.url) ?: return; updateSettings { it.copy(desktopHosts = if (h in it.desktopHosts) it.desktopHosts - h else it.desktopHosts + h) } }

    // ----- Favoris & historique -----
    fun isBookmarked(tab: BrowserTab) = tab.url != null && _state.value.bookmarks.any { it.url == tab.url }
    fun toggleBookmark(tab: BrowserTab) {
        val u = tab.url ?: return
        mutate { s -> if (s.bookmarks.any { it.url == u }) s.copy(bookmarks = s.bookmarks.filterNot { it.url == u }) else s.copy(bookmarks = listOf(Bookmark(title = tab.displayTitle, url = u)) + s.bookmarks) }
    }
    fun removeBookmark(id: String) = mutate { s -> s.copy(bookmarks = s.bookmarks.filterNot { it.id == id }) }
    fun recordVisit(tab: BrowserTab) {
        val u = tab.url ?: return
        if (tab.isPrivate || !u.startsWith("http")) return
        mutate { s ->
            val h = s.history
            if (h.firstOrNull()?.url == u) s.copy(history = listOf(h[0].copy(title = tab.displayTitle)) + h.drop(1))
            else s.copy(history = (listOf(HistoryEntry(title = tab.displayTitle, url = u)) + h).take(2000))
        }
    }
    fun removeHistory(id: String) = mutate { s -> s.copy(history = s.history.filterNot { it.id == id }) }
    fun clearHistory() = mutate { it.copy(history = emptyList()) }

    fun haptic() {
        if (!settings.haptics) return
        val app = getApplication<Application>()
        val v = if (Build.VERSION.SDK_INT >= 31) (app.getSystemService(VibratorManager::class.java)).defaultVibrator else @Suppress("DEPRECATION") app.getSystemService(Vibrator::class.java)
        val effect = if (Build.VERSION.SDK_INT >= 29) VibrationEffect.createPredefined(VibrationEffect.EFFECT_CLICK) else VibrationEffect.createOneShot(12, VibrationEffect.DEFAULT_AMPLITUDE)
        v?.vibrate(effect)
    }

    fun handleIntent(intent: Intent?) {
        intent ?: return
        when (intent.action) {
            Intent.ACTION_VIEW -> intent.dataString?.let { newTab(url = it) }
            Intent.ACTION_WEB_SEARCH -> intent.getStringExtra("query")?.let { newTab(url = urlFromInput(it)) }
            Intent.ACTION_SEND -> intent.getStringExtra(Intent.EXTRA_TEXT)?.let { newTab(url = urlFromInput(it)) }
        }
    }

    // ----- Persistance -----
    private fun load(): PersistedState = runCatching { json.decodeFromString<PersistedState>(file.readText()) }
        .map { it.copy(tabs = it.tabs.filterNot { t -> t.isPrivate }) }   // les onglets privés ne survivent pas au redémarrage
        .getOrDefault(PersistedState())
    private fun scheduleSave() {
        saveJob?.cancel()
        saveJob = viewModelScope.launch { delay(400); runCatching { file.writeText(json.encodeToString(_state.value)) } }
    }
}
