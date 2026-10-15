import SwiftUI

/// Barre d'outils inférieure : rend les emplacements configurés. Appui long sur un bouton → personnaliser.
struct ToolbarView: View {
    @EnvironmentObject var store: BrowserStore
    let slots: [ToolbarSlot]

    var body: some View {
        HStack(spacing: 0) {
            ForEach(slots) { slot in
                if slot.action == .separator {
                    Divider().frame(height: 22).padding(.horizontal, 4)
                } else {
                    ToolbarButton(slot: slot).frame(maxWidth: .infinity)
                }
            }
        }
        .padding(.horizontal, 8)
        .frame(height: 52)
        .contextMenu {
            Button { store.showToolbarEditor = true } label: { Label("Personnaliser la barre", systemImage: "slider.horizontal.3") }
            Button { store.showToolbarGallery = true } label: { Label("Galerie de barres", systemImage: "square.grid.2x2") }
        }
    }
}

struct ToolbarButton: View {
    @EnvironmentObject var store: BrowserStore
    let slot: ToolbarSlot

    private var tab: BrowserTab? { store.selectedTab }
    private var nav: (back: Bool, forward: Bool) { tab.flatMap { store.tabManager.navState[$0.id] } ?? (false, false) }

    private var isEnabled: Bool {
        switch slot.action {
        case .back: return nav.back
        case .forward: return nav.forward
        default: return true
        }
    }
    private var isActive: Bool {
        guard let t = tab else { return false }
        switch slot.action {
        case .blocker: return store.settings.blockerEnabled
        case .darken: return store.isDarkened(t)
        case .javascript: return store.isJavaScriptEnabled(for: t.url)
        case .desktopSite: return store.isDesktop(t)
        case .reader: return store.tabManager.readerActive.contains(t.id)
        case .addBookmark: return store.isBookmarked(t)
        default: return false
        }
    }

    var body: some View {
        Button { store.perform(slot.action) } label: {
            ZStack {
                Image(systemName: symbol)
                    .font(.system(size: slot.size.pointSize, weight: .medium))
                    .foregroundStyle(isEnabled ? (isActive ? Color.accentColor : .primary) : Color.secondary.opacity(0.5))
                if slot.action == .tabs {
                    Text("\(store.tabs.count)").font(.system(size: 10, weight: .bold)).foregroundStyle(.primary).offset(y: 1)
                }
            }
            .frame(width: 44, height: 44)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .disabled(!isEnabled)
        .accessibilityLabel(slot.action.label)
        .simultaneousGesture(LongPressGesture().onEnded { _ in
            if slot.action == .tabs { store.newTab() }
            if slot.action == .back { store.perform(.history) }
        })
    }

    private var symbol: String {
        switch slot.action {
        case .tabs: return "square"
        case .blocker: return store.settings.blockerEnabled ? "shield.fill" : "shield.slash"
        case .darken: return isActive ? "moon.stars.fill" : "moon.stars"
        case .javascript: return isActive ? "curlybraces" : "curlybraces.square"
        case .addBookmark: return isActive ? "star.fill" : "star"
        case .reload: return tab.map { store.tabManager.loading.contains($0.id) } == true ? "xmark" : "arrow.clockwise"
        default: return slot.action.symbol
        }
    }
}
