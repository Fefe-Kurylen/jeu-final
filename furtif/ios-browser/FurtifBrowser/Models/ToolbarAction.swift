import SwiftUI

/// Toutes les actions disponibles pour la barre d'outils et le menu (comme dans Quiche : chaque bouton peut être placé où l'on veut).
enum ToolbarAction: String, Codable, CaseIterable, Identifiable {
    case back, forward, reload, stop
    case tabs, newTab, newPrivateTab, closeTab, closeAllTabs
    case bookmarks, addBookmark, history, share, find
    case blocker, darken, reader, javascript, desktopSite, translate
    case scrollTop, scrollBottom, home, settings, customize, menu
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
        case .closeAllTabs: return "Tout fermer"
        case .bookmarks: return "Favoris"
        case .addBookmark: return "Ajouter aux favoris"
        case .history: return "Historique"
        case .share: return "Partager"
        case .find: return "Rechercher dans la page"
        case .blocker: return "Bloqueur"
        case .darken: return "Assombrir"
        case .reader: return "Lecteur"
        case .javascript: return "JavaScript"
        case .desktopSite: return "Site bureau"
        case .translate: return "Traduire"
        case .scrollTop: return "Haut de page"
        case .scrollBottom: return "Bas de page"
        case .home: return "Accueil"
        case .settings: return "Réglages"
        case .customize: return "Personnaliser"
        case .menu: return "Menu"
        case .separator: return "Séparateur"
        }
    }

    var symbol: String {
        switch self {
        case .back: return "chevron.left"
        case .forward: return "chevron.right"
        case .reload: return "arrow.clockwise"
        case .stop: return "xmark"
        case .tabs: return "square.on.square"
        case .newTab: return "plus.square.on.square"
        case .newPrivateTab: return "plus.square.on.square.dashed"
        case .closeTab: return "xmark"
        case .closeAllTabs: return "xmark.square.fill"
        case .bookmarks: return "star"
        case .addBookmark: return "star.fill"
        case .history: return "clock"
        case .share: return "square.and.arrow.up"
        case .find: return "doc.text.magnifyingglass"
        case .blocker: return "shield"
        case .darken: return "moon.stars"
        case .reader: return "doc.plaintext"
        case .javascript: return "curlybraces"
        case .desktopSite: return "desktopcomputer"
        case .translate: return "character.bubble"
        case .scrollTop: return "arrow.up.to.line"
        case .scrollBottom: return "arrow.down.to.line"
        case .home: return "house"
        case .settings: return "gearshape"
        case .customize: return "slider.horizontal.3"
        case .menu: return "ellipsis"
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
    var pointSize: CGFloat { switch self { case .small: return 15; case .medium: return 19; case .large: return 23 } }
}

/// Un emplacement dans la barre ou le menu.
struct ToolbarSlot: Identifiable, Codable, Equatable {
    var id: UUID = UUID()
    var action: ToolbarAction
    var size: ButtonSize = .medium
    /// Dans le menu : afficher l'intitulé à côté de l'icône (ligne) plutôt qu'une icône seule (rangée).
    var showsLabel: Bool = true
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

/// Configuration complète : barre + menu, comme la « Toolbar Gallery » de Quiche.
struct ToolbarConfig: Codable, Equatable {
    var bar: [ToolbarSlot]
    var menu: [ToolbarSlot]
    var style: ToolbarStyle = .classic
    var position: ToolbarPosition = .bottom

    static func preset(_ p: Preset) -> ToolbarConfig {
        func s(_ a: ToolbarAction, _ size: ButtonSize = .medium, label: Bool = true) -> ToolbarSlot { ToolbarSlot(action: a, size: size, showsLabel: label) }
        switch p {
        case .complete:
            return ToolbarConfig(
                bar: [s(.back), s(.forward), s(.share), s(.bookmarks), s(.tabs), s(.menu)],
                menu: [s(.newTab), s(.newPrivateTab), s(.separator),
                       s(.history, label: false), s(.addBookmark, label: false), s(.javascript, label: false), s(.share, label: false), s(.separator),
                       s(.blocker), s(.darken), s(.reader), s(.desktopSite), s(.find), s(.separator),
                       s(.closeTab), s(.closeAllTabs), s(.separator), s(.back, label: false), s(.forward, label: false), s(.reload, label: false)])
        case .minimal:
            return ToolbarConfig(
                bar: [s(.tabs, .large), s(.menu, .large)],
                menu: [s(.newTab), s(.newPrivateTab), s(.separator), s(.bookmarks), s(.history), s(.share), s(.separator),
                       s(.blocker), s(.darken), s(.reader), s(.separator), s(.closeTab), s(.closeAllTabs), s(.separator), s(.back, label: false), s(.forward, label: false), s(.reload, label: false)])
        case .gestures:
            return ToolbarConfig(
                bar: [s(.reader), s(.javascript), s(.tabs), s(.newTab), s(.menu)],
                menu: [s(.newPrivateTab), s(.bookmarks), s(.history), s(.share), s(.separator), s(.blocker), s(.darken), s(.desktopSite), s(.find), s(.separator), s(.closeTab), s(.closeAllTabs)])
        case .reading:
            return ToolbarConfig(
                bar: [s(.back), s(.reader, .large), s(.darken), s(.scrollTop), s(.tabs), s(.menu)],
                menu: [s(.newTab), s(.newPrivateTab), s(.separator), s(.bookmarks), s(.history), s(.share), s(.find), s(.separator), s(.blocker), s(.javascript), s(.desktopSite), s(.separator), s(.closeTab), s(.closeAllTabs)])
        }
    }

    enum Preset: String, CaseIterable, Identifiable {
        case complete, minimal, gestures, reading
        var id: String { rawValue }
        var label: String {
            switch self { case .complete: return "Complète"; case .minimal: return "Minimaliste"; case .gestures: return "Gestes"; case .reading: return "Lecture" }
        }
        var description: String {
            switch self {
            case .complete: return "Tous les boutons classiques à portée de pouce."
            case .minimal: return "Deux boutons seulement : onglets et menu. Navigation par gestes de bord d'écran."
            case .gestures: return "Lecteur et JavaScript en accès direct, sans Précédent/Suivant."
            case .reading: return "Pensée pour les longs articles : lecteur, assombrir, haut de page."
            }
        }
    }
}
