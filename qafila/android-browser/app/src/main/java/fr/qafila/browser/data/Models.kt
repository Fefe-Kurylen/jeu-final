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
    val host: String get() = hostOrNull ?: "Nouvel onglet"
    /** Domaine affiché (sans « www. » ni sous-domaine mobile « m. ») : sert aussi à grouper les onglets par site. */
    val hostOrNull: String? get() = runCatching { java.net.URI(url ?: return null).host?.lowercase()?.removePrefix("www.")?.replace(Regex("(^|\\.)m\\."), "$1") }.getOrNull()
    val displayTitle: String get() = title.ifBlank { hostOrNull ?: url ?: "Nouvel onglet" }
    val readingLabel: String? get() = if (readingMinutes > 0) "$readingMinutes min" else null
    /** Adresse sans « https:// » ni « www. ». */
    val shortUrl: String get() = (url ?: "").removePrefix("https://").removePrefix("http://").removePrefix("www.").removeSuffix("/")
}

@Serializable data class Bookmark(val id: String = UUID.randomUUID().toString(), val title: String, val url: String, val addedAt: Long = System.currentTimeMillis())
@Serializable data class HistoryEntry(val id: String = UUID.randomUUID().toString(), val title: String, val url: String, val visitedAt: Long = System.currentTimeMillis())

/** Toutes les actions disponibles pour la barre et le menu (chaque bouton peut être placé où l'on veut). */
@Serializable
enum class ToolbarAction(val label: String, val destructive: Boolean = false, val short: String = label) {
    BACK("Précédent"), FORWARD("Suivant"), RELOAD("Recharger"), STOP("Arrêter"),
    TABS("Onglets"), NEW_TAB("Nouvel onglet"), NEW_PRIVATE_TAB("Onglet privé"), REOPEN_TAB("Rouvrir l'onglet fermé", short = "Rouvrir"),
    CLOSE_TAB("Fermer l'onglet", true, "Fermer"), CLOSE_ALL_TABS("Tout fermer", true), CLOSE_ALL_AND_CLEAR("Tout fermer et effacer les données", true, "Tout effacer"),
    BOOKMARKS("Favoris"), ADD_BOOKMARK("Ajouter aux favoris", short = "Favori"), HISTORY("Historique"), SHARE("Partager"), COPY_LINK("Copier le lien", short = "Copier"),
    FIND("Rechercher dans la page", short = "Chercher"), SEARCH("Rechercher"),
    BLOCKER("Bloqueur"), DARKEN("Assombrir"), READER("Lecteur"), JAVASCRIPT("JavaScript"), DESKTOP_SITE("Site bureau"), TRANSLATE("Traduire"),
    SCROLL_TOP("Haut de page"), SCROLL_BOTTOM("Bas de page"), HOME("Accueil"), SETTINGS("Réglages"), CUSTOMIZE("Personnaliser"), MENU("Menu"),
    /** Emplacement de l'adresse « en ligne » dans la rangée d'icônes (barre seulement). */
    ADDRESS("Adresse (en ligne)"),
    SEPARATOR("Séparateur");
}

/** Taille d'icône dans la barre : Petit 17 / Moyen 20 / Grand 23. */
@Serializable enum class ButtonSize(val label: String, val dp: Int) { SMALL("Petit", 17), MEDIUM("Moyen", 20), LARGE("Grand", 23) }

@Serializable
data class ToolbarSlot(val id: String = UUID.randomUUID().toString(), val action: ToolbarAction, val size: ButtonSize = ButtonSize.MEDIUM, val showsLabel: Boolean = true)

/** Matériau de la barre : couleur pleine ou translucide. */
@Serializable enum class ToolbarStyle(val label: String) { CLASSIC("Classique"), GLASS("Verre"), FLOATING("Flottante") }
@Serializable enum class ToolbarPosition(val label: String) { BOTTOM("En bas"), TOP("En haut") }

@Serializable
data class ToolbarConfig(val bar: List<ToolbarSlot>, val menu: List<ToolbarSlot>, val style: ToolbarStyle = ToolbarStyle.CLASSIC, val position: ToolbarPosition = ToolbarPosition.BOTTOM) {
    val hasInlineAddress: Boolean get() = bar.any { it.action == ToolbarAction.ADDRESS }

    /** Galerie de barres (DESIGN.md §7). */
    enum class Preset(val label: String, val description: String, val menuIcon: MenuIconStyle? = null) {
        COMPLETE("Complète", "Précédent, Suivant, Partager, Nouvel onglet, Onglets et Menu : l'essentiel à portée de pouce."),
        NAVIGATION("Navigation", "Pour enchaîner les pages : Précédent, Suivant, Onglets, Nouvel onglet et Fermer."),
        TOOLS("Outils", "Rouvrir l'onglet fermé, site bureau et lecteur en accès direct."),
        READER("Lecteur", "Traduire, lecteur, JavaScript et haut de page pour les longs articles."),
        MINIMAL("Minimal", "L'adresse dans la rangée, à côté des onglets et du menu. Rien d'autre.", MenuIconStyle.LINES_CIRCLE),
        ZEN("Zen", "Nouvel onglet, l'adresse, les onglets et Fermer. Appui long sur l'adresse pour le menu."),
    }

    companion object {
        private fun s(a: ToolbarAction, size: ButtonSize = ButtonSize.MEDIUM, label: Boolean = true) = ToolbarSlot(action = a, size = size, showsLabel = label)
        private val SEP get() = s(ToolbarAction.SEPARATOR)

        /** Menu par défaut (DESIGN.md §3) : tuiles Nouvel onglet | Onglet privé, lignes, actions rouges, tuiles de navigation. */
        fun defaultMenu(): List<ToolbarSlot> = listOf(
            s(ToolbarAction.NEW_TAB, label = false), s(ToolbarAction.NEW_PRIVATE_TAB, label = false), SEP,
            s(ToolbarAction.BOOKMARKS), s(ToolbarAction.HISTORY), s(ToolbarAction.ADD_BOOKMARK), SEP,
            s(ToolbarAction.BLOCKER), s(ToolbarAction.DARKEN), s(ToolbarAction.READER), SEP,
            s(ToolbarAction.SETTINGS), SEP,
            s(ToolbarAction.CLOSE_TAB), s(ToolbarAction.CLOSE_ALL_TABS), SEP,
            s(ToolbarAction.BACK, label = false), s(ToolbarAction.FORWARD, label = false), s(ToolbarAction.RELOAD, label = false), s(ToolbarAction.SHARE, label = false),
        )

        fun preset(p: Preset): ToolbarConfig = when (p) {
            Preset.COMPLETE -> ToolbarConfig(
                bar = listOf(s(ToolbarAction.BACK), s(ToolbarAction.FORWARD), s(ToolbarAction.SHARE), s(ToolbarAction.NEW_TAB), s(ToolbarAction.TABS), s(ToolbarAction.MENU)),
                menu = defaultMenu())
            Preset.NAVIGATION -> ToolbarConfig(
                bar = listOf(s(ToolbarAction.BACK), s(ToolbarAction.FORWARD), s(ToolbarAction.TABS), s(ToolbarAction.NEW_TAB), s(ToolbarAction.CLOSE_TAB)),
                menu = listOf(s(ToolbarAction.NEW_PRIVATE_TAB, label = false), s(ToolbarAction.SETTINGS, label = false), SEP,
                    s(ToolbarAction.BOOKMARKS), s(ToolbarAction.HISTORY), s(ToolbarAction.SHARE), s(ToolbarAction.COPY_LINK), SEP,
                    s(ToolbarAction.BLOCKER), s(ToolbarAction.DARKEN), s(ToolbarAction.READER), SEP,
                    s(ToolbarAction.CLOSE_ALL_TABS), SEP, s(ToolbarAction.RELOAD, label = false), s(ToolbarAction.FIND, label = false)))
            Preset.TOOLS -> ToolbarConfig(
                bar = listOf(s(ToolbarAction.BACK), s(ToolbarAction.REOPEN_TAB), s(ToolbarAction.DESKTOP_SITE), s(ToolbarAction.READER), s(ToolbarAction.TABS), s(ToolbarAction.CLOSE_TAB), s(ToolbarAction.MENU)),
                menu = listOf(s(ToolbarAction.NEW_TAB, label = false), s(ToolbarAction.NEW_PRIVATE_TAB, label = false), SEP,
                    s(ToolbarAction.BOOKMARKS), s(ToolbarAction.HISTORY), s(ToolbarAction.FIND), s(ToolbarAction.TRANSLATE), SEP,
                    s(ToolbarAction.BLOCKER), s(ToolbarAction.JAVASCRIPT), s(ToolbarAction.DARKEN), SEP,
                    s(ToolbarAction.SETTINGS), SEP, s(ToolbarAction.CLOSE_ALL_AND_CLEAR), SEP,
                    s(ToolbarAction.FORWARD, label = false), s(ToolbarAction.RELOAD, label = false), s(ToolbarAction.SHARE, label = false), s(ToolbarAction.COPY_LINK, label = false)))
            Preset.READER -> ToolbarConfig(
                bar = listOf(s(ToolbarAction.TRANSLATE), s(ToolbarAction.READER), s(ToolbarAction.JAVASCRIPT), s(ToolbarAction.SCROLL_TOP), s(ToolbarAction.NEW_TAB), s(ToolbarAction.TABS), s(ToolbarAction.CLOSE_TAB)),
                menu = listOf(s(ToolbarAction.NEW_PRIVATE_TAB, label = false), s(ToolbarAction.SETTINGS, label = false), SEP,
                    s(ToolbarAction.BOOKMARKS), s(ToolbarAction.HISTORY), s(ToolbarAction.ADD_BOOKMARK), s(ToolbarAction.SHARE), SEP,
                    s(ToolbarAction.DARKEN), s(ToolbarAction.BLOCKER), s(ToolbarAction.FIND), SEP,
                    s(ToolbarAction.CLOSE_ALL_TABS), SEP,
                    s(ToolbarAction.BACK, label = false), s(ToolbarAction.FORWARD, label = false), s(ToolbarAction.RELOAD, label = false), s(ToolbarAction.SCROLL_BOTTOM, label = false)))
            Preset.MINIMAL -> ToolbarConfig(
                bar = listOf(s(ToolbarAction.ADDRESS), s(ToolbarAction.TABS), s(ToolbarAction.MENU)),
                menu = defaultMenu())
            Preset.ZEN -> ToolbarConfig(
                bar = listOf(s(ToolbarAction.NEW_TAB), s(ToolbarAction.ADDRESS), s(ToolbarAction.TABS), s(ToolbarAction.CLOSE_TAB)),
                menu = defaultMenu())
        }
    }
}

@Serializable
enum class SearchEngine(val label: String, val needsBaseUrl: Boolean = false) {
    DUCKDUCKGO("DuckDuckGo"), KAGI("Kagi"), QWANT("Qwant"), BRAVE("Brave Search"), STARTPAGE("Startpage"), ECOSIA("Ecosia"),
    GOOGLE("Google"), BING("Bing"), SEARXNG("SearXNG (instance)", true), QAFILA("Qafila (serveur)", true), CUSTOM("Personnalisé");

    /** URL de recherche. [base] : instance SearXNG / serveur Qafila ; [template] : modèle personnalisé avec %s. */
    fun url(query: String, base: String, template: String = "", hideAi: Boolean = false): String {
        val q = java.net.URLEncoder.encode(query, "UTF-8")
        val b = base.trim().trimEnd('/')
        return when (this) {
            QAFILA -> "${b.ifEmpty { "https://qafila.example.com" }}/?q=$q"
            DUCKDUCKGO -> if (hideAi) "https://noai.duckduckgo.com/?q=$q" else "https://duckduckgo.com/?q=$q"
            QWANT -> "https://www.qwant.com/?q=$q"
            KAGI -> "https://kagi.com/search?q=$q"
            SEARXNG -> "${b.ifEmpty { "https://searx.be" }}/search?q=$q"
            BRAVE -> "https://search.brave.com/search?q=$q" + if (hideAi) "&summary=0" else ""
            STARTPAGE -> "https://www.startpage.com/do/search?q=$q"
            ECOSIA -> "https://www.ecosia.org/search?q=$q"
            GOOGLE -> "https://www.google.com/search?q=$q" + if (hideAi) "&udm=14" else ""
            BING -> "https://www.bing.com/search?q=$q"
            CUSTOM -> template.trim().takeIf { it.contains("%s") }?.replace("%s", q) ?: "https://duckduckgo.com/?q=$q"
        }
    }

    /** Page d'accueil du moteur (nouvel onglet « Moteur de recherche »). */
    fun home(base: String, template: String, hideAi: Boolean): String = when (this) {
        DUCKDUCKGO -> if (hideAi) "https://noai.duckduckgo.com/" else "https://duckduckgo.com/"
        KAGI -> "https://kagi.com/"
        QWANT -> "https://www.qwant.com/"
        BRAVE -> "https://search.brave.com/"
        STARTPAGE -> "https://www.startpage.com/"
        ECOSIA -> "https://www.ecosia.org/"
        GOOGLE -> "https://www.google.com/"
        BING -> "https://www.bing.com/"
        SEARXNG -> base.trim().trimEnd('/').ifEmpty { "https://searx.be" } + "/"
        QAFILA -> base.trim().trimEnd('/').ifEmpty { "https://qafila.example.com" } + "/"
        CUSTOM -> runCatching { java.net.URI(template.trim().replace("%s", "")).let { u -> u.host?.let { "${u.scheme ?: "https"}://$it/" } } }.getOrNull() ?: "https://duckduckgo.com/"
    }

    /** Point d'accès des suggestions (null = suggestions locales seulement, pour ne pas envoyer la saisie ailleurs). */
    fun suggestUrl(base: String): String? = when (this) {
        QAFILA -> if (base.isBlank()) null else "${base.trim().trimEnd('/')}/api/suggest?q="
        SEARXNG -> if (base.isBlank()) null else "${base.trim().trimEnd('/')}/autocompleter?q="
        GOOGLE -> "https://suggestqueries.google.com/complete/search?client=firefox&q="
        BING -> "https://api.bing.com/osjson.aspx?query="
        BRAVE -> "https://search.brave.com/api/suggest?q="
        ECOSIA -> "https://ac.ecosia.org/autocomplete?type=list&q="
        QWANT -> "https://api.qwant.com/v3/suggest?q="
        DUCKDUCKGO -> "https://duckduckgo.com/ac/?type=list&q="
        KAGI, STARTPAGE, CUSTOM -> null
    }
}

@Serializable enum class Appearance(val label: String) { SYSTEM("Système"), LIGHT("Clair"), DARK("Sombre") }
@Serializable enum class AccentColor(val label: String, val argb: Long) {
    MONO("Monochrome", 0xFF111111L), INDIGO("Indigo", 0xFF5856D6L), BLUE("Bleu", 0xFF007AFFL), TEAL("Turquoise", 0xFF30B0C7L),
    GREEN("Vert", 0xFF34C759L), ORANGE("Orange", 0xFFFF9500L), PINK("Rose", 0xFFFF2D55L), RED("Rouge", 0xFFFF3B30L)
}

/** Couleur de la barre (une pour le mode clair, une pour le mode sombre). AUTO = couleur du site (theme-color). */
@Serializable enum class BarColor(val label: String, val argb: Long) {
    AUTO("Auto", 0), WHITE("Blanc", 0xFFFFFFFFL), LIGHT_GREY("Gris clair", 0xFFF2F2F7L), LILAC("Lilas", 0xFFECE8F5L), PINK("Rose", 0xFFF6DCE6L),
    SLATE("Ardoise", 0xFF7E91A8L), GRAPHITE("Graphite", 0xFF2C2C2EL), BLACK("Noir", 0xFF000000L)
}

/** Styles de barre d'adresse (DESIGN.md §2). */
@Serializable enum class AddressStyle(val label: String, val description: String) {
    CARD("Carte", "Domaine en capitales et titre de la page."),
    FULL_URL("Adresse complète", "L'URL entière, sur une ligne."),
    CENTERED_DOMAIN("Domaine centré", "Une capsule grise avec le domaine au centre."),
    TITLE_READ("Titre + lecture", "Le titre de la page et son temps de lecture."),
    CENTERED_PLAIN("Centré sans carte", "Domaine et titre centrés, directement sur la barre."),
    HIDDEN("Masquée", "Aucune adresse : bouton Rechercher ou menu pour en saisir une."),
}
@Serializable enum class AddressTapAction(val label: String) { EDIT("Modifier l'adresse"), MENU("Ouvrir le menu") }
@Serializable enum class AddressLongPressAction(val label: String) { MENU("Ouvrir le menu"), COPY("Copier l'adresse"), NONE("Rien") }
@Serializable enum class IconWeight(val label: String, val stroke: Float) { THIN("Fine", 1.15f), REGULAR("Normale", 1.5f), BOLD("Grasse", 2.0f) }
@Serializable enum class MenuIconStyle(val label: String) { DOTS("Points"), DOTS_CIRCLE("Points cerclés"), LINES_CIRCLE("Lignes cerclées") }
@Serializable enum class ScrollBehavior(val label: String, val description: String) {
    FIXED("Fixe", "La barre ne bouge jamais."),
    SHRINK("Réduire", "Seul le domaine reste visible ; touchez-le pour rouvrir la barre."),
    HIDE("Masquer", "La barre glisse hors de l'écran ; elle revient en remontant ou en touchant le bas."),
}
@Serializable enum class TabsLayout(val label: String) { LIST("Liste"), GRID("Grille") }
@Serializable enum class GridSize(val label: String, val columns: Int) { LARGE("Grandes", 2), SMALL("Petites", 3) }
@Serializable enum class TabsSort(val label: String) { DATE("Date de consultation"), READING_TIME("Temps de lecture"), TITLE("Titre") }
@Serializable enum class NewTabPage(val label: String) { START("Page de démarrage"), SEARCH("Moteur de recherche"), BLANK("Page vide"), CUSTOM("Site personnalisé") }
@Serializable enum class AutoCloseTabs(val label: String, val days: Int) { NEVER("Jamais", 0), DAY("Après 1 jour", 1), WEEK("Après 1 semaine", 7), MONTH("Après 1 mois", 30) }
@Serializable enum class SuggestionsMode(val label: String) { EVERYWHERE("Partout"), NOT_PRIVATE("Sauf onglets privés"), NEVER("Jamais") }
@Serializable enum class TranslateLanguage(val label: String, val code: String) {
    FR("Français", "fr"), EN("Anglais", "en"), AR("Arabe", "ar"), ES("Espagnol", "es"), DE("Allemand", "de"), IT("Italien", "it"),
    PT("Portugais", "pt"), NL("Néerlandais", "nl"), TR("Turc", "tr"), ZH("Chinois", "zh-CN"), JA("Japonais", "ja")
}
/** Icônes alternatives de l'application (activity-alias). */
@Serializable enum class AppIcon(val label: String, val alias: String) {
    CLASSIC("Classique", "fr.qafila.browser.IconClassic"), DARK("Sombre", "fr.qafila.browser.IconDark"),
    INK("Encre", "fr.qafila.browser.IconInk"), DESERT("Désert", "fr.qafila.browser.IconDesert")
}

@Serializable
data class Settings(
    // Recherche
    val searchEngine: SearchEngine = SearchEngine.DUCKDUCKGO,
    val searchBaseUrl: String = "",
    val customSearchTemplate: String = "",
    val suggestionsMode: SuggestionsMode = SuggestionsMode.EVERYWHERE,
    val hideAiAnswers: Boolean = true,
    // Apparence
    val appearance: Appearance = Appearance.SYSTEM,
    val accent: AccentColor = AccentColor.MONO,
    val barColorLight: BarColor = BarColor.AUTO,
    val barColorDark: BarColor = BarColor.AUTO,
    val appIcon: AppIcon = AppIcon.CLASSIC,
    val haptics: Boolean = true,
    // Barre d'outils
    val toolbar: ToolbarConfig = ToolbarConfig.preset(ToolbarConfig.Preset.COMPLETE),
    val landscapeTopBar: Boolean = false,
    val iconWeight: IconWeight = IconWeight.REGULAR,
    val menuIcon: MenuIconStyle = MenuIconStyle.DOTS,
    val scrollBehavior: ScrollBehavior = ScrollBehavior.SHRINK,
    val swipeBarNavigation: Boolean = true,
    // Barre d'adresse
    val addressStyle: AddressStyle = AddressStyle.CARD,
    val addressShowsFavicon: Boolean = true,
    val addressShowsReadingTime: Boolean = true,
    val addressTap: AddressTapAction = AddressTapAction.EDIT,
    val addressLongPress: AddressLongPressAction = AddressLongPressAction.MENU,
    // Onglets
    val tabsLayout: TabsLayout = TabsLayout.LIST,
    val tabsGridSize: GridSize = GridSize.LARGE,
    val tabsSort: TabsSort = TabsSort.DATE,
    val groupTabsByDomain: Boolean = true,
    val newTabPage: NewTabPage = NewTabPage.START,
    val newTabCustomUrl: String = "",
    val autoCloseTabs: AutoCloseTabs = AutoCloseTabs.NEVER,
    val comfortMode: Boolean = false,
    // Confidentialité et sécurité
    val blockAds: Boolean = true,
    val blockTrackers: Boolean = true,
    val blockCookieBanners: Boolean = true,
    val blockerDisabledHosts: Set<String> = emptySet(),
    val javascriptEnabled: Boolean = true,
    val javascriptDisabledHosts: Set<String> = emptySet(),
    val upgradeToHttps: Boolean = true,
    val clearOnCloseAll: Boolean = false,
    val customUserAgent: String = "",
    // Lecture
    val darkenSites: Boolean = false,
    val darkenOnlyInDarkMode: Boolean = false,
    val darkenHosts: Set<String> = emptySet(),
    val textZoom: Int = 100,
    val translateLanguage: TranslateLanguage = TranslateLanguage.FR,
    val desktopByDefault: Boolean = false,
    val desktopHosts: Set<String> = emptySet(),
    // Énergie
    val suspendTabsInPowerSave: Boolean = true,
)

@Serializable
data class PersistedState(
    val tabs: List<BrowserTab> = emptyList(),
    val selectedTabId: String? = null,
    val bookmarks: List<Bookmark> = emptyList(),
    val history: List<HistoryEntry> = emptyList(),
    val settings: Settings = Settings(),
)
