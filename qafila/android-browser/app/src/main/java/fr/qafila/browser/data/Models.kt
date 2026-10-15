package fr.qafila.browser.data

import kotlinx.serialization.Serializable
import java.util.UUID

/** Un onglet : état persistant ; la WebView vit dans TabManager. */
@Serializable
data class BrowserTab(
    val id: String = UUID.randomUUID().toString(),
    val url: String? = null,
    val title: String = "",
    val isPrivate: Boolean = false,
    val createdAt: Long = System.currentTimeMillis(),
    val lastVisited: Long = System.currentTimeMillis(),
    val readingMinutes: Int = 0,
    val themeColor: String? = null,
) {
    val host: String get() = runCatching { java.net.URI(url ?: return "Nouvel onglet").host?.removePrefix("www.") }.getOrNull() ?: "Nouvel onglet"
    val displayTitle: String get() = title.ifBlank { url ?: "Nouvel onglet" }
    val readingLabel: String? get() = if (readingMinutes > 0) "$readingMinutes min" else null
}

@Serializable data class Bookmark(val id: String = UUID.randomUUID().toString(), val title: String, val url: String, val addedAt: Long = System.currentTimeMillis())
@Serializable data class HistoryEntry(val id: String = UUID.randomUUID().toString(), val title: String, val url: String, val visitedAt: Long = System.currentTimeMillis())

/** Toutes les actions disponibles pour la barre et le menu (chaque bouton peut être placé où l'on veut). */
@Serializable
enum class ToolbarAction(val label: String, val destructive: Boolean = false) {
    BACK("Précédent"), FORWARD("Suivant"), RELOAD("Recharger"), STOP("Arrêter"),
    TABS("Onglets"), NEW_TAB("Nouvel onglet"), NEW_PRIVATE_TAB("Onglet privé"), CLOSE_TAB("Fermer l'onglet", true), CLOSE_ALL_TABS("Tout fermer", true),
    BOOKMARKS("Favoris"), ADD_BOOKMARK("Ajouter aux favoris"), HISTORY("Historique"), SHARE("Partager"), FIND("Rechercher dans la page"),
    BLOCKER("Bloqueur"), DARKEN("Assombrir"), READER("Lecteur"), JAVASCRIPT("JavaScript"), DESKTOP_SITE("Site bureau"), TRANSLATE("Traduire"),
    SCROLL_TOP("Haut de page"), SCROLL_BOTTOM("Bas de page"), HOME("Accueil"), SETTINGS("Réglages"), CUSTOMIZE("Personnaliser"), MENU("Menu"),
    SEPARATOR("Séparateur");
}

@Serializable enum class ButtonSize(val label: String, val dp: Int) { SMALL("Petit", 20), MEDIUM("Moyen", 24), LARGE("Grand", 28) }

@Serializable
data class ToolbarSlot(val id: String = UUID.randomUUID().toString(), val action: ToolbarAction, val size: ButtonSize = ButtonSize.MEDIUM, val showsLabel: Boolean = true)

@Serializable enum class ToolbarStyle(val label: String) { CLASSIC("Classique"), GLASS("Verre") }
@Serializable enum class ToolbarPosition(val label: String) { BOTTOM("En bas"), TOP("En haut") }

@Serializable
data class ToolbarConfig(val bar: List<ToolbarSlot>, val menu: List<ToolbarSlot>, val style: ToolbarStyle = ToolbarStyle.CLASSIC, val position: ToolbarPosition = ToolbarPosition.BOTTOM) {
    enum class Preset(val label: String, val description: String) {
        COMPLETE("Complète", "Tous les boutons classiques à portée de pouce."),
        MINIMAL("Minimaliste", "Deux boutons seulement : onglets et menu. Navigation par gestes."),
        GESTURES("Gestes", "Lecteur et JavaScript en accès direct, sans Précédent/Suivant."),
        READING("Lecture", "Pensée pour les longs articles : lecteur, assombrir, haut de page."),
    }
    companion object {
        private fun s(a: ToolbarAction, size: ButtonSize = ButtonSize.MEDIUM, label: Boolean = true) = ToolbarSlot(action = a, size = size, showsLabel = label)
        fun preset(p: Preset): ToolbarConfig = when (p) {
            Preset.COMPLETE -> ToolbarConfig(
                bar = listOf(s(ToolbarAction.BACK), s(ToolbarAction.FORWARD), s(ToolbarAction.SHARE), s(ToolbarAction.BOOKMARKS), s(ToolbarAction.TABS), s(ToolbarAction.MENU)),
                menu = listOf(s(ToolbarAction.NEW_TAB), s(ToolbarAction.NEW_PRIVATE_TAB), s(ToolbarAction.SEPARATOR),
                    s(ToolbarAction.HISTORY, label = false), s(ToolbarAction.ADD_BOOKMARK, label = false), s(ToolbarAction.JAVASCRIPT, label = false), s(ToolbarAction.SHARE, label = false), s(ToolbarAction.SEPARATOR),
                    s(ToolbarAction.BLOCKER), s(ToolbarAction.DARKEN), s(ToolbarAction.READER), s(ToolbarAction.DESKTOP_SITE), s(ToolbarAction.FIND), s(ToolbarAction.SEPARATOR),
                    s(ToolbarAction.CLOSE_TAB), s(ToolbarAction.CLOSE_ALL_TABS), s(ToolbarAction.SEPARATOR), s(ToolbarAction.BACK, label = false), s(ToolbarAction.FORWARD, label = false), s(ToolbarAction.RELOAD, label = false)))
            Preset.MINIMAL -> ToolbarConfig(
                bar = listOf(s(ToolbarAction.TABS, ButtonSize.LARGE), s(ToolbarAction.MENU, ButtonSize.LARGE)),
                menu = listOf(s(ToolbarAction.NEW_TAB), s(ToolbarAction.NEW_PRIVATE_TAB), s(ToolbarAction.SEPARATOR), s(ToolbarAction.BOOKMARKS), s(ToolbarAction.HISTORY), s(ToolbarAction.SHARE), s(ToolbarAction.SEPARATOR),
                    s(ToolbarAction.BLOCKER), s(ToolbarAction.DARKEN), s(ToolbarAction.READER), s(ToolbarAction.SEPARATOR), s(ToolbarAction.CLOSE_TAB), s(ToolbarAction.CLOSE_ALL_TABS), s(ToolbarAction.SEPARATOR), s(ToolbarAction.BACK, label = false), s(ToolbarAction.FORWARD, label = false), s(ToolbarAction.RELOAD, label = false)))
            Preset.GESTURES -> ToolbarConfig(
                bar = listOf(s(ToolbarAction.READER), s(ToolbarAction.JAVASCRIPT), s(ToolbarAction.TABS), s(ToolbarAction.NEW_TAB), s(ToolbarAction.MENU)),
                menu = listOf(s(ToolbarAction.NEW_PRIVATE_TAB), s(ToolbarAction.BOOKMARKS), s(ToolbarAction.HISTORY), s(ToolbarAction.SHARE), s(ToolbarAction.SEPARATOR), s(ToolbarAction.BLOCKER), s(ToolbarAction.DARKEN), s(ToolbarAction.DESKTOP_SITE), s(ToolbarAction.FIND), s(ToolbarAction.SEPARATOR), s(ToolbarAction.CLOSE_TAB), s(ToolbarAction.CLOSE_ALL_TABS)))
            Preset.READING -> ToolbarConfig(
                bar = listOf(s(ToolbarAction.BACK), s(ToolbarAction.READER, ButtonSize.LARGE), s(ToolbarAction.DARKEN), s(ToolbarAction.SCROLL_TOP), s(ToolbarAction.TABS), s(ToolbarAction.MENU)),
                menu = listOf(s(ToolbarAction.NEW_TAB), s(ToolbarAction.NEW_PRIVATE_TAB), s(ToolbarAction.SEPARATOR), s(ToolbarAction.BOOKMARKS), s(ToolbarAction.HISTORY), s(ToolbarAction.SHARE), s(ToolbarAction.FIND), s(ToolbarAction.SEPARATOR), s(ToolbarAction.BLOCKER), s(ToolbarAction.JAVASCRIPT), s(ToolbarAction.DESKTOP_SITE), s(ToolbarAction.SEPARATOR), s(ToolbarAction.CLOSE_TAB), s(ToolbarAction.CLOSE_ALL_TABS)))
        }
    }
}

@Serializable
enum class SearchEngine(val label: String, val needsBaseUrl: Boolean = false) {
    QAFILA("Qafila (mon serveur)", true), DUCKDUCKGO("DuckDuckGo"), QWANT("Qwant"), KAGI("Kagi"), SEARXNG("SearXNG (instance perso)", true), BRAVE("Brave Search"), GOOGLE("Google"), BING("Bing");
    fun url(query: String, base: String): String {
        val q = java.net.URLEncoder.encode(query, "UTF-8")
        val b = base.trim().trimEnd('/')
        return when (this) {
            QAFILA -> "${b.ifEmpty { "https://qafila.example.com" }}/?q=$q"
            DUCKDUCKGO -> "https://duckduckgo.com/?q=$q"
            QWANT -> "https://www.qwant.com/?q=$q"
            KAGI -> "https://kagi.com/search?q=$q"
            SEARXNG -> "${b.ifEmpty { "https://searx.be" }}/search?q=$q"
            BRAVE -> "https://search.brave.com/search?q=$q"
            GOOGLE -> "https://www.google.com/search?q=$q&udm=14"
            BING -> "https://www.bing.com/search?q=$q"
        }
    }
    fun suggestUrl(base: String): String? = when (this) {
        QAFILA -> if (base.isBlank()) null else "${base.trim().trimEnd('/')}/api/suggest?q="
        GOOGLE -> "https://suggestqueries.google.com/complete/search?client=firefox&q="
        BING -> "https://api.bing.com/osjson.aspx?query="
        else -> "https://duckduckgo.com/ac/?type=list&q="
    }
}

@Serializable enum class Appearance(val label: String) { SYSTEM("Système"), LIGHT("Clair"), DARK("Sombre") }
@Serializable enum class AccentColor(val label: String, val argb: Long) {
    MONO("Monochrome", 0xFF17191CL), INDIGO("Indigo", 0xFF6D5DFCL), BLUE("Bleu", 0xFF0561FFL), TEAL("Turquoise", 0xFF2BB3C0L),
    GREEN("Vert", 0xFF02A262L), ORANGE("Orange", 0xFFFF6E14L), PINK("Rose", 0xFFED458FL), RED("Rouge", 0xFFE63835L)
}
@Serializable enum class TabsLayout(val label: String) { LIST("Liste"), GRID("Grille") }
@Serializable enum class TabsSort(val label: String) { DATE("Date"), READING_TIME("Temps de lecture"), TITLE("Titre") }
@Serializable enum class NewTabPage(val label: String) { START("Démarrage"), SEARCH("Moteur de recherche"), BLANK("Page vide"), CUSTOM("Site personnalisé") }

@Serializable
data class Settings(
    val searchEngine: SearchEngine = SearchEngine.DUCKDUCKGO,
    val searchBaseUrl: String = "",
    val newTabPage: NewTabPage = NewTabPage.START,
    val newTabCustomUrl: String = "",
    val showSuggestions: Boolean = true,
    val appearance: Appearance = Appearance.SYSTEM,
    val accent: AccentColor = AccentColor.MONO,
    val adaptToSiteColor: Boolean = true,
    val toolbar: ToolbarConfig = ToolbarConfig.preset(ToolbarConfig.Preset.COMPLETE),
    val addressShowsFavicon: Boolean = true,
    val addressShowsReadingTime: Boolean = true,
    val addressShowsTitle: Boolean = false,
    val hideBarsOnScroll: Boolean = true,
    val tabsLayout: TabsLayout = TabsLayout.LIST,
    val tabsSort: TabsSort = TabsSort.DATE,
    val groupTabsByDomain: Boolean = true,
    val blockerEnabled: Boolean = true,
    val blockCookieBanners: Boolean = true,
    val javascriptEnabled: Boolean = true,
    val javascriptDisabledHosts: Set<String> = emptySet(),
    val upgradeToHttps: Boolean = true,
    val customUserAgent: String = "",
    val desktopHosts: Set<String> = emptySet(),
    val darkenSites: Boolean = false,
    val darkenHosts: Set<String> = emptySet(),
    val showReadingTime: Boolean = true,
    val haptics: Boolean = true,
)

@Serializable
data class PersistedState(
    val tabs: List<BrowserTab> = emptyList(),
    val selectedTabId: String? = null,
    val bookmarks: List<Bookmark> = emptyList(),
    val history: List<HistoryEntry> = emptyList(),
    val settings: Settings = Settings(),
)
