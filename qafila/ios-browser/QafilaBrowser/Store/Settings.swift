import SwiftUI

// MARK: - Recherche

enum SearchEngine: String, Codable, CaseIterable, Identifiable {
    case duckduckgo, kagi, qwant, brave, startpage, ecosia, google, bing, searxng, qafila, custom
    var id: String { rawValue }
    var label: String {
        switch self {
        case .duckduckgo: return "DuckDuckGo"
        case .kagi: return "Kagi"
        case .qwant: return "Qwant"
        case .brave: return "Brave Search"
        case .startpage: return "Startpage"
        case .ecosia: return "Ecosia"
        case .google: return "Google"
        case .bing: return "Bing"
        case .searxng: return "SearXNG (instance)"
        case .qafila: return "Qafila (mon serveur)"
        case .custom: return "Personnalisé"
        }
    }
    var needsBaseURL: Bool { self == .qafila || self == .searxng }

    func url(for query: String, settings s: Settings) -> URL? {
        let q = query.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed) ?? query
        let b = s.searchBaseURL.trimmingCharacters(in: CharacterSet(charactersIn: "/ "))
        switch self {
        case .duckduckgo: return URL(string: "https://duckduckgo.com/?q=\(q)")
        case .kagi: return URL(string: "https://kagi.com/search?q=\(q)")
        case .qwant: return URL(string: "https://www.qwant.com/?q=\(q)")
        case .brave: return URL(string: "https://search.brave.com/search?q=\(q)\(s.hideAIAnswers ? "&summary=0" : "")")
        case .startpage: return URL(string: "https://www.startpage.com/do/search?q=\(q)")
        case .ecosia: return URL(string: "https://www.ecosia.org/search?q=\(q)")
        case .google: return URL(string: "https://www.google.com/search?q=\(q)\(s.hideAIAnswers ? "&udm=14" : "")")
        case .bing: return URL(string: "https://www.bing.com/search?q=\(q)")
        case .searxng: return URL(string: "\(b.isEmpty ? "https://searx.be" : b)/search?q=\(q)")
        case .qafila: return URL(string: "\(b.isEmpty ? "https://qafila.example.com" : b)/?q=\(q)")
        case .custom:
            let t = s.customSearchTemplate.contains("%s") ? s.customSearchTemplate : "https://duckduckgo.com/?q=%s"
            return URL(string: t.replacingOccurrences(of: "%s", with: q))
        }
    }

    func suggestURL(settings s: Settings) -> String? {
        switch self {
        case .qafila: return s.searchBaseURL.isEmpty ? nil : s.searchBaseURL.trimmingCharacters(in: CharacterSet(charactersIn: "/ ")) + "/api/suggest?q="
        case .google: return "https://suggestqueries.google.com/complete/search?client=firefox&q="
        case .bing: return "https://api.bing.com/osjson.aspx?query="
        default: return "https://duckduckgo.com/ac/?type=list&q="
        }
    }
}

enum SuggestionsMode: String, Codable, CaseIterable, Identifiable {
    case everywhere, notPrivate, never
    var id: String { rawValue }
    var label: String { switch self { case .everywhere: return "Partout"; case .notPrivate: return "Sauf en navigation privée"; case .never: return "Jamais" } }
}

// MARK: - Apparence

enum Appearance: String, Codable, CaseIterable, Identifiable {
    case system, light, dark
    var id: String { rawValue }
    var label: String { switch self { case .system: return "Système"; case .light: return "Clair"; case .dark: return "Sombre" } }
    var colorScheme: ColorScheme? { switch self { case .system: return nil; case .light: return .light; case .dark: return .dark } }
}

enum AccentColor: String, Codable, CaseIterable, Identifiable {
    case mono, indigo, blue, teal, green, orange, pink, red
    var id: String { rawValue }
    var label: String {
        switch self { case .mono: return "Monochrome"; case .indigo: return "Indigo"; case .blue: return "Bleu"; case .teal: return "Turquoise"; case .green: return "Vert"; case .orange: return "Orange"; case .pink: return "Rose"; case .red: return "Rouge" }
    }
    var color: Color {
        switch self {
        case .mono: return Color.primary
        case .indigo: return Color(red: 0.43, green: 0.36, blue: 0.99)
        case .blue: return Color(red: 0.02, green: 0.38, blue: 1.0)
        case .teal: return Color(red: 0.17, green: 0.62, blue: 0.68)
        case .green: return Color(red: 0.01, green: 0.58, blue: 0.36)
        case .orange: return Color(red: 0.95, green: 0.43, blue: 0.08)
        case .pink: return Color(red: 0.90, green: 0.27, blue: 0.53)
        case .red: return Color(red: 0.88, green: 0.22, blue: 0.21)
        }
    }
}

/// Couleur de fond de la barre (comme la palette de Quiche), choisie séparément pour le mode clair et le mode sombre.
enum BarColor: String, Codable, CaseIterable, Identifiable {
    case auto, white, mist, lilac, blush, slate, graphite, black
    var id: String { rawValue }
    var label: String {
        switch self { case .auto: return "Auto (couleur du site)"; case .white: return "Blanc"; case .mist: return "Gris clair"; case .lilac: return "Lilas"; case .blush: return "Rose"; case .slate: return "Ardoise"; case .graphite: return "Graphite"; case .black: return "Noir" }
    }
    var color: Color? {
        switch self {
        case .auto: return nil
        case .white: return Color(red: 1, green: 1, blue: 1)
        case .mist: return Color(red: 0.949, green: 0.949, blue: 0.957)
        case .lilac: return Color(red: 0.937, green: 0.922, blue: 0.973)
        case .blush: return Color(red: 0.973, green: 0.886, blue: 0.914)
        case .slate: return Color(red: 0.494, green: 0.565, blue: 0.651)
        case .graphite: return Color(red: 0.173, green: 0.173, blue: 0.180)
        case .black: return Color(red: 0, green: 0, blue: 0)
        }
    }
}

enum ToolbarStyle: String, Codable, CaseIterable, Identifiable {
    case classic, glass
    var id: String { rawValue }
    var label: String { self == .classic ? "Classique" : "Verre" }
}

enum ToolbarPosition: String, Codable, CaseIterable, Identifiable {
    case bottom, top
    var id: String { rawValue }
    var label: String { self == .bottom ? "En bas" : "En haut" }
}

enum ButtonWeight: String, Codable, CaseIterable, Identifiable {
    case thin, regular, bold
    var id: String { rawValue }
    var label: String { switch self { case .thin: return "Fine"; case .regular: return "Normale"; case .bold: return "Grasse" } }
    var fontWeight: Font.Weight { switch self { case .thin: return .light; case .regular: return .regular; case .bold: return .semibold } }
    var stroke: CGFloat { switch self { case .thin: return 1.1; case .regular: return 1.5; case .bold: return 2 } }
}

enum MenuIconStyle: String, Codable, CaseIterable, Identifiable {
    case dots, dotsCircle, linesCircle
    var id: String { rawValue }
    var label: String { switch self { case .dots: return "Points"; case .dotsCircle: return "Points cerclés"; case .linesCircle: return "Lignes cerclées" } }
    var symbol: String { switch self { case .dots: return "ellipsis"; case .dotsCircle: return "ellipsis.circle"; case .linesCircle: return "line.3.horizontal.circle" } }
}

enum ScrollBehavior: String, Codable, CaseIterable, Identifiable {
    case fixed, shrink, hide
    var id: String { rawValue }
    var label: String { switch self { case .fixed: return "Fixe"; case .shrink: return "Réduire"; case .hide: return "Masquer" } }
}

enum AppIconChoice: String, Codable, CaseIterable, Identifiable {
    case classic, dark, ink, desert
    var id: String { rawValue }
    var label: String { switch self { case .classic: return "Classique"; case .dark: return "Nuit"; case .ink: return "Encre"; case .desert: return "Désert" } }
    /// Nom de l'icône alternative (nil = icône principale).
    var iconName: String? { switch self { case .classic: return nil; case .dark: return "AppIcon-Dark"; case .ink: return "AppIcon-Ink"; case .desert: return "AppIcon-Desert" } }
    var preview: String { switch self { case .classic: return "PreviewIcon-Classic"; case .dark: return "PreviewIcon-Dark"; case .ink: return "PreviewIcon-Ink"; case .desert: return "PreviewIcon-Desert" } }
}

// MARK: - Barre d'adresse

enum AddressStyle: String, Codable, CaseIterable, Identifiable {
    case card, fullURL, domainPill, titleReading, centered, hidden
    var id: String { rawValue }
    var label: String {
        switch self { case .card: return "Carte"; case .fullURL: return "Adresse complète"; case .domainPill: return "Domaine centré"; case .titleReading: return "Titre et lecture"; case .centered: return "Centré sans carte"; case .hidden: return "Masquée" }
    }
}

enum AddressTapAction: String, Codable, CaseIterable, Identifiable {
    case edit, menu
    var id: String { rawValue }
    var label: String { self == .edit ? "Modifier l'adresse" : "Ouvrir le menu" }
}

enum AddressLongPressAction: String, Codable, CaseIterable, Identifiable {
    case menu, copy, none
    var id: String { rawValue }
    var label: String { switch self { case .menu: return "Ouvrir le menu"; case .copy: return "Copier l'adresse"; case .none: return "Rien" } }
}

// MARK: - Onglets

enum TabsLayout: String, Codable, CaseIterable, Identifiable {
    case list, grid
    var id: String { rawValue }
    var label: String { self == .list ? "Liste" : "Grille" }
}

enum TabsSort: String, Codable, CaseIterable, Identifiable {
    case date, readingTime, title
    var id: String { rawValue }
    var label: String { switch self { case .date: return "Date"; case .readingTime: return "Temps de lecture"; case .title: return "Titre" } }
}

enum ThumbnailSize: String, Codable, CaseIterable, Identifiable {
    case small, large
    var id: String { rawValue }
    var label: String { self == .small ? "Petites" : "Grandes" }
}

enum NewTabPage: String, Codable, CaseIterable, Identifiable {
    case start, search, blank, custom
    var id: String { rawValue }
    var label: String { switch self { case .start: return "Démarrage"; case .search: return "Moteur de recherche"; case .blank: return "Page vide"; case .custom: return "Site personnalisé" } }
}

enum AutoCloseTabs: String, Codable, CaseIterable, Identifiable {
    case never, day, week, month
    var id: String { rawValue }
    var label: String { switch self { case .never: return "Jamais"; case .day: return "Après 1 jour"; case .week: return "Après 1 semaine"; case .month: return "Après 1 mois" } }
    var interval: TimeInterval? { switch self { case .never: return nil; case .day: return 86_400; case .week: return 604_800; case .month: return 2_592_000 } }
}

// MARK: - Lecture

enum TranslateLanguage: String, Codable, CaseIterable, Identifiable {
    case fr, en, ar, es, de, it, pt
    var id: String { rawValue }
    var label: String { switch self { case .fr: return "Français"; case .en: return "Anglais"; case .ar: return "Arabe"; case .es: return "Espagnol"; case .de: return "Allemand"; case .it: return "Italien"; case .pt: return "Portugais" } }
}

// MARK: - Réglages

struct Settings: Codable, Equatable {
    // Recherche
    var searchEngine: SearchEngine = .duckduckgo
    var searchBaseURL: String = ""
    var customSearchTemplate: String = "https://duckduckgo.com/?q=%s"
    var suggestions: SuggestionsMode = .everywhere
    var hideAIAnswers: Bool = true
    var newTabPage: NewTabPage = .start
    var newTabCustomURL: String = ""
    // Apparence
    var appearance: Appearance = .system
    var accent: AccentColor = .mono
    var barColorLight: BarColor = .mist
    var barColorDark: BarColor = .graphite
    var appIcon: AppIconChoice = .classic
    var haptics: Bool = true
    // Barre d'outils
    var toolbar: ToolbarConfig = .preset(.complete)
    var buttonWeight: ButtonWeight = .thin
    var menuIcon: MenuIconStyle = .dots
    var scrollBehavior: ScrollBehavior = .shrink
    var landscapeTopBar: Bool = true
    var edgeSwipeNavigation: Bool = true
    // Barre d'adresse
    var addressStyle: AddressStyle = .card
    var addressShowsFavicon: Bool = true
    var addressShowsReadingTime: Bool = true
    var addressTap: AddressTapAction = .edit
    var addressLongPress: AddressLongPressAction = .menu
    // Onglets
    var tabsLayout: TabsLayout = .list
    var thumbnailSize: ThumbnailSize = .large
    var tabsSort: TabsSort = .date
    var groupTabsByDomain: Bool = true
    var autoCloseTabs: AutoCloseTabs = .never
    var comfortMode: Bool = false
    // Confidentialité
    var blockAds: Bool = true
    var blockTrackers: Bool = true
    var blockCookieBanners: Bool = true
    var blockerDisabledHosts: Set<String> = []
    var javascriptEnabled: Bool = true
    var javascriptDisabledHosts: Set<String> = []
    var upgradeToHTTPS: Bool = true
    var clearDataOnCloseAll: Bool = false
    // Lecture
    var darkenSites: Bool = false
    var darkenOnlyInDarkMode: Bool = true
    var darkenHosts: Set<String> = []
    var textZoom: Double = 1.0
    var translateLanguage: TranslateLanguage = .fr
    var desktopByDefault: Bool = false
    var desktopHosts: Set<String> = []
    var customUserAgent: String = ""
    // Énergie
    var suspendTabsInLowPower: Bool = true

    var blockerEnabled: Bool { blockAds || blockTrackers || blockCookieBanners }
    func barColor(for scheme: ColorScheme) -> BarColor { scheme == .dark ? barColorDark : barColorLight }
}

/// Décodage tolérant : une clé absente ou d'un ancien format garde sa valeur par défaut (les réglages ne sont jamais perdus).
extension Settings {
    enum CodingKeys: String, CodingKey {
        case searchEngine, searchBaseURL, customSearchTemplate, suggestions, hideAIAnswers, newTabPage, newTabCustomURL
        case appearance, accent, barColorLight, barColorDark, appIcon, haptics
        case toolbar, buttonWeight, menuIcon, scrollBehavior, landscapeTopBar, edgeSwipeNavigation
        case addressStyle, addressShowsFavicon, addressShowsReadingTime, addressTap, addressLongPress
        case tabsLayout, thumbnailSize, tabsSort, groupTabsByDomain, autoCloseTabs, comfortMode
        case blockAds, blockTrackers, blockCookieBanners, blockerDisabledHosts, javascriptEnabled, javascriptDisabledHosts, upgradeToHTTPS, clearDataOnCloseAll
        case darkenSites, darkenOnlyInDarkMode, darkenHosts, textZoom, translateLanguage, desktopByDefault, desktopHosts, customUserAgent
        case suspendTabsInLowPower
    }

    init(from decoder: Decoder) throws {
        self.init()
        let c = try decoder.container(keyedBy: CodingKeys.self)
        func v<T: Decodable>(_ key: CodingKeys, _ current: T) -> T { ((try? c.decodeIfPresent(T.self, forKey: key)) ?? nil) ?? current }
        searchEngine = v(.searchEngine, searchEngine); searchBaseURL = v(.searchBaseURL, searchBaseURL)
        customSearchTemplate = v(.customSearchTemplate, customSearchTemplate); suggestions = v(.suggestions, suggestions)
        hideAIAnswers = v(.hideAIAnswers, hideAIAnswers); newTabPage = v(.newTabPage, newTabPage); newTabCustomURL = v(.newTabCustomURL, newTabCustomURL)
        appearance = v(.appearance, appearance); accent = v(.accent, accent); barColorLight = v(.barColorLight, barColorLight)
        barColorDark = v(.barColorDark, barColorDark); appIcon = v(.appIcon, appIcon); haptics = v(.haptics, haptics)
        toolbar = v(.toolbar, toolbar); buttonWeight = v(.buttonWeight, buttonWeight); menuIcon = v(.menuIcon, menuIcon)
        scrollBehavior = v(.scrollBehavior, scrollBehavior); landscapeTopBar = v(.landscapeTopBar, landscapeTopBar); edgeSwipeNavigation = v(.edgeSwipeNavigation, edgeSwipeNavigation)
        addressStyle = v(.addressStyle, addressStyle); addressShowsFavicon = v(.addressShowsFavicon, addressShowsFavicon)
        addressShowsReadingTime = v(.addressShowsReadingTime, addressShowsReadingTime); addressTap = v(.addressTap, addressTap); addressLongPress = v(.addressLongPress, addressLongPress)
        tabsLayout = v(.tabsLayout, tabsLayout); thumbnailSize = v(.thumbnailSize, thumbnailSize); tabsSort = v(.tabsSort, tabsSort)
        groupTabsByDomain = v(.groupTabsByDomain, groupTabsByDomain); autoCloseTabs = v(.autoCloseTabs, autoCloseTabs); comfortMode = v(.comfortMode, comfortMode)
        blockAds = v(.blockAds, blockAds); blockTrackers = v(.blockTrackers, blockTrackers); blockCookieBanners = v(.blockCookieBanners, blockCookieBanners)
        blockerDisabledHosts = v(.blockerDisabledHosts, blockerDisabledHosts); javascriptEnabled = v(.javascriptEnabled, javascriptEnabled)
        javascriptDisabledHosts = v(.javascriptDisabledHosts, javascriptDisabledHosts); upgradeToHTTPS = v(.upgradeToHTTPS, upgradeToHTTPS); clearDataOnCloseAll = v(.clearDataOnCloseAll, clearDataOnCloseAll)
        darkenSites = v(.darkenSites, darkenSites); darkenOnlyInDarkMode = v(.darkenOnlyInDarkMode, darkenOnlyInDarkMode); darkenHosts = v(.darkenHosts, darkenHosts)
        textZoom = v(.textZoom, textZoom); translateLanguage = v(.translateLanguage, translateLanguage); desktopByDefault = v(.desktopByDefault, desktopByDefault)
        desktopHosts = v(.desktopHosts, desktopHosts); customUserAgent = v(.customUserAgent, customUserAgent)
        suspendTabsInLowPower = v(.suspendTabsInLowPower, suspendTabsInLowPower)
    }
}
