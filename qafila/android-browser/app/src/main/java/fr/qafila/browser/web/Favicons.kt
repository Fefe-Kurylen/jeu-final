package fr.qafila.browser.web

import android.content.Context
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import java.io.File
import java.net.HttpURLConnection
import java.net.URI
import java.net.URL

/**
 * Favicons par domaine (sans « www. »). Sources : la WebView (onReceivedIcon) et, pour les onglets pas encore chargés,
 * le site lui-même (/apple-touch-icon.png puis /favicon.ico) — aucun service tiers. Cache disque hors onglets privés.
 */
class Favicons(context: Context, private val scope: CoroutineScope) {
    val icons = MutableStateFlow<Map<String, Bitmap>>(emptyMap())
    private val dir = File(context.cacheDir, "favicons").apply { mkdirs() }
    private val requested = HashSet<String>()

    fun keyOf(url: String?): String? = runCatching { URI(url ?: return null).host?.lowercase()?.removePrefix("www.") }.getOrNull()

    fun put(url: String?, bitmap: Bitmap, persist: Boolean) {
        val key = keyOf(url) ?: return
        val old = icons.value[key]
        if (old != null && old.width >= bitmap.width) return
        icons.update { it + (key to bitmap) }
        if (persist) scope.launch(Dispatchers.IO) { runCatching { File(dir, "$key.png").outputStream().use { bitmap.compress(Bitmap.CompressFormat.PNG, 100, it) } } }
    }

    /** Charge le favicon d'une adresse si on ne l'a pas encore (disque, puis réseau). */
    fun request(url: String?, persist: Boolean) {
        val key = keyOf(url) ?: return
        if (!url!!.startsWith("http")) return
        if (icons.value.containsKey(key) || !requested.add(key)) return
        scope.launch(Dispatchers.IO) {
            val cached = File(dir, "$key.png")
            val bmp = if (cached.exists()) runCatching { BitmapFactory.decodeFile(cached.path) }.getOrNull() else null
            if (bmp != null) { icons.update { if (it.containsKey(key)) it else it + (key to bmp) }; return@launch }
            val origin = runCatching { URI(url).let { "${it.scheme}://${it.host}" } }.getOrNull() ?: return@launch
            val fetched = listOf("/apple-touch-icon.png", "/favicon.ico").firstNotNullOfOrNull { fetch(origin + it) } ?: return@launch
            put(url, fetched, persist)
        }
    }

    private fun fetch(address: String): Bitmap? = runCatching {
        val c = URL(address).openConnection() as HttpURLConnection
        c.connectTimeout = 5000; c.readTimeout = 5000; c.instanceFollowRedirects = true
        c.setRequestProperty("User-Agent", "Mozilla/5.0 (Linux; Android) Qafila")
        try {
            if (c.responseCode !in 200..299) return null
            val raw = c.inputStream.use { BitmapFactory.decodeStream(it) } ?: return null
            if (raw.width < 8) return null
            val max = 96
            if (raw.width > max) Bitmap.createScaledBitmap(raw, max, raw.height * max / raw.width, true) else raw
        } finally { c.disconnect() }
    }.getOrNull()

    fun clear() { icons.value = emptyMap(); requested.clear(); dir.listFiles()?.forEach { it.delete() } }
}
