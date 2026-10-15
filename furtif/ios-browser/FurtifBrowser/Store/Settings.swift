import SwiftUI

enum SearchEngine: String, Codable, CaseIterable, Identifiable {
    case furtif, duckduckgo, qwant, kagi, searxng, brave, google, bing
    var id: String { rawValue }
    var label: String {
        switch self {
        case .furtif: return "Furtif (mon serveur)"
        case .duckduckgo: return "DuckDuckGo"
        case .qwant: return "Qwant"
        case .kagi: return "Kagi"
        case .searxng: return "SearXNG (instance perso)"
        case .brave: return "Brave Search"
        case .google: return "Google"
        case .bing: return "Bing"
        }
    }
    var needsBaseURL: Bool { self == .furtif || self == .searxng }
    func url(for query: String, base: String) -> URL? {
        let q = query.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed) ?? query
        let b = base.trimmingCharacters(in: CharacterSet(charactersIn: "/ "))
        switch self {
        case .furtif: return URL(string: "\(b.isEmpty ? "https://furtif.example.com" : b)/?q=\(q)")
        case .duckduckgo: return URL(string: "https://duckduckgo.com/?q=\(q)")
        case .qwant: return URL(string: "https://www.qwant.com/?q=\(q)")
        case .kagi: return URL(string: "https://kagi.com/search?q=\(q)")
        case .searxng: return URL(string: "\(b.isEmpty ? "https://searx.be" : b)/search?q=\(q)")
        case .brave: return URL(string: "https://search.brave.com/search?q=\(q)")
        case .google: return URL(string: "https://www.google.com/search?q=\(q)&udm=14")
        case .bing: return URL(string: "https://www.bing.com/search?q=\(q)")
        }
    }
    var suggestURL: String? {
        switch self {
        case .furtif: return nil
        case .duckduckgo, .qwant, .brave, .kagi, .searxng: return "https://duckduckgo.com/ac/?type=list&q="
        case .google: return "https://suggestqueries.google.com/complete/search?client=firefox&q="
        case .bing: return "https://api.bing.com/osjson.aspx?query="
        }
    }
}

enum Appearance: String, Codable, CaseIterable, Identifiable {
    case system, light, dark
    var id: String { rawValue }
    var label: String { switch self { case .system: return "Système"; case .light: return "Clair"; case .dark: return "Sombre" } }
    var colorScheme: ColorScheme? { switch self { case .system: return nil; case .light: return .light; case .dark: return .dark } }
}

/// Couleurs d'accent proposées (l'icône de l'app et l'interface suivent la couleur choisie, comme dans Quiche).
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
        case .teal: return Color(red: 0.17, green: 0.70, blue: 0.75)
        case .green: return Color(red: 0.01, green: 0.64, blue: 0.38)
        case .orange: return Color(red: 1.0, green: 0.43, blue: 0.08)
        case .pink: return Color(red: 0.93, green: 0.27, blue: 0.56)
        case .red: return Color(red: 0.90, green: 0.22, blue: 0.21)
        }
    }
}

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

struct Settings: Codable, Equatable {
    // Recherche
    var searchEngine: SearchEngine = .duckduckgo
    var searchBaseURL: String = ""
    var newTabPage: NewTabPage = .start
    var newTabCustomURL: String = ""
    var showSuggestions: Bool = true
    // Apparence
    var appearance: Appearance = .system
    var accent: AccentColor = .mono
    var adaptToSiteColor: Bool = true
    var toolbar: ToolbarConfig = .preset(.complete)
    // Barre d'adresse
    var addressShowsFavicon: Bool = true
    var addressShowsReadingTime: Bool = true
    var addressShowsTitle: Bool = false
    var hideBarsOnScroll: Bool = true
    // Onglets
    var tabsLayout: TabsLayout = .list
    var tabsSort: TabsSort = .date
    var groupTabsByDomain: Bool = true
    var thumbnailSize: ThumbnailSize = .large
    // Confidentialité
    var blockerEnabled: Bool = true
    var blockCookieBanners: Bool = true
    var javascriptEnabled: Bool = true
    var javascriptDisabledHosts: Set<String> = []
    var upgradeToHTTPS: Bool = true
    var customUserAgent: String = ""
    var desktopHosts: Set<String> = []
    // Lecture
    var darkenSites: Bool = false
    var darkenHosts: Set<String> = []
    var showReadingTime: Bool = true
    var haptics: Bool = true
}
