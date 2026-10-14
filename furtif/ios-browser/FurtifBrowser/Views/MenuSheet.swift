import SwiftUI

/// Menu principal, fidèle à Quiche : rangée « Nouvel onglet / Onglet privé », rangées d'icônes, lignes d'actions,
/// actions rouges de fermeture, puis navigation. Chaque élément est configurable dans l'éditeur.
struct MenuSheet: View {
    @EnvironmentObject var store: BrowserStore
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        ScrollView {
            VStack(spacing: 10) {
                ForEach(groupedRows(), id: \.id) { row in
                    switch row.kind {
                    case .separator: Divider().padding(.horizontal, 20).padding(.vertical, 2)
                    case .icons(let slots): iconRow(slots)
                    case .lines(let slots): VStack(spacing: 0) { ForEach(slots) { line($0) } }
                    }
                }
                Button { dismiss(); DispatchQueue.main.asyncAfter(deadline: .now() + 0.35) { store.showToolbarEditor = true } } label: {
                    Label("Personnaliser le menu", systemImage: "slider.horizontal.3").font(.system(size: 14)).foregroundStyle(.secondary)
                }.padding(.top, 8)
            }
            .padding(.vertical, 16)
        }
        .presentationDetents([.medium, .large])
        .presentationDragIndicator(.visible)
        .presentationBackground(.regularMaterial)
    }

    private struct Row: Identifiable { let id = UUID(); let kind: Kind; enum Kind { case separator, icons([ToolbarSlot]), lines([ToolbarSlot]) } }

    /// Regroupe les éléments consécutifs de même type (icônes seules ou lignes avec intitulé).
    private func groupedRows() -> [Row] {
        var rows: [Row] = []
        var icons: [ToolbarSlot] = []; var lines: [ToolbarSlot] = []
        func flush() {
            if !icons.isEmpty { rows.append(Row(kind: .icons(icons))); icons = [] }
            if !lines.isEmpty { rows.append(Row(kind: .lines(lines))); lines = [] }
        }
        for s in store.settings.toolbar.menu {
            if s.action == .separator { flush(); rows.append(Row(kind: .separator)); continue }
            if s.showsLabel { if !icons.isEmpty { flush() }; lines.append(s) } else { if !lines.isEmpty { flush() }; icons.append(s) }
        }
        flush()
        return rows
    }

    private func iconRow(_ slots: [ToolbarSlot]) -> some View {
        HStack(spacing: 0) {
            ForEach(slots) { slot in
                Button { act(slot.action) } label: {
                    VStack(spacing: 6) {
                        Image(systemName: slot.action.symbol).font(.system(size: slot.size.pointSize + 2, weight: .medium))
                        if slots.count <= 2 { Text(slot.action.label).font(.system(size: 12)) }
                    }
                    .frame(maxWidth: .infinity).frame(height: slots.count <= 2 ? 64 : 48)
                    .foregroundStyle(slot.action.isDestructive ? Color.red : .primary)
                }
            }
        }
        .padding(.horizontal, 12)
    }

    private func line(_ slot: ToolbarSlot) -> some View {
        Button { act(slot.action) } label: {
            HStack(spacing: 14) {
                Image(systemName: slot.action.symbol).font(.system(size: slot.size.pointSize, weight: .medium)).frame(width: 26)
                Text(lineLabel(slot.action)).font(.system(size: 17))
                Spacer()
                if let detail = lineDetail(slot.action) { Text(detail).font(.system(size: 14)).foregroundStyle(.secondary) }
            }
            .foregroundStyle(slot.action.isDestructive ? Color.red : .primary)
            .padding(.horizontal, 22).frame(height: 46)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
    }

    private func lineLabel(_ a: ToolbarAction) -> String {
        guard let t = store.selectedTab else { return a.label }
        switch a {
        case .blocker: return store.settings.blockerEnabled ? "Désactiver le bloqueur" : "Activer le bloqueur"
        case .darken: return store.isDarkened(t) ? "Ne plus assombrir" : "Assombrir"
        case .javascript: return store.isJavaScriptEnabled(for: t.url) ? "Désactiver JavaScript" : "Activer JavaScript"
        case .desktopSite: return store.isDesktop(t) ? "Version mobile" : "Version bureau"
        case .reader: return store.tabManager.readerActive.contains(t.id) ? "Quitter le lecteur" : "Lecteur"
        case .addBookmark: return store.isBookmarked(t) ? "Retirer des favoris" : "Ajouter aux favoris"
        case .closeTab: return "Fermer cet onglet"
        case .closeAllTabs: return "Fermer les \(store.tabs.count) onglets"
        default: return a.label
        }
    }
    private func lineDetail(_ a: ToolbarAction) -> String? {
        switch a {
        case .javascript, .darken, .desktopSite: return store.selectedTab?.host
        default: return nil
        }
    }

    private func act(_ a: ToolbarAction) {
        dismiss()
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.35) { store.perform(a) }
    }
}
