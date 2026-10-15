package fr.qafila.browser.data

import android.app.Application
import android.content.BroadcastReceiver
import android.content.ClipData
import android.content.ClipboardManager
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.content.pm.PackageManager
import android.content.res.Configuration
import android.os.Build
import android.os.PowerManager
import android.os.VibrationEffect
import android.os.Vibrator
import android.os.VibratorManager
import android.webkit.CookieManager
import android.webkit.WebStorage
import android.widget.Toast
import androidx.core.content.ContextCompat
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import fr.qafila.browser.web.TabManager
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

/** Pages des réglages (navigation à sous-pages). */
enum class SettingsPage(val title: String) {
    ROOT("Réglages"), APPEARANCE("Apparence"), TOOLBAR("Barre d'outils"), ADDRESS("Barre d'adresse"), TABS("Onglets"), SEARCH("Recherche"),
    PRIVACY("Confidentialité"), READING("Lecture"), ENERGY("Énergie"), ABOUT("À propos"), EDITOR("Personnaliser"), GALLERY("Galerie de barres"),
}

/** État global de l'application (onglets, favoris, historique, réglages) + persistance JSON. */
class BrowserStore(app: Application) : AndroidViewModel(app) {
    private val json = Json { ignoreUnknownKeys = true; encodeDefaults = true; coerceInputValues = true }
    private val file = File(app.filesDir, "state.json")

    private val _state = MutableStateFlow(load())
    val state: StateFlow<PersistedState> = _state

    // ----- UI éphémère -----
    val showTabs = MutableStateFlow(false)
    val showMenu = MutableStateFlow(false)
    val showSettings = MutableStateFlow(false)
    /** Pile de pages des réglages (la dernière est affichée). */
    val settingsStack = MutableStateFlow(listOf(SettingsPage.ROOT))
    val showBookmarks = MutableStateFlow(false)
    val showHistory = MutableStateFlow(false)
    val isEditingAddress = MutableStateFlow(false)
    /** Défilement « Masquer » : toute la barre est hors de l'écran. */
    val barsHidden = MutableStateFlow(false)
    /** Défilement « Réduire » : il ne reste que la mini-adresse. */
    val barCollapsed = MutableStateFlow(false)
    val shareRequest = MutableStateFlow<String?>(null)
    val findRequest = MutableStateFlow(0)
    val powerSave = MutableStateFlow(false)

    val tabManager = TabManager(app, this, viewModelScope)
    private val closedTabs = ArrayDeque<BrowserTab>()
    private var saveJob: Job? = null
    private val powerManager = app.getSystemService(PowerManager::class.java)
    private val powerReceiver = object : BroadcastReceiver() {
        override fun onReceive(context: Context?, intent: Intent?) { powerSave.value = powerManager?.isPowerSaveMode == true; suspendBackgroundTabsIfNeeded() }
    }

    init {
        autoCloseOldTabs()
        if (_state.value.tabs.isEmpty()) BrowserTab(url = newTabUrl()).let { t -> _state.update { it.copy(tabs = listOf(t), selectedTabId = t.id) } }
        if (_state.value.selectedTabId == null || _state.value.tabs.none { it.id == _state.value.selectedTabId }) _state.update { it.copy(selectedTabId = it.tabs.lastOrNull()?.id) }
        powerSave.value = powerManager?.isPowerSaveMode == true
        runCatching { ContextCompat.registerReceiver(app, powerReceiver, IntentFilter(PowerManager.ACTION_POWER_SAVE_MODE_CHANGED), ContextCompat.RECEIVER_NOT_EXPORTED) }
        _state.value.tabs.forEach { tabManager.favicons.request(it.url, persist = !it.isPrivate) }
    }

    override fun onCleared() {
        runCatching { getApplication<Application>().unregisterReceiver(powerReceiver) }
        tabManager.destroyAll()
    }

    val settings: Settings get() = _state.value.settings
    val tabs: List<BrowserTab> get() = _state.value.tabs
    val selectedTab: BrowserTab? get() = _state.value.tabs.firstOrNull { it.id == _state.value.selectedTabId }

    private fun mutate(change: (PersistedState) -> PersistedState) { _state.update(change); scheduleSave() }
    fun updateSettings(change: (Settings) -> Settings) {
        val before = settings
        mutate { it.copy(settings = change(it.settings)) }
        val after = settings
        if (before.textZoom != after.textZoom || before.desktopByDefault != after.desktopByDefault || before.javascriptEnabled != after.javascriptEnabled || before.customUserAgent != after.customUserAgent) tabManager.applySettingsToAll()
        if (before.darkenSites != after.darkenSites || before.darkenOnlyInDarkMode != after.darkenOnlyInDarkMode || before.darkenHosts != after.darkenHosts || before.appearance != after.appearance) tabManager.refreshDarken()
        if (before.scrollBehavior != after.scrollBehavior) { barsHidden.value = false; barCollapsed.value = false }
        if (before.appIcon != after.appIcon) applyAppIcon(after.appIcon)
    }
    fun updateTab(id: String, change: (BrowserTab) -> BrowserTab) = mutate { s -> s.copy(tabs = s.tabs.map { if (it.id == id) change(it) else it }) }

    /** Thème effectif de l'application (réglage Thème + mode du système). */
    fun isAppDark(): Boolean = when (settings.appearance) {
        Appearance.LIGHT -> false
        Appearance.DARK -> true
        Appearance.SYSTEM -> (getApplication<Application>().resources.configuration.uiMode and Configuration.UI_MODE_NIGHT_MASK) == Configuration.UI_MODE_NIGHT_YES
    }

    // ----- Onglets -----
    fun newTab(url: String? = null, isPrivate: Boolean = false, select: Boolean = true) {
        val previous = selectedTab?.id
        val tab = BrowserTab(url = url ?: newTabUrl(), isPrivate = isPrivate)
        mutate { it.copy(tabs = it.tabs + tab, selectedTabId = if (select) tab.id else it.selectedTabId) }
        if (select) { previous?.let { tabManager.captureSnapshot(it) }; afterSelection(tab.id) }
        haptic()
    }
    fun select(id: String) {
        val previous = _state.value.selectedTabId
        if (previous != null && previous != id) tabManager.captureSnapshot(previous)
        mutate { s -> s.copy(selectedTabId = id, tabs = s.tabs.map { if (it.id == id) it.copy(lastVisited = System.currentTimeMillis()) else it }) }
        afterSelection(id)
    }
    private fun afterSelection(id: String) {
        barsHidden.value = false; barCollapsed.value = false; isEditingAddress.value = false
        tabManager.onSelected(id)
        suspendBackgroundTabsIfNeeded()
    }
    /** Économie d'énergie : les onglets en arrière-plan sont mis en veille (rechargés quand on y revient). */
    private fun suspendBackgroundTabsIfNeeded() {
        if (!settings.suspendTabsInPowerSave || powerManager?.isPowerSaveMode != true) return
        val current = _state.value.selectedTabId
        tabs.filter { it.id != current && tabManager.hasView(it.id) }.forEach { tabManager.captureSnapshot(it.id); tabManager.suspend(it.id) }
    }
    fun close(id: String) {
        val idx = tabs.indexOfFirst { it.id == id }.takeIf { it >= 0 } ?: return
        tabs[idx].takeIf { it.url != null }?.let { closedTabs.addLast(it); if (closedTabs.size > 25) closedTabs.removeFirst() }
        tabManager.discard(id)
        mutate { s ->
            val rest = s.tabs.filterNot { it.id == id }
            val sel = if (s.selectedTabId == id) rest.getOrNull(minOf(idx, rest.size - 1))?.id else s.selectedTabId
            s.copy(tabs = rest, selectedTabId = sel)
        }
        if (tabs.isEmpty()) newTab() else selectedTab?.let { afterSelection(it.id) }
        haptic()
    }
    fun reopenClosedTab() {
        val t = closedTabs.removeLastOrNull() ?: return toast("Aucun onglet fermé récemment")
        newTab(url = t.url, isPrivate = t.isPrivate)
    }
    fun closeAllTabs(clearData: Boolean = settings.clearOnCloseAll, privateOnly: Boolean? = null) {
        val targets = tabs.filter { privateOnly == null || it.isPrivate == privateOnly }
        targets.forEach { tabManager.discard(it.id) }
        mutate { s -> s.copy(tabs = s.tabs - targets.toSet(), selectedTabId = null) }
        if (clearData) clearBrowsingData()
        if (tabs.isEmpty()) newTab() else select(tabs.last().id)
        haptic()
    }

    /** Ferme automatiquement, au lancement, les onglets non consultés depuis le délai choisi. */
    private fun autoCloseOldTabs() {
        val days = settings.autoCloseTabs.days
        if (days <= 0) return
        val cutoff = System.currentTimeMillis() - days * 86_400_000L
        _state.update { s -> s.copy(tabs = s.tabs.filter { it.lastVisited >= cutoff }).let { n -> if (n.tabs.none { it.id == n.selectedTabId }) n.copy(selectedTabId = n.tabs.lastOrNull()?.id) else n } }
    }

    fun newTabUrl(): String? = when (settings.newTabPage) {
        NewTabPage.START -> null
        NewTabPage.BLANK -> "about:blank"
        NewTabPage.SEARCH -> settings.searchEngine.home(settings.searchBaseUrl, settings.customSearchTemplate, settings.hideAiAnswers)
        NewTabPage.CUSTOM -> settings.newTabCustomUrl.trim().ifBlank { null }?.let { urlFromInput(it) }
    }

    // ----- Navigation -----
    fun navigate(text: String) {
        val tab = selectedTab ?: return
        if (text.isBlank()) return
        val url = urlFromInput(text)
        updateTab(tab.id) { it.copy(url = url, title = "", readingMinutes = 0, themeColor = null) }
        tabManager.load(url, tab.id)
        isEditingAddress.value = false
        barsHidden.value = false; barCollapsed.value = false
    }
    fun urlFromInput(raw: String): String {
        val t = raw.trim()
        if (Regex("^(https?|about|file)://.*|^about:.*").matches(t)) return t
        val looksLikeHost = !t.contains(' ') && t.contains('.') && !t.endsWith('.') && !t.startsWith('.')
        if (looksLikeHost) return (if (settings.upgradeToHttps) "https://" else "http://") + t
        return searchUrl(t)
    }
    fun searchUrl(query: String): String = settings.searchEngine.url(query, settings.searchBaseUrl, settings.customSearchTemplate, settings.hideAiAnswers)

    fun goHome(tab: BrowserTab) {
        val target = newTabUrl()
        if (target == null) updateTab(tab.id) { it.copy(url = null, title = "", readingMinutes = 0, themeColor = null) }
        else { updateTab(tab.id) { it.copy(url = target) }; tabManager.load(target, tab.id) }
    }

    /** Défilement de la page : réduit ou masque la barre selon le réglage. */
    fun onWebScroll(y: Int, oldY: Int) {
        if (isEditingAddress.value || showMenu.value) return
        val dy = y - oldY
        when (settings.scrollBehavior) {
            ScrollBehavior.FIXED -> Unit
            ScrollBehavior.SHRINK -> { if (dy > 10 && y > 160) barCollapsed.value = true else if (y < 24) barCollapsed.value = false }
            ScrollBehavior.HIDE -> { if (dy > 10 && y > 160) barsHidden.value = true else if (dy < -24 || y < 24) barsHidden.value = false }
        }
    }
    fun expandBar() { barsHidden.value = false; barCollapsed.value = false }

    fun perform(action: ToolbarAction) {
        val tab = selectedTab ?: return
        haptic()
        when (action) {
            ToolbarAction.BACK -> tabManager.goBack(tab.id)
            ToolbarAction.FORWARD -> tabManager.goForward(tab.id)
            ToolbarAction.RELOAD -> if (tabManager.navState.value[tab.id]?.loading == true) tabManager.stop(tab.id) else tabManager.reload(tab.id)
            ToolbarAction.STOP -> tabManager.stop(tab.id)
            ToolbarAction.TABS -> { tabManager.captureSnapshot(tab.id); showTabs.value = true }
            ToolbarAction.NEW_TAB -> newTab()
            ToolbarAction.NEW_PRIVATE_TAB -> newTab(isPrivate = true)
            ToolbarAction.REOPEN_TAB -> reopenClosedTab()
            ToolbarAction.CLOSE_TAB -> close(tab.id)
            ToolbarAction.CLOSE_ALL_TABS -> closeAllTabs()
            ToolbarAction.CLOSE_ALL_AND_CLEAR -> closeAllTabs(clearData = true)
            ToolbarAction.BOOKMARKS -> showBookmarks.value = true
            ToolbarAction.ADD_BOOKMARK -> toggleBookmark(tab)
            ToolbarAction.HISTORY -> showHistory.value = true
            ToolbarAction.SHARE -> shareRequest.value = tab.url
            ToolbarAction.COPY_LINK -> tab.url?.let { copyToClipboard(it) }
            ToolbarAction.FIND -> findRequest.update { it + 1 }
            ToolbarAction.SEARCH, ToolbarAction.ADDRESS -> { expandBar(); isEditingAddress.value = true }
            ToolbarAction.BLOCKER -> { toggleBlockerForSite(tab); tabManager.reload(tab.id) }
            ToolbarAction.DARKEN -> toggleDarken(tab)
            ToolbarAction.READER -> tabManager.toggleReader(tab.id)
            ToolbarAction.JAVASCRIPT -> { toggleJavaScript(tab); tabManager.applySettings(tab.id); tabManager.reload(tab.id) }
            ToolbarAction.DESKTOP_SITE -> { toggleDesktop(tab); tabManager.applySettings(tab.id); tabManager.reload(tab.id) }
            ToolbarAction.TRANSLATE -> tab.url?.takeIf { it.startsWith("http") }?.let {
                tabManager.load("https://translate.google.com/translate?sl=auto&tl=${settings.translateLanguage.code}&u=" + java.net.URLEncoder.encode(it, "UTF-8"), tab.id)
            }
            ToolbarAction.SCROLL_TOP -> tabManager.js(tab.id, "window.scrollTo({top:0,behavior:'smooth'})")
            ToolbarAction.SCROLL_BOTTOM -> tabManager.js(tab.id, "window.scrollTo({top:document.body.scrollHeight,behavior:'smooth'})")
            ToolbarAction.HOME -> goHome(tab)
            ToolbarAction.SETTINGS -> openSettings(SettingsPage.ROOT)
            ToolbarAction.CUSTOMIZE -> openSettings(SettingsPage.EDITOR, standalone = true)
            ToolbarAction.MENU -> showMenu.value = !showMenu.value
            ToolbarAction.SEPARATOR -> Unit
        }
    }

    fun openSettings(page: SettingsPage, standalone: Boolean = false) {
        settingsStack.value = if (page == SettingsPage.ROOT || standalone) listOf(page) else listOf(SettingsPage.ROOT, page)
        showSettings.value = true
    }

    // ----- Réglages par site -----
    fun hostOf(url: String?): String? = runCatching { URI(url ?: return null).host?.lowercase()?.removePrefix("www.") }.getOrNull()
    fun isJavaScriptEnabled(url: String?): Boolean { if (!settings.javascriptEnabled) return false; val h = hostOf(url) ?: return true; return h !in settings.javascriptDisabledHosts }
    fun toggleJavaScript(tab: BrowserTab) { val h = hostOf(tab.url) ?: return updateSettings { it.copy(javascriptEnabled = !it.javascriptEnabled) }; updateSettings { it.copy(javascriptDisabledHosts = it.javascriptDisabledHosts.toggle(h)) } }
    fun isDarkened(tab: BrowserTab): Boolean {
        val base = settings.darkenSites && (!settings.darkenOnlyInDarkMode || isAppDark())
        val h = hostOf(tab.url) ?: return base
        return base != (h in settings.darkenHosts)
    }
    fun toggleDarken(tab: BrowserTab) {
        val h = hostOf(tab.url)
        if (h == null) updateSettings { it.copy(darkenSites = !it.darkenSites) } else updateSettings { it.copy(darkenHosts = it.darkenHosts.toggle(h)) }
        tabManager.applyDarken(tab.id, isDarkened(tab))
    }
    fun isDesktop(tab: BrowserTab): Boolean = settings.desktopByDefault != (hostOf(tab.url)?.let { it in settings.desktopHosts } ?: false)
    fun toggleDesktop(tab: BrowserTab) { val h = hostOf(tab.url) ?: return; updateSettings { it.copy(desktopHosts = it.desktopHosts.toggle(h)) } }
    /** Le bloqueur agit-il sur cette page ? (au moins une famille activée et site non exclu). Appelé aussi depuis le fil réseau. */
    fun isBlockerActive(pageHost: String?): Boolean {
        val s = settings
        if (!s.blockAds && !s.blockTrackers && !s.blockCookieBanners) return false
        val h = pageHost?.lowercase()?.removePrefix("www.") ?: return true
        return h !in s.blockerDisabledHosts
    }
    fun toggleBlockerForSite(tab: BrowserTab) {
        val h = hostOf(tab.url) ?: return
        if (!settings.blockAds && !settings.blockTrackers && !settings.blockCookieBanners) { updateSettings { it.copy(blockAds = true, blockTrackers = true) }; return }
        updateSettings { it.copy(blockerDisabledHosts = it.blockerDisabledHosts.toggle(h)) }
    }
    private fun Set<String>.toggle(v: String) = if (v in this) this - v else this + v

    // ----- Favoris & historique -----
    fun isBookmarked(tab: BrowserTab) = tab.url != null && _state.value.bookmarks.any { it.url == tab.url }
    fun toggleBookmark(tab: BrowserTab) {
        val u = tab.url ?: return
        val adding = _state.value.bookmarks.none { it.url == u }
        mutate { s -> if (!adding) s.copy(bookmarks = s.bookmarks.filterNot { it.url == u }) else s.copy(bookmarks = listOf(Bookmark(title = tab.displayTitle, url = u)) + s.bookmarks) }
        toast(if (adding) "Ajouté aux favoris" else "Retiré des favoris")
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

    /** Efface l'historique, les cookies, le stockage des sites, le cache et les favicons. */
    fun clearBrowsingData() {
        clearHistory()
        CookieManager.getInstance().removeAllCookies(null)
        WebStorage.getInstance().deleteAllData()
        tabManager.clearCaches()
        tabManager.favicons.clear()
        toast("Historique et données de sites effacés")
    }

    // ----- Utilitaires -----
    fun copyToClipboard(text: String) {
        val app = getApplication<Application>()
        app.getSystemService(ClipboardManager::class.java)?.setPrimaryClip(ClipData.newPlainText("Adresse", text))
        if (Build.VERSION.SDK_INT < 33) toast("Adresse copiée")
    }
    fun toast(message: String) = Toast.makeText(getApplication(), message, Toast.LENGTH_SHORT).show()

    fun haptic() {
        if (!settings.haptics) return
        val app = getApplication<Application>()
        val v = if (Build.VERSION.SDK_INT >= 31) (app.getSystemService(VibratorManager::class.java))?.defaultVibrator else @Suppress("DEPRECATION") app.getSystemService(Vibrator::class.java)
        val effect = if (Build.VERSION.SDK_INT >= 29) VibrationEffect.createPredefined(VibrationEffect.EFFECT_TICK) else VibrationEffect.createOneShot(10, 60)
        runCatching { v?.vibrate(effect) }
    }

    /** Icône alternative : un seul activity-alias de lancement activé à la fois. */
    private fun applyAppIcon(icon: AppIcon) {
        val app = getApplication<Application>()
        val pm = app.packageManager
        AppIcon.entries.forEach { i ->
            val state = if (i == icon) PackageManager.COMPONENT_ENABLED_STATE_ENABLED else PackageManager.COMPONENT_ENABLED_STATE_DISABLED
            runCatching { pm.setComponentEnabledSetting(ComponentName(app.packageName, i.alias), state, PackageManager.DONT_KILL_APP) }
        }
    }

    fun applyPreset(p: ToolbarConfig.Preset) {
        val cfg = ToolbarConfig.preset(p)
        updateSettings { s -> s.copy(toolbar = cfg.copy(style = s.toolbar.style, position = s.toolbar.position), menuIcon = p.menuIcon ?: s.menuIcon) }
        haptic()
    }

    fun handleIntent(intent: Intent?) {
        intent ?: return
        when (intent.action) {
            Intent.ACTION_VIEW -> intent.dataString?.let { newTab(url = it) }
            Intent.ACTION_WEB_SEARCH -> intent.getStringExtra("query")?.let { newTab(url = urlFromInput(it)) }
            Intent.ACTION_SEND -> intent.getStringExtra(Intent.EXTRA_TEXT)?.let { newTab(url = urlFromInput(it)) }
        }
    }

    // ----- Mode démo (captures d'écran des stores) : extra « demo » = page|menu|tabs|editor|settings|gallery -----
    fun applyDemo(screen: String) {
        isEditingAddress.value = false
        tabs.forEach { tabManager.discard(it.id) }
        val now = System.currentTimeMillis()
        val demo = listOf(
            Triple("https://fr.wikipedia.org/wiki/Tour_Eiffel", "Tour Eiffel — Wikipédia", 24),
            Triple("https://fr.wikipedia.org/wiki/Gustave_Eiffel", "Gustave Eiffel — Wikipédia", 15),
            Triple("https://fr.wikipedia.org/wiki/Paris", "Paris — Wikipédia", 41),
            Triple("https://www.marmiton.org/recettes/recette_pate-a-crepes_12372.aspx", "La meilleure recette de pâte à crêpes - Marmiton", 4),
            Triple("https://www.marmiton.org/recettes/recette_gateau-au-chocolat-fondant-rapide_166352.aspx", "Gâteau au chocolat fondant rapide - Marmiton", 3),
            Triple("https://github.com/Fefe-Kurylen/jeu-final", "Fefe-Kurylen/jeu-final - GitHub", 2),
            Triple("https://www.openstreetmap.org", "OpenStreetMap", 1),
        )
        val list = demo.mapIndexed { i, (u, t, m) -> BrowserTab(url = u, title = t, readingMinutes = m, lastVisited = now - i * 60_000L) }
        val bookmarks = listOf(
            Bookmark(title = "Wikipédia", url = "https://fr.wikipedia.org/"), Bookmark(title = "Marmiton", url = "https://www.marmiton.org/"),
            Bookmark(title = "OpenStreetMap", url = "https://www.openstreetmap.org/"), Bookmark(title = "GitHub", url = "https://github.com/"),
        )
        mutate {
            it.copy(tabs = list, selectedTabId = list.first().id, bookmarks = it.bookmarks.ifEmpty { bookmarks }, settings = it.settings.copy(
                toolbar = ToolbarConfig.preset(ToolbarConfig.Preset.COMPLETE), addressStyle = AddressStyle.CARD, addressShowsFavicon = true, addressShowsReadingTime = true,
                menuIcon = MenuIconStyle.DOTS, iconWeight = IconWeight.REGULAR, scrollBehavior = ScrollBehavior.SHRINK,
                tabsLayout = TabsLayout.LIST, tabsSort = TabsSort.DATE, groupTabsByDomain = true, comfortMode = false, appearance = Appearance.SYSTEM,
            ))
        }
        list.forEach { tabManager.favicons.request(it.url, persist = true) }
        viewModelScope.launch {
            delay(7000)
            when (screen) {
                "menu" -> showMenu.value = true
                "tabs" -> { selectedTab?.let { tabManager.captureSnapshot(it.id) }; showTabs.value = true }
                "editor" -> openSettings(SettingsPage.EDITOR, standalone = true)
                "settings" -> openSettings(SettingsPage.ROOT)
                "gallery" -> openSettings(SettingsPage.GALLERY, standalone = true)
            }
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
