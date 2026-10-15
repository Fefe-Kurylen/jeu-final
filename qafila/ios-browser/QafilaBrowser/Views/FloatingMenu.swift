import SwiftUI

/// Menu de Quiche : carte translucide ancrée au-dessus du bouton menu. Les éléments sans intitulé forment des rangées de tuiles,
/// les autres des lignes (intitulé à gauche, icône à droite). Fermetures en rouge. Entièrement configurable dans l'éditeur.
struct FloatingMenu: View {
    @EnvironmentObject var store: BrowserStore
    static let width: CGFloat = 256

    var body: some View {
        ViewThatFits(in: .vertical) {
            content
            ScrollView(showsIndicators: false) { content }
        }
        .frame(width: Self.width)
        .background(.regularMaterial, in: RoundedRectangle(cornerRadius: 18, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: 18, style: .continuous).strokeBorder(Color.primary.opacity(0.07), lineWidth: 0.5))
        .clipShape(RoundedRectangle(cornerRadius: 18, style: .continuous))
        .shadow(color: .black.opacity(0.16), radius: 28, y: 10)
    }

    private var content: some View {
        VStack(spacing: 0) {
            ForEach(Array(rows.enumerated()), id: \.offset) { _, row in
                switch row {
                case .gap: Color.primary.opacity(0.06).frame(height: 6)
                case .tiles(let slots): tileRow(slots)
                case .lines(let slots):
                    VStack(spacing: 0) {
                        ForEach(Array(slots.enumerated()), id: \.element.id) { i, slot in
                            if i > 0 { Divider().padding(.leading, 16) }
                            line(slot)
                        }
                    }
                }
            }
        }
    }

    private enum Row { case gap, tiles([ToolbarSlot]), lines([ToolbarSlot]) }

    /// Regroupe les éléments consécutifs de même nature ; les séparateurs deviennent des espacements.
    private var rows: [Row] {
        var out: [Row] = []
        var tiles: [ToolbarSlot] = [], lines: [ToolbarSlot] = []
        func flush() {
            if !tiles.isEmpty { out.append(.tiles(tiles)); tiles = [] }
            if !lines.isEmpty { out.append(.lines(lines)); lines = [] }
        }
        for s in store.settings.toolbar.menu where s.action != .address && s.action != .menu {
            if s.action == .separator {
                flush()
                if let last = out.last, case .gap = last {} else if !out.isEmpty { out.append(.gap) }
                continue
            }
            if s.showsLabel { if !tiles.isEmpty { flush() }; lines.append(s) } else { if !lines.isEmpty { flush() }; tiles.append(s) }
        }
        flush()
        if let last = out.last, case .gap = last { out.removeLast() }
        return out
    }

    private func tileRow(_ slots: [ToolbarSlot]) -> some View {
        let labelled = slots.count <= 2
        return HStack(spacing: 0) {
            ForEach(Array(slots.enumerated()), id: \.element.id) { i, slot in
                if i > 0 { Divider().frame(height: labelled ? 36 : 24) }
                Button { act(slot.action) } label: {
                    VStack(spacing: 5) {
                        ActionGlyph(action: slot.action, size: labelled ? 19 : 18)
                        if labelled { Text(slot.action.label).font(.system(size: 12)).foregroundStyle(.primary).lineLimit(1) }
                    }
                    .frame(maxWidth: .infinity).frame(height: labelled ? 62 : 48)
                    .contentShape(Rectangle())
                }
                .buttonStyle(MenuPressStyle())
                .foregroundStyle(slot.action.isDestructive ? Color.red : Color.primary)
                .disabled(!enabled(slot.action))
                .opacity(enabled(slot.action) ? 1 : 0.3)
                .accessibilityLabel(slot.action.label)
            }
        }
    }

    private func line(_ slot: ToolbarSlot) -> some View {
        Button { act(slot.action) } label: {
            HStack(spacing: 12) {
                Text(lineLabel(slot.action)).font(.system(size: 15.5)).lineLimit(1)
                Spacer(minLength: 6)
                if slot.action.isDestructive {
                    Image(systemName: slot.action.symbol).font(.system(size: 16, weight: store.settings.buttonWeight.fontWeight))
                } else {
                    ActionGlyph(action: slot.action, size: 16)
                }
            }
            .foregroundStyle(slot.action.isDestructive ? Color.red : Color.primary)
            .padding(.horizontal, 16).frame(height: 43)
            .contentShape(Rectangle())
        }
        .buttonStyle(MenuPressStyle())
    }

    private func enabled(_ a: ToolbarAction) -> Bool {
        guard let t = store.selectedTab else { return true }
        let nav = store.tabManager.navState[t.id] ?? (false, false)
        switch a {
        case .back: return nav.back
        case .forward: return nav.forward
        default: return true
        }
    }

    private func lineLabel(_ a: ToolbarAction) -> String {
        guard let t = store.selectedTab else { return a.label }
        switch a {
        case .blocker: return store.isBlockerActive(for: t.url) ? "Désactiver le bloqueur" : "Activer le bloqueur"
        case .darken: return store.isDarkened(t) ? "Ne plus assombrir" : "Assombrir le site"
        case .javascript: return store.isJavaScriptEnabled(for: t.url) ? "Désactiver JavaScript" : "Activer JavaScript"
        case .desktopSite: return store.isDesktop(t) ? "Version mobile" : "Version bureau"
        case .reader: return store.tabManager.readerActive.contains(t.id) ? "Quitter le lecteur" : "Lecteur"
        case .addBookmark: return store.isBookmarked(t) ? "Retirer des favoris" : "Ajouter aux favoris"
        case .closeTab: return "Fermer l'onglet"
        case .closeAllTabs: return store.tabs.count > 1 ? "Fermer les \(store.tabs.count) onglets" : "Fermer tous les onglets"
        case .translate: return "Traduire en \(store.settings.translateLanguage.label.lowercased())"
        default: return a.label
        }
    }

    private func act(_ a: ToolbarAction) {
        withAnimation(.easeOut(duration: 0.18)) { store.showMenu = false }
        store.perform(a)
    }
}

/// Retour visuel discret à l'appui, comme les menus iOS.
struct MenuPressStyle: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        configuration.label.background(Color.primary.opacity(configuration.isPressed ? 0.08 : 0))
    }
}
