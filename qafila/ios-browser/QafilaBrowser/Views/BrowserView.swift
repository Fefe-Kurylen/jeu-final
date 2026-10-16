import SwiftUI

/// Écran principal : la page occupe tout l'écran, la barre de Quiche flotte en bas (ou en haut), le menu s'ouvre en carte ancrée.
struct BrowserView: View {
    @EnvironmentObject var store: BrowserStore
    @Environment(\.colorScheme) private var scheme
    @Environment(\.verticalSizeClass) private var vClass
    @Environment(\.scenePhase) private var scenePhase
    @StateObject private var editor = AddressEditModel()
    @State private var chromeHeight: CGFloat = 100
    @State private var menuAnchor: CGRect = .zero

    private var s: Settings { store.settings }
    private var landscape: Bool { vClass == .compact }
    private var atTop: Bool { s.toolbar.position == .top || (landscape && s.landscapeTopBar) }
    private var palette: ChromePalette { ChromePalette.make(s, scheme: scheme, site: store.siteThemeColor) }
    private var floating: Bool { s.toolbar.style == .floating }
    private var collapsed: Bool { store.barsHidden && !store.isEditingAddress && !store.showMenu }

    var body: some View {
        GeometryReader { geo in
            let safe = geo.safeAreaInsets
            ZStack {
                web(safe)
                VStack(spacing: 0) {
                    if atTop { chrome(safe) }
                    Spacer(minLength: 0)
                    if !atTop { chrome(safe) }
                }
                if store.showMenu { menuLayer(geo) }
                if let t = store.toast { toast(t) }
            }
            .coordinateSpace(name: "browser")
            .onPreferenceChange(MenuAnchorKey.self) { menuAnchor = $0 }
        }
        .animation(.spring(response: 0.32, dampingFraction: 0.86), value: store.barsHidden)
        .animation(.spring(response: 0.3), value: store.toast)
        .animation(.spring(response: 0.3, dampingFraction: 0.86), value: store.isEditingAddress)
        .fullScreenCover(isPresented: $store.showTabs) { TabsView().environmentObject(store) }
        .sheet(isPresented: $store.showSettings, onDismiss: { store.settingsRoute = nil }) { SettingsView().environmentObject(store) }
        .sheet(isPresented: $store.showBookmarks) { BookmarksView().environmentObject(store) }
        .sheet(isPresented: $store.showHistory) { HistoryView().environmentObject(store) }
        .sheet(isPresented: $store.showToolbarEditor) { ToolbarEditorView().environmentObject(store) }
        .sheet(isPresented: $store.showToolbarGallery) { ToolbarGalleryView().environmentObject(store) }
        .onChange(of: store.selectedTabID) { _, _ in store.siteThemeColor = nil; store.barsHidden = false; store.showMenu = false }
        .onAppear { store.isDarkScheme = scheme == .dark }
        .onChange(of: scheme) { _, v in store.isDarkScheme = v == .dark }
        .onChange(of: scenePhase) { _, p in if p == .active { store.closeExpiredTabs() } }
        .onChange(of: s) { old, new in applyChanges(old, new) }
    }

    // MARK: Couches

    private func web(_ safe: EdgeInsets) -> some View {
        Group {
            if let tab = store.selectedTab {
                WebContainer(tabID: tab.id,
                             topInset: atTop ? chromeHeight + safe.top : safe.top,
                             bottomInset: atTop ? safe.bottom : chromeHeight + safe.bottom,
                             onScroll: handleScroll)
                    .id(tab.id)
            }
        }
        .ignoresSafeArea()
        .overlay(alignment: atTop ? .bottom : .top) {
            // Bande derrière la barre d'état (ou l'indicateur d'accueil) pour que la page ne s'y mélange pas.
            ChromeBackground(palette: palette, style: s.toolbar.style)
                .frame(height: atTop ? safe.bottom : safe.top)
                .ignoresSafeArea()
                .opacity((atTop && collapsed && s.scrollBehavior == .hide) || (atTop && floating) ? 0 : 1)
        }
    }

    @ViewBuilder private func chrome(_ safe: EdgeInsets) -> some View {
        VStack(spacing: 8) {
            if store.isEditingAddress && !atTop { SuggestionsPanel(editor: editor).padding(.horizontal, 10).transition(.move(edge: .bottom).combined(with: .opacity)) }
            Group {
                if collapsed && s.scrollBehavior == .shrink {
                    MiniChrome()
                } else {
                    ChromeBar(editor: editor, singleRow: landscape, atTop: atTop)
                }
            }
            .padding(.bottom, atTop ? 6 : (floating ? 4 : 0))
            .padding(.top, floating && atTop ? 2 : 0)
            .environment(\.chromeCard, palette.card)
            .modifier(SchemeOverride(scheme: palette.contentScheme))
            .background {
                if floating {
                    FloatingBarShape(palette: palette)
                } else {
                    ChromeBackground(palette: palette, style: s.toolbar.style).ignoresSafeArea(edges: atTop ? .top : .bottom)
                        .overlay(alignment: atTop ? .bottom : .top) { Rectangle().fill(Color.black.opacity(palette.contentScheme == .dark ? 0.35 : 0.07)).frame(height: 0.5) }
                }
            }
            .padding(.horizontal, floating ? 10 : 0)
            .padding(atTop ? .top : .bottom, floating ? 6 : 0)
            .background(GeometryReader { g in Color.clear.onAppear { chromeHeight = g.size.height }.onChange(of: g.size.height) { _, h in if !collapsed { chromeHeight = h } } })
            .offset(y: hideOffset(safe))
            if store.isEditingAddress && atTop { SuggestionsPanel(editor: editor).padding(.horizontal, 10) }
        }
    }

    private func hideOffset(_ safe: EdgeInsets) -> CGFloat {
        guard collapsed, s.scrollBehavior == .hide else { return 0 }
        return atTop ? -(chromeHeight + safe.top + 10) : chromeHeight + safe.bottom + 10
    }

    private func menuLayer(_ geo: GeometryProxy) -> some View {
        let width = geo.size.width
        let anchorX = menuAnchor == .zero ? width - 30 : menuAnchor.midX - geo.frame(in: .global).minX
        let x = min(max(anchorX + 26 - FloatingMenu.width, 10), width - FloatingMenu.width - 10)
        let available = geo.size.height - chromeHeight - 24
        return ZStack(alignment: atTop ? .topLeading : .bottomLeading) {
            Color.black.opacity(0.1).ignoresSafeArea()
                .onTapGesture { withAnimation(.easeOut(duration: 0.18)) { store.showMenu = false } }
            FloatingMenu()
                .frame(maxHeight: max(200, available))
                .fixedSize(horizontal: true, vertical: false)
                .padding(.leading, x)
                .padding(atTop ? .top : .bottom, chromeHeight + 8)
                .transition(.scale(scale: 0.85, anchor: atTop ? .topTrailing : .bottomTrailing).combined(with: .opacity))
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: atTop ? .topLeading : .bottomLeading)
    }

    private func toast(_ text: String) -> some View {
        Text(text)
            .font(.system(size: 14, weight: .medium))
            .padding(.horizontal, 16).padding(.vertical, 9)
            .background(.regularMaterial, in: Capsule())
            .shadow(color: .black.opacity(0.12), radius: 12, y: 4)
            .frame(maxHeight: .infinity, alignment: .top)
            .padding(.top, 8)
            .transition(.move(edge: .top).combined(with: .opacity))
    }

    // MARK: Comportements

    private func handleScroll(_ delta: CGFloat) {
        guard s.scrollBehavior != .fixed, !store.isEditingAddress, !store.showMenu else { return }
        if delta > 8, !store.barsHidden { store.barsHidden = true }
        else if delta < -8, store.barsHidden { store.barsHidden = false }
    }

    /// Les réglages modifiés s'appliquent immédiatement aux pages ouvertes.
    private func applyChanges(_ old: Settings, _ new: Settings) {
        let tm = store.tabManager
        if old.textZoom != new.textZoom || old.edgeSwipeNavigation != new.edgeSwipeNavigation { tm.applySettings() }
        if old.blockAds != new.blockAds || old.blockTrackers != new.blockTrackers || old.blockCookieBanners != new.blockCookieBanners
            || old.blockerDisabledHosts != new.blockerDisabledHosts { tm.applyRules() }
        if old.darkenSites != new.darkenSites || old.darkenOnlyInDarkMode != new.darkenOnlyInDarkMode { tm.refreshDarken() }
        if old.desktopByDefault != new.desktopByDefault || old.customUserAgent != new.customUserAgent {
            tm.applyUserAgentToOpenTabs()
        }
        if old.appIcon != new.appIcon, UIApplication.shared.supportsAlternateIcons {
            UIApplication.shared.setAlternateIconName(new.appIcon.iconName) { _ in }
        }
        if old.scrollBehavior != new.scrollBehavior { store.barsHidden = false }
    }
}
