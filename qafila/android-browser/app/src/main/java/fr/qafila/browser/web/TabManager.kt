package fr.qafila.browser.web

import android.annotation.SuppressLint
import android.content.Context
import android.graphics.Bitmap
import android.graphics.Canvas
import android.os.Build
import android.webkit.CookieManager
import android.webkit.JavascriptInterface
import android.webkit.WebChromeClient
import android.webkit.WebResourceError
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.FrameLayout
import fr.qafila.browser.data.BrowserStore
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.update
import java.io.ByteArrayInputStream

/** Une WebView par onglet, conservée en mémoire : changer d'onglet ne recharge rien (sauf onglet mis en veille). */
class TabManager(private val context: Context, private val store: BrowserStore, scope: CoroutineScope) {
    data class NavState(val canBack: Boolean = false, val canForward: Boolean = false, val loading: Boolean = false, val progress: Float = 0f)

    val navState = MutableStateFlow<Map<String, NavState>>(emptyMap())
    val favicons = Favicons(context, scope)
    /** Vignettes des onglets (grille), réduites, conservées même quand la WebView est mise en veille. */
    val snapshots = MutableStateFlow<Map<String, Bitmap>>(emptyMap())
    val readerActive = MutableStateFlow<Set<String>>(emptySet())
    private val views = HashMap<String, WebView>()

    private val isDark: Boolean get() = store.isAppDark()

    fun hasView(id: String) = views.containsKey(id)

    @SuppressLint("SetJavaScriptEnabled")
    fun webView(id: String, initialUrl: String? = null): WebView {
        views[id]?.let { return it }
        val tab = store.tabs.first { it.id == id }
        val web = WebView(context)
        web.layoutParams = FrameLayout.LayoutParams(FrameLayout.LayoutParams.MATCH_PARENT, FrameLayout.LayoutParams.MATCH_PARENT)
        with(web.settings) {
            javaScriptEnabled = true
            domStorageEnabled = true
            mediaPlaybackRequiresUserGesture = false
            loadWithOverviewMode = true
            useWideViewPort = true
            builtInZoomControls = true
            displayZoomControls = false
            cacheMode = if (tab.isPrivate) WebSettings.LOAD_NO_CACHE else WebSettings.LOAD_DEFAULT
            if (Build.VERSION.SDK_INT >= 33) isAlgorithmicDarkeningAllowed = false
        }
        if (tab.isPrivate) CookieManager.getInstance().setAcceptThirdPartyCookies(web, false)
        val client = Client(id).also { it.pageHost = store.hostOf(tab.url) }
        web.addJavascriptInterface(Bridge(id), "Qafila")
        web.webViewClient = client
        web.webChromeClient = Chrome(id)
        web.setBackgroundColor(if (isDark) android.graphics.Color.BLACK else android.graphics.Color.WHITE)
        views[id] = web
        applySettings(id)
        (initialUrl ?: tab.url)?.let { web.loadUrl(it) }
        return web
    }

    /** Ferme définitivement l'onglet. */
    fun discard(id: String) {
        views.remove(id)?.apply { (parent as? android.view.ViewGroup)?.removeView(this); destroy() }
        navState.update { it - id }; snapshots.update { it - id }; readerActive.update { it - id }
    }

    /** Met l'onglet en veille : la WebView est détruite, l'onglet (adresse, titre, vignette) est conservé et rechargé à la demande. */
    fun suspend(id: String) {
        views.remove(id)?.apply { (parent as? android.view.ViewGroup)?.removeView(this); destroy() }
        navState.update { it - id }; readerActive.update { it - id }
    }

    /** Onglet affiché : les autres WebView sont mises en pause (animations, géolocalisation…). */
    fun onSelected(id: String) { views.forEach { (k, v) -> if (k == id) v.onResume() else v.onPause() } }

    fun load(url: String?, id: String) {
        if (url == null) return
        val existed = views.containsKey(id)
        val w = webView(id, initialUrl = url)
        readerActive.update { it - id }
        if (existed) w.loadUrl(url)
    }
    fun goBack(id: String) = views[id]?.let { if (it.canGoBack()) it.goBack() }
    fun goForward(id: String) = views[id]?.let { if (it.canGoForward()) it.goForward() }
    fun reload(id: String) = views[id]?.reload()
    fun stop(id: String) = views[id]?.stopLoading()
    fun js(id: String, script: String) = views[id]?.evaluateJavascript(script, null)
    fun find(id: String, text: String) = views[id]?.findAllAsync(text)
    fun findNext(id: String, forward: Boolean) = views[id]?.findNext(forward)
    fun clearFind(id: String) = views[id]?.clearMatches()
    fun clearCaches() { views.values.firstOrNull()?.clearCache(true) ?: WebView(context).apply { clearCache(true); destroy() } }

    fun applySettings(id: String) {
        val web = views[id] ?: return
        val tab = store.tabs.firstOrNull { it.id == id } ?: return
        val s = store.settings
        web.settings.javaScriptEnabled = store.isJavaScriptEnabled(tab.url)
        web.settings.userAgentString = when {
            s.customUserAgent.isNotBlank() -> s.customUserAgent
            store.isDesktop(tab) -> DESKTOP_UA
            else -> null
        }
        web.settings.textZoom = s.textZoom.coerceIn(50, 200)
    }
    fun applySettingsToAll() = views.keys.toList().forEach { applySettings(it) }

    fun applyDarken(id: String, on: Boolean) = js(id, Scripts.injectCss("qafila-darken", Scripts.darkenCss, on))
    fun refreshDarken() = store.tabs.forEach { t -> if (views.containsKey(t.id)) applyDarken(t.id, store.isDarkened(t)) }

    fun toggleReader(id: String) {
        val web = views[id] ?: return
        if (id in readerActive.value) { web.goBack(); readerActive.update { it - id }; return }
        web.evaluateJavascript(Scripts.reader, null)
    }

    /** Capture une vignette réduite de l'onglet (pour la grille). */
    fun captureSnapshot(id: String) {
        val w = views[id] ?: return
        if (w.width == 0 || w.height == 0 || w.parent == null) return
        runCatching {
            val scale = 0.4f
            val b = Bitmap.createBitmap((w.width * scale).toInt().coerceAtLeast(1), (w.height * scale).toInt().coerceAtLeast(1), Bitmap.Config.RGB_565)
            val c = Canvas(b); c.scale(scale, scale); c.translate(-w.scrollX.toFloat(), -w.scrollY.toFloat()); w.draw(c)
            snapshots.update { it + (id to b) }
        }
    }

    fun destroyAll() { views.values.forEach { it.destroy() }; views.clear() }

    private fun parseCssColor(c: String): String? {
        val n = Regex("[0-9.]+").findAll(c).map { it.value.toFloat() }.toList()
        if (n.size < 3) return null
        if (n.size >= 4 && n[3] < 0.5f) return null
        return String.format(java.util.Locale.ROOT, "#%02X%02X%02X",n[0].toInt().coerceIn(0, 255), n[1].toInt().coerceIn(0, 255), n[2].toInt().coerceIn(0, 255))
    }

    // ----- Pont JavaScript → app -----
    private inner class Bridge(val id: String) {
        @JavascriptInterface fun pageInfo(minutes: Int, color: String) {
            val hex = parseCssColor(color)
            views[id]?.post { store.updateTab(id) { it.copy(readingMinutes = minutes, themeColor = hex) } }
        }
        @JavascriptInterface fun reader(title: String, byline: String, html: String, host: String, url: String) {
            views[id]?.post {
                views[id]?.loadDataWithBaseURL(url, Scripts.readerPage(title, byline, html, host, isDark), "text/html", "utf-8", url)
                readerActive.update { it + id }
            }
        }
    }

    private fun injectPageCss(view: WebView, host: String?) {
        val s = store.settings
        val active = store.isBlockerActive(host)
        view.evaluateJavascript(Scripts.injectCss("qafila-cookies", ContentBlocker.cookieCss, active && s.blockCookieBanners), null)
        view.evaluateJavascript(Scripts.injectCss("qafila-ads", ContentBlocker.adCss, active && s.blockAds), null)
    }

    // ----- Clients WebView -----
    private inner class Client(val id: String) : WebViewClient() {
        /** Hôte de la page principale (lu depuis le fil réseau pour les exceptions du bloqueur). */
        @Volatile var pageHost: String? = null

        override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest): Boolean {
            val url = request.url
            val scheme = url.scheme ?: return false
            if (scheme !in listOf("http", "https", "about", "file", "data", "blob")) {
                runCatching { context.startActivity(android.content.Intent(android.content.Intent.ACTION_VIEW, url).addFlags(android.content.Intent.FLAG_ACTIVITY_NEW_TASK)) }
                return true
            }
            if (store.settings.upgradeToHttps && scheme == "http" && request.isForMainFrame) { view.loadUrl(url.buildUpon().scheme("https").build().toString()); return true }
            if (request.isForMainFrame) pageHost = url.host
            return false
        }

        override fun shouldInterceptRequest(view: WebView, request: WebResourceRequest): WebResourceResponse? {
            if (request.isForMainFrame) { pageHost = request.url.host; return null }
            val s = store.settings
            if (!store.isBlockerActive(pageHost)) return null
            if (ContentBlocker.isBlocked(request.url.host, s.blockAds, s.blockTrackers, s.blockCookieBanners)) {
                return WebResourceResponse("text/plain", "utf-8", 204, "Blocked by Qafila", emptyMap(), ByteArrayInputStream(ByteArray(0)))
            }
            return null
        }

        override fun onPageStarted(view: WebView, url: String?, favicon: Bitmap?) {
            navState.update { it + (id to (it[id] ?: NavState()).copy(loading = true, progress = 0.05f, canBack = view.canGoBack(), canForward = view.canGoForward())) }
            if (url != null && url.startsWith("http")) {
                pageHost = android.net.Uri.parse(url).host
                store.updateTab(id) {
                    val sameHost = store.hostOf(it.url) == store.hostOf(url)
                    it.copy(url = url, lastVisited = System.currentTimeMillis(), readingMinutes = if (url == it.url) it.readingMinutes else 0, themeColor = if (sameHost) it.themeColor else null)
                }
            }
            injectPageCss(view, pageHost)
        }

        override fun onPageFinished(view: WebView, url: String?) {
            navState.update { it + (id to (it[id] ?: NavState()).copy(loading = false, progress = 1f, canBack = view.canGoBack(), canForward = view.canGoForward())) }
            store.updateTab(id) { it.copy(title = view.title?.takeUnless { t -> t.startsWith("http") || t.startsWith("about:") } ?: it.title) }
            view.evaluateJavascript(Scripts.pageInfo, null)
            injectPageCss(view, pageHost)
            store.tabs.firstOrNull { it.id == id }?.let { tab ->
                store.recordVisit(tab)
                if (store.isDarkened(tab)) applyDarken(id, true)
                favicons.request(tab.url, persist = !tab.isPrivate)
            }
        }

        override fun doUpdateVisitedHistory(view: WebView, url: String?, isReload: Boolean) {
            if (url != null && url.startsWith("http")) store.updateTab(id) { it.copy(url = url) }
            navState.update { it + (id to (it[id] ?: NavState()).copy(canBack = view.canGoBack(), canForward = view.canGoForward())) }
            if (!isReload) readerActive.update { it - id }
        }

        override fun onReceivedError(view: WebView, request: WebResourceRequest, error: WebResourceError) {
            if (request.isForMainFrame) view.loadDataWithBaseURL(null, Scripts.errorPage(error.description.toString(), request.url.toString()), "text/html", "utf-8", null)
        }
    }

    private inner class Chrome(val id: String) : WebChromeClient() {
        override fun onProgressChanged(view: WebView, newProgress: Int) { navState.update { it + (id to (it[id] ?: NavState()).copy(progress = newProgress / 100f, loading = newProgress < 100)) } }
        override fun onReceivedTitle(view: WebView, title: String?) {
            if (title.isNullOrBlank() || title.startsWith("http") || title.startsWith("about:")) return
            store.updateTab(id) { it.copy(title = title) }
        }
        override fun onReceivedIcon(view: WebView, icon: Bitmap?) {
            val tab = store.tabs.firstOrNull { it.id == id } ?: return
            if (icon != null) favicons.put(view.url ?: tab.url, icon, persist = !tab.isPrivate)
        }
        override fun onCreateWindow(view: WebView, isDialog: Boolean, isUserGesture: Boolean, resultMsg: android.os.Message?): Boolean {
            // target=_blank : on récupère l'URL via une WebView temporaire puis on ouvre un nouvel onglet.
            val temp = WebView(context)
            temp.webViewClient = object : WebViewClient() {
                override fun shouldOverrideUrlLoading(v: WebView, r: WebResourceRequest): Boolean { store.newTab(url = r.url.toString(), isPrivate = store.selectedTab?.isPrivate ?: false); temp.destroy(); return true }
            }
            (resultMsg?.obj as? WebView.WebViewTransport)?.webView = temp
            resultMsg?.sendToTarget()
            return true
        }
    }

    companion object {
        const val DESKTOP_UA = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36"
    }
}
