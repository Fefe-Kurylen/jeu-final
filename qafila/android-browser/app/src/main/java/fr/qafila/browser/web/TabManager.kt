package fr.qafila.browser.web

import android.annotation.SuppressLint
import android.content.Context
import android.content.res.Configuration
import android.graphics.Bitmap
import android.graphics.Color
import android.net.Uri
import android.os.Build
import android.util.Base64
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
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.update
import java.io.ByteArrayInputStream

/** Une WebView par onglet, conservée en mémoire : changer d'onglet ne recharge rien. */
class TabManager(private val context: Context, private val store: BrowserStore) {
    data class NavState(val canBack: Boolean = false, val canForward: Boolean = false, val loading: Boolean = false, val progress: Float = 0f)

    val navState = MutableStateFlow<Map<String, NavState>>(emptyMap())
    val favicons = MutableStateFlow<Map<String, Bitmap>>(emptyMap())
    val readerActive = MutableStateFlow<Set<String>>(emptySet())
    private val views = HashMap<String, WebView>()

    private val isDark: Boolean get() = (context.resources.configuration.uiMode and Configuration.UI_MODE_NIGHT_MASK) == Configuration.UI_MODE_NIGHT_YES

    @SuppressLint("SetJavaScriptEnabled")
    fun webView(id: String): WebView {
        views[id]?.let { return it }
        val tab = store.tabs.first { it.id == id }
        val web = WebView(context)
        web.layoutParams = FrameLayout.LayoutParams(FrameLayout.LayoutParams.MATCH_PARENT, FrameLayout.LayoutParams.MATCH_PARENT)
        with(web.settings) {
            javaScriptEnabled = true
            domStorageEnabled = true
            databaseEnabled = true
            mediaPlaybackRequiresUserGesture = false
            loadWithOverviewMode = true
            useWideViewPort = true
            builtInZoomControls = true
            displayZoomControls = false
            cacheMode = if (tab.isPrivate) WebSettings.LOAD_NO_CACHE else WebSettings.LOAD_DEFAULT
            if (Build.VERSION.SDK_INT >= 33) isAlgorithmicDarkeningAllowed = false
        }
        if (tab.isPrivate) { CookieManager.getInstance().setAcceptThirdPartyCookies(web, false) }
        web.addJavascriptInterface(Bridge(id), "Qafila")
        web.webViewClient = Client(id)
        web.webChromeClient = Chrome(id)
        web.setBackgroundColor(if (isDark) Color.parseColor("#17191C") else Color.WHITE)
        views[id] = web
        applySettings(id)
        if (tab.url != null) web.loadUrl(tab.url) else loadStart(web)
        return web
    }

    fun discard(id: String) { views.remove(id)?.apply { (parent as? android.view.ViewGroup)?.removeView(this); destroy() }; navState.update { it - id }; favicons.update { it - id }; readerActive.update { it - id } }

    fun load(url: String?, id: String) { val w = webView(id); readerActive.update { it - id }; if (url != null) w.loadUrl(url) else loadStart(w) }
    private fun loadStart(w: WebView) = w.loadDataWithBaseURL("about:start", Scripts.startPage(isDark), "text/html", "utf-8", null)
    fun goBack(id: String) = views[id]?.let { if (it.canGoBack()) it.goBack() }
    fun goForward(id: String) = views[id]?.let { if (it.canGoForward()) it.goForward() }
    fun reload(id: String) = views[id]?.reload()
    fun stop(id: String) = views[id]?.stopLoading()
    fun js(id: String, script: String) = views[id]?.evaluateJavascript(script, null)
    fun find(id: String, text: String) = views[id]?.findAllAsync(text)
    fun findNext(id: String, forward: Boolean) = views[id]?.findNext(forward)
    fun clearFind(id: String) = views[id]?.clearMatches()

    fun applySettings(id: String) {
        val web = views[id] ?: return
        val tab = store.tabs.firstOrNull { it.id == id } ?: return
        val s = store.settings
        web.settings.javaScriptEnabled = store.isJavaScriptEnabled(tab.url)
        web.settings.userAgentString = when {
            s.customUserAgent.isNotBlank() -> s.customUserAgent
            store.isDesktop(tab) -> "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36"
            else -> null
        }
        web.settings.useWideViewPort = true
    }

    fun applyDarken(id: String, on: Boolean) = js(id, Scripts.injectCss("qafila-darken", Scripts.darkenCss, on))

    fun toggleReader(id: String) {
        val web = views[id] ?: return
        if (id in readerActive.value) { web.goBack(); readerActive.update { it - id }; return }
        web.evaluateJavascript(Scripts.reader, null)
    }

    fun snapshot(id: String): Bitmap? = views[id]?.let { w ->
        if (w.width == 0 || w.height == 0) return null
        val b = Bitmap.createBitmap(w.width, w.height, Bitmap.Config.RGB_565); w.draw(android.graphics.Canvas(b)); b
    }

    fun destroyAll() { views.values.forEach { it.destroy() }; views.clear() }

    // ----- Pont JavaScript → app -----
    private inner class Bridge(val id: String) {
        @JavascriptInterface fun pageInfo(minutes: Int, color: String) {
            views[id]?.post {
                store.updateTab(id) { it.copy(readingMinutes = minutes, themeColor = color.ifBlank { it.themeColor }) }
                if (store.settings.adaptToSiteColor && store.selectedTab?.id == id && color.isNotBlank()) store.siteThemeColor.value = runCatching { Color.parseColor(color).toLong() and 0xFFFFFFFFL }.getOrNull()
            }
        }
        @JavascriptInterface fun reader(title: String, byline: String, html: String, host: String, url: String) {
            views[id]?.post { w ->
                w.loadDataWithBaseURL(url, Scripts.readerPage(title, byline, html, host, isDark), "text/html", "utf-8", url)
                readerActive.update { it + id }
            }
        }
    }

    private fun WebView.post(block: (WebView) -> Unit) { post { block(this) } }

    // ----- Clients WebView -----
    private inner class Client(val id: String) : WebViewClient() {
        override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest): Boolean {
            val url = request.url
            val scheme = url.scheme ?: return false
            if (scheme !in listOf("http", "https", "about", "file", "data", "blob")) {
                runCatching { context.startActivity(android.content.Intent(android.content.Intent.ACTION_VIEW, url).addFlags(android.content.Intent.FLAG_ACTIVITY_NEW_TASK)) }
                return true
            }
            if (store.settings.upgradeToHttps && scheme == "http" && request.isForMainFrame) { view.loadUrl(url.buildUpon().scheme("https").build().toString()); return true }
            return false
        }

        override fun shouldInterceptRequest(view: WebView, request: WebResourceRequest): WebResourceResponse? {
            if (!store.settings.blockerEnabled) return null
            val host = request.url.host
            if (ContentBlocker.isBlocked(host) && !request.isForMainFrame) {
                return WebResourceResponse("text/plain", "utf-8", 204, "Blocked by Qafila", emptyMap(), ByteArrayInputStream(ByteArray(0)))
            }
            return null
        }

        override fun onPageStarted(view: WebView, url: String?, favicon: Bitmap?) {
            navState.update { it + (id to (it[id] ?: NavState()).copy(loading = true, progress = 0f, canBack = view.canGoBack(), canForward = view.canGoForward())) }
            if (url != null && !url.startsWith("about:")) store.updateTab(id) { it.copy(url = url, lastVisited = System.currentTimeMillis()) }
            if (store.settings.blockerEnabled && store.settings.blockCookieBanners) view.evaluateJavascript(Scripts.injectCss("qafila-cookies", ContentBlocker.cookieCss, true), null)
        }

        override fun onPageFinished(view: WebView, url: String?) {
            navState.update { it + (it[id] ?: NavState()).copy(loading = false, progress = 1f, canBack = view.canGoBack(), canForward = view.canGoForward()).let { s -> id to s } }
            store.updateTab(id) { it.copy(title = view.title ?: it.title) }
            view.evaluateJavascript(Scripts.pageInfo, null)
            if (store.settings.blockerEnabled && store.settings.blockCookieBanners) view.evaluateJavascript(Scripts.injectCss("qafila-cookies", ContentBlocker.cookieCss, true), null)
            store.tabs.firstOrNull { it.id == id }?.let { tab -> store.recordVisit(tab); if (store.isDarkened(tab)) applyDarken(id, true) }
        }

        override fun doUpdateVisitedHistory(view: WebView, url: String?, isReload: Boolean) {
            if (url != null && !url.startsWith("about:")) store.updateTab(id) { it.copy(url = url) }
            if (!isReload) readerActive.update { it - id }
        }

        override fun onReceivedError(view: WebView, request: WebResourceRequest, error: WebResourceError) {
            if (request.isForMainFrame) view.loadDataWithBaseURL(null, Scripts.errorPage(error.description.toString(), request.url.toString()), "text/html", "utf-8", null)
        }
    }

    private inner class Chrome(val id: String) : WebChromeClient() {
        override fun onProgressChanged(view: WebView, newProgress: Int) { navState.update { it + (id to (it[id] ?: NavState()).copy(progress = newProgress / 100f, loading = newProgress < 100)) } }
        override fun onReceivedTitle(view: WebView, title: String?) { store.updateTab(id) { it.copy(title = title ?: "") } }
        override fun onReceivedIcon(view: WebView, icon: Bitmap?) { if (icon != null) favicons.update { it + (id to icon) } }
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
}
