import SwiftUI

/// Écran principal : page web + barre d'adresse + barre d'outils personnalisable. Les barres se masquent au défilement (lecture plein écran).
struct BrowserView: View {
    @EnvironmentObject var store: BrowserStore
    @Environment(\.colorScheme) private var scheme
    @State private var addressText = ""

    /// Clair ou sombre selon la luminance de la couleur du site, pour que les icônes restent lisibles.
    private var barScheme: ColorScheme? {
        guard store.settings.adaptToSiteColor, store.settings.toolbar.style == .classic, let c = store.siteThemeColor else { return nil }
        var r: CGFloat = 0, g: CGFloat = 0, b: CGFloat = 0, a: CGFloat = 0
        UIColor(c).getRed(&r, green: &g, blue: &b, alpha: &a)
        return (0.299 * r + 0.587 * g + 0.114 * b) > 0.6 ? .light : .dark
    }

    private var barTint: Color {
        if store.settings.adaptToSiteColor, let c = store.siteThemeColor { return c }
        return Color(.systemBackground)
    }

    var body: some View {
        GeometryReader { geo in
            ZStack(alignment: .bottom) {
                if let tab = store.selectedTab {
                    WebContainer(tabID: tab.id, topInset: topHeight(geo), bottomInset: bottomHeight(geo), onScroll: handleScroll)
                        .ignoresSafeArea()
                        .id(tab.id)
                }
                VStack(spacing: 0) {
                    if store.settings.toolbar.position == .top { topBars(geo) } else { addressBarSection(geo) }
                    Spacer(minLength: 0)
                    if store.settings.toolbar.position == .bottom { bottomBars(geo) }
                }
            }
        }
        .animation(.easeInOut(duration: 0.22), value: store.barsHidden)
        .sheet(isPresented: $store.showMenu) { MenuSheet().environmentObject(store) }
        .fullScreenCover(isPresented: $store.showTabs) { TabsView().environmentObject(store) }
        .sheet(isPresented: $store.showSettings) { SettingsView().environmentObject(store) }
        .sheet(isPresented: $store.showBookmarks) { BookmarksView().environmentObject(store) }
        .sheet(isPresented: $store.showHistory) { HistoryView().environmentObject(store) }
        .sheet(isPresented: $store.showToolbarEditor) { ToolbarEditorView().environmentObject(store) }
        .sheet(isPresented: $store.showToolbarGallery) { ToolbarGalleryView().environmentObject(store) }
        .onChange(of: store.selectedTabID) { _, _ in store.siteThemeColor = nil; store.barsHidden = false }
    }

    // MARK: Dispositions
    @ViewBuilder private func addressBarSection(_ geo: GeometryProxy) -> some View {
        AddressBar(text: $addressText)
            .padding(.horizontal, 12)
            .padding(.top, 6)
            .padding(.bottom, 8)
            .background(barTint.opacity(store.barsHidden ? 0 : 1).ignoresSafeArea(edges: .top))
            .modifier(SchemeOverride(scheme: barScheme))
            .offset(y: store.barsHidden ? -(topHeight(geo) + 20) : 0)
    }

    @ViewBuilder private func bottomBars(_ geo: GeometryProxy) -> some View {
        VStack(spacing: 0) {
            ProgressLine()
            ToolbarView(slots: store.settings.toolbar.bar)
        }
        .background(barBackground.ignoresSafeArea(edges: .bottom))
        .modifier(SchemeOverride(scheme: barScheme))
        .offset(y: store.barsHidden ? bottomHeight(geo) + 20 : 0)
    }

    @ViewBuilder private func topBars(_ geo: GeometryProxy) -> some View {
        VStack(spacing: 4) {
            AddressBar(text: $addressText).padding(.horizontal, 12).padding(.top, 6)
            ToolbarView(slots: store.settings.toolbar.bar)
            ProgressLine()
        }
        .background(barBackground.ignoresSafeArea(edges: .top))
        .modifier(SchemeOverride(scheme: barScheme))
        .offset(y: store.barsHidden ? -(topHeight(geo) + 40) : 0)
    }

    @ViewBuilder private var barBackground: some View {
        switch store.settings.toolbar.style {
        case .classic: barTint.overlay(Divider(), alignment: .top)
        case .glass: Rectangle().fill(.ultraThinMaterial)
        }
    }

    private func topHeight(_ geo: GeometryProxy) -> CGFloat {
        store.settings.toolbar.position == .top ? geo.safeAreaInsets.top + 112 : geo.safeAreaInsets.top + 58
    }
    private func bottomHeight(_ geo: GeometryProxy) -> CGFloat {
        store.settings.toolbar.position == .bottom ? geo.safeAreaInsets.bottom + 54 : geo.safeAreaInsets.bottom
    }

    private func handleScroll(_ delta: CGFloat) {
        guard store.settings.hideBarsOnScroll, !store.isEditingAddress else { return }
        if delta > 8, !store.barsHidden { store.barsHidden = true }
        else if delta < -8, store.barsHidden { store.barsHidden = false }
    }
}

/// Force le thème clair ou sombre d'une barre (sinon laisse celui du système).
struct SchemeOverride: ViewModifier {
    let scheme: ColorScheme?
    func body(content: Content) -> some View {
        if let scheme { content.environment(\.colorScheme, scheme) } else { content }
    }
}

/// Fine barre de progression bleue, comme dans les navigateurs iOS.
struct ProgressLine: View {
    @EnvironmentObject var store: BrowserStore
    var body: some View {
        let id = store.selectedTabID
        let p = id.flatMap { store.tabManager.progress[$0] } ?? 0
        let loading = id.map { store.tabManager.loading.contains($0) } ?? false
        GeometryReader { g in
            Rectangle().fill(Color.accentColor).frame(width: g.size.width * p).opacity(loading && p < 1 ? 1 : 0)
        }
        .frame(height: 2)
        .animation(.linear(duration: 0.2), value: p)
    }
}
