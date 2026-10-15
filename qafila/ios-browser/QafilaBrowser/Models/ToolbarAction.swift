import SwiftUI

/// Toutes les actions disponibles pour la barre d'outils et le menu (comme dans Quiche : chaque bouton peut être placé où l'on veut).
enum ToolbarAction: String, Codable, CaseIterable, Identifiable {
    case back, forward, reload, stop
    case tabs, newTab, newPrivateTab, closeTab, closeAllTabs
    case bookmarks, addBookmark, history, share, find
    case blocker, darken, reader, javascript, desktopSite, translate
    case scrollTop, scrollBottom, home, settings, customize, menu
    case address
    case separator

    var id: String { rawValue }

    var label: String {
        switch self {
        case .back: return "Précédent"
        case .forward: return "Suivant"
        case .reload: return "Recharger"
        case .stop: return "Arrêter"
        case .tabs: return "Onglets"
        case .newTab: return "Nouvel onglet"
        case .newPrivateTab: return "Onglet privé"
        case .closeTab: return "Fermer l'onglet"
        case .closeAllTabs: return "Fermer tous les onglets"
        case .bookmarks: return "Favoris"
        case .addBookmark: return "Ajouter aux favoris"
        case .history: return "Historique"
        case .share: return "Partager"
        case .find: return "Rechercher dans la page"
        case .blocker: return "Bloqueur"
        case .darken: return "Assombrir"
        case .reader: return "Lecteur"
        case .javascript: return "JavaScript"
        case .desktopSite: return "Version bureau"
        case .translate: return "Traduire"
        case .scrollTop: return "Haut de page"
        case .scrollBottom: return "Bas de page"
        case .home: return "Accueil"
        case .settings: return "Réglages"
        case .customize: return "Personnaliser"
        case .menu: return "Menu"
        case .address: return "Adresse"
        case .separator: return "Séparateur"
        }
    }

    var symbol: String {
        switch self {
        case .back: return "chevron.backward"
        case .forward: return "chevron.forward"
        case .reload: return "arrow.clockwise"
        case .stop: return "xmark"
        case .tabs: return "square.on.square"
        case .newTab: return "plus"
        case .newPrivateTab: return "hand.raised"
        case .closeTab: return "xmark"
        case .closeAllTabs: return "xmark.square"
        case .bookmarks: return "book"
        case .addBookmark: return "bookmark"
        case .history: return "clock"
        case .share: return "square.and.arrow.up"
        case .find: return "text.magnifyingglass"
        case .blocker: return "shield.lefthalf.filled"
        case .darken: return "circle.lefthalf.filled"
        case .reader: return "text.alignleft"
        case .javascript: return "curlybraces"
        case .desktopSite: return "desktopcomputer"
        case .translate: return "character.bubble"
        case .scrollTop: return "arrow.up.to.line"
        case .scrollBottom: return "arrow.down.to.line"
        case .home: return "house"
        case .settings: return "gearshape"
        case .customize: return "slider.horizontal.3"
        case .menu: return "ellipsis"
        case .address: return "link"
        case .separator: return "minus"
        }
    }

    /// Les actions destructives sont affichées en rouge dans le menu, comme dans Quiche.
    var isDestructive: Bool { self == .closeTab || self == .closeAllTabs }
}

enum ButtonSize: String, Codable, CaseIterable, Identifiable {
    case small, medium, large
    var id: String { rawValue }
    var label: String { switch self { case .small: return "Petit"; case .medium: return "Moyen"; case .large: return "Grand" } }
    var pointSize: CGFloat { switch self { case .small: return 17; case .medium: return 20; case .large: return 23 } }
}

/// Un emplacement dans la barre ou le menu.
struct ToolbarSlot: Identifiable, Codable, Equatable {
    var id: UUID = UUID()
    var action: ToolbarAction
    var size: ButtonSize = .medium
    /// Dans le menu : ligne avec intitulé, ou icône seule (les icônes seules consécutives forment une rangée de tuiles).
    var showsLabel: Bool = true
}

/// Configuration complète : barre + menu, comme la « Toolbar Gallery » de Quiche.
struct ToolbarConfig: Codable, Equatable {
    var bar: [ToolbarSlot]
    var menu: [ToolbarSlot]
    var style: ToolbarStyle = .classic
    var position: ToolbarPosition = .bottom

    var hasInlineAddress: Bool { bar.contains { $0.action == .address } }

    /// Menu standard (celui de Quiche) : tuiles nouvel onglet / privé, rangée d'icônes, lignes d'actions, fermetures en rouge, navigation.
    static let standardMenu: [ToolbarSlot] = {
        func s(_ a: ToolbarAction, label: Bool = true) -> ToolbarSlot { ToolbarSlot(action: a, showsLabel: label) }
        return [s(.newTab, label: false), s(.newPrivateTab, label: false), s(.separator),
                s(.history, label: false), s(.bookmarks, label: false), s(.addBookmark, label: false), s(.share, label: false), s(.separator),
                s(.blocker), s(.darken), s(.reader), s(.javascript), s(.desktopSite), s(.translate), s(.find), s(.separator),
                s(.closeTab), s(.closeAllTabs), s(.separator),
                s(.back, label: false), s(.forward, label: false), s(.reload, label: false), s(.settings, label: false)]
    }()

    static func preset(_ p: Preset) -> ToolbarConfig {
        func s(_ a: ToolbarAction, _ size: ButtonSize = .medium) -> ToolbarSlot { ToolbarSlot(action: a, size: size) }
        let bar: [ToolbarSlot]
        switch p {
        case .complete: bar = [s(.back), s(.forward), s(.share), s(.newTab), s(.tabs), s(.menu)]
        case .navigation: bar = [s(.back), s(.forward), s(.tabs), s(.newTab), s(.closeTab)]
        case .tools: bar = [s(.back), s(.reload), s(.desktopSite), s(.reader), s(.tabs), s(.closeTab), s(.menu)]
        case .reader: bar = [s(.translate), s(.reader), s(.javascript), s(.scrollTop), s(.newTab), s(.tabs), s(.closeTab)]
        case .minimal: bar = [s(.address), s(.tabs), s(.menu)]
        case .zen: bar = [s(.newTab), s(.address), s(.tabs), s(.closeTab)]
        }
        return ToolbarConfig(bar: bar, menu: standardMenu)
    }

    enum Preset: String, CaseIterable, Identifiable {
        case complete, navigation, tools, reader, minimal, zen
        var id: String { rawValue }
        var label: String {
            switch self { case .complete: return "Complète"; case .navigation: return "Navigation"; case .tools: return "Outils"; case .reader: return "Lecteur"; case .minimal: return "Minimal"; case .zen: return "Zen" }
        }
        var description: String {
            switch self {
            case .complete: return "Les boutons essentiels, à portée de pouce."
            case .navigation: return "Précédent, suivant, onglets — et fermer d'un geste."
            case .tools: return "Recharger, version bureau et lecteur en accès direct."
            case .reader: return "Traduire, lecteur, JavaScript : pensée pour lire."
            case .minimal: return "L'adresse dans la barre, onglets et menu. Rien d'autre."
            case .zen: return "Une seule ligne : nouvel onglet, adresse, onglets, fermer."
            }
        }
    }
}
