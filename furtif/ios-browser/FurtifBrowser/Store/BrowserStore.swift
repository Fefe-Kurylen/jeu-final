import SwiftUI
import Combine
import UIKit

/// État global : onglets, favoris, historique, réglages. Persisté en JSON dans Application Support.
@MainActor
final class BrowserStore: ObservableObject {
    @Published var tabs: [BrowserTab] = []
    @Published var selectedTabID: UUID?
    @Published var bookmarks: [Bookmark] = []
    @Published var history: [HistoryEntry] = []
    @Published var settings: Settings = Settings() { didSet { scheduleSave() } }

    // UI
    @Published var showTabs = false
    @Published var showMenu = false
    @Published var showSettings = false
    @Published var showBookmarks = false
    @Published var showHistory = false
    @Published var showToolbarEditor = false
    @Published var showToolbarGallery = false
    @Published var isEditingAddress = false
    @Published var siteThemeColor: Color?
    @Published var barsHidden = false

    let tabManager: TabManager
    private var saveTask: Task<Void, Never>?
    private var cancellables = Set<AnyCancellable>()

    init() {
        tabManager = TabManager()
        load()
        applyDemoIfRequested()
        if tabs.isEmpty { newTab() }
        if selectedTabID == nil { selectedTabID = tabs.first?.id }
        tabManager.store = self
        // Les vues observent le store : on relaie les changements du gestionnaire d'onglets (progression, état de navigation…).
        tabManager.objectWillChange.sink { [weak self] _ in self?.objectWillChange.send() }.store(in: &cancellables)
        $tabs.sink { [weak self] _ in self?.scheduleSave() }.store(in: &cancellables)
        $bookmarks.sink { [weak self] _ in self?.scheduleSave() }.store(in: &cancellables)
        $history.sink { [weak self] _ in self?.scheduleSave() }.store(in: &cancellables)
        $selectedTabID.sink { [weak self] _ in self?.scheduleSave() }.store(in: &cancellables)
    }

    // MARK: Onglets
    var selectedTab: BrowserTab? { tabs.first { $0.id == selectedTabID } }
    var selectedIndex: Int? { tabs.firstIndex { $0.id == selectedTabID } }

    func newTab(url: URL? = nil, isPrivate: Bool = false, select: Bool = true) {
        var tab = BrowserTab(isPrivate: isPrivate)
        tab.url = url ?? newTabURL()
        tabs.append(tab)
        if select { selectedTabID = tab.id }
        haptic(.light)
    }

    func openTab(url: URL) { newTab(url: url) }

    func close(tabID: UUID) {
        guard let idx = tabs.firstIndex(where: { $0.id == tabID }) else { return }
        tabs.remove(at: idx)
        tabManager.discard(tabID)
        if selectedTabID == tabID { selectedTabID = tabs[safe: min(idx, tabs.count - 1)]?.id }
        if tabs.isEmpty { newTab() }
        haptic(.medium)
    }

    func closeAllTabs() {
        for t in tabs { tabManager.discard(t.id) }
        tabs.removeAll()
        newTab()
        haptic(.heavy)
    }

    func update(_ tabID: UUID, _ change: (inout BrowserTab) -> Void) {
        guard let idx = tabs.firstIndex(where: { $0.id == tabID }) else { return }
        change(&tabs[idx])
    }

    func newTabURL() -> URL? {
        switch settings.newTabPage {
        case .start: return nil
        case .blank: return URL(string: "about:blank")
        case .search: return settings.searchEngine.url(for: "", base: settings.searchBaseURL).flatMap { URL(string: $0.absoluteString.components(separatedBy: "?").first ?? "") }
        case .custom: return URL(string: settings.newTabCustomURL)
        }
    }

    // MARK: Navigation
    func navigate(_ text: String) {
        guard let tab = selectedTab else { return }
        let url = urlFromInput(text)
        tabManager.load(url, in: tab.id)
        isEditingAddress = false
    }

    func urlFromInput(_ raw: String) -> URL {
        let t = raw.trimmingCharacters(in: .whitespacesAndNewlines)
        if let u = URL(string: t), let scheme = u.scheme, ["http", "https", "about", "file"].contains(scheme) { return u }
        let looksLikeHost = !t.contains(" ") && t.contains(".") && !t.hasSuffix(".")
        if looksLikeHost, let u = URL(string: (settings.upgradeToHTTPS ? "https://" : "http://") + t) { return u }
        return settings.searchEngine.url(for: t, base: settings.searchBaseURL) ?? URL(string: "https://duckduckgo.com")!
    }

    func perform(_ action: ToolbarAction) {
        guard let tab = selectedTab else { return }
        let web = tabManager.webView(for: tab.id)
        haptic(.light)
        switch action {
        case .back: web.goBack()
        case .forward: web.goForward()
        case .reload: web.reload()
        case .stop: web.stopLoading()
        case .tabs: showTabs = true
        case .newTab: newTab()
        case .newPrivateTab: newTab(isPrivate: true)
        case .closeTab: close(tabID: tab.id)
        case .closeAllTabs: closeAllTabs()
        case .bookmarks: showBookmarks = true
        case .addBookmark: toggleBookmark(tab)
        case .history: showHistory = true
        case .share: share(tab)
        case .find: tabManager.findInPage(tab.id)
        case .blocker: settings.blockerEnabled.toggle(); tabManager.applyRules(); web.reload()
        case .darken: toggleDarken(tab)
        case .reader: tabManager.toggleReader(tab.id)
        case .javascript: toggleJavaScript(tab); web.reload()
        case .desktopSite: toggleDesktop(tab); web.reload()
        case .translate:
            if let u = tab.url, let t = URL(string: "https://translate.google.com/translate?sl=auto&tl=fr&u=" + (u.absoluteString.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed) ?? "")) { tabManager.load(t, in: tab.id) }
        case .scrollTop: web.evaluateJavaScript("window.scrollTo({top:0,behavior:'smooth'})")
        case .scrollBottom: web.evaluateJavaScript("window.scrollTo({top:document.body.scrollHeight,behavior:'smooth'})")
        case .home: tabManager.load(newTabURL(), in: tab.id)
        case .settings: showSettings = true
        case .customize: showToolbarEditor = true
        case .menu: showMenu = true
        case .separator: break
        }
    }

    // MARK: Réglages par site
    func isJavaScriptEnabled(for url: URL?) -> Bool {
        guard settings.javascriptEnabled else { return false }
        guard let h = url?.host else { return true }
        return !settings.javascriptDisabledHosts.contains(h)
    }
    func toggleJavaScript(_ tab: BrowserTab) {
        guard let h = tab.url?.host else { settings.javascriptEnabled.toggle(); return }
        if settings.javascriptDisabledHosts.contains(h) { settings.javascriptDisabledHosts.remove(h) } else { settings.javascriptDisabledHosts.insert(h) }
    }
    func isDarkened(_ tab: BrowserTab) -> Bool {
        guard let h = tab.url?.host else { return settings.darkenSites }
        return settings.darkenSites != settings.darkenHosts.contains(h)
    }
    func toggleDarken(_ tab: BrowserTab) {
        guard let h = tab.url?.host else { settings.darkenSites.toggle(); return }
        if settings.darkenHosts.contains(h) { settings.darkenHosts.remove(h) } else { settings.darkenHosts.insert(h) }
        tabManager.applyDarken(tab.id, enabled: isDarkened(tab))
    }
    func isDesktop(_ tab: BrowserTab) -> Bool { tab.url?.host.map { settings.desktopHosts.contains($0) } ?? false }
    func toggleDesktop(_ tab: BrowserTab) {
        guard let h = tab.url?.host else { return }
        if settings.desktopHosts.contains(h) { settings.desktopHosts.remove(h) } else { settings.desktopHosts.insert(h) }
        tabManager.applyUserAgent(tab.id)
    }

    // MARK: Favoris & historique
    func isBookmarked(_ tab: BrowserTab) -> Bool { tab.url.map { u in bookmarks.contains { $0.url == u } } ?? false }
    func toggleBookmark(_ tab: BrowserTab) {
        guard let u = tab.url else { return }
        if let i = bookmarks.firstIndex(where: { $0.url == u }) { bookmarks.remove(at: i) } else { bookmarks.insert(Bookmark(title: tab.displayTitle, url: u), at: 0) }
    }
    func recordVisit(_ tab: BrowserTab) {
        guard !tab.isPrivate, let u = tab.url, u.scheme?.hasPrefix("http") == true else { return }
        if let last = history.first, last.url == u { history[0].title = tab.displayTitle; return }
        history.insert(HistoryEntry(title: tab.displayTitle, url: u), at: 0)
        if history.count > 2000 { history.removeLast(history.count - 2000) }
    }
    func clearHistory() { history.removeAll() }

    func share(_ tab: BrowserTab) {
        guard let u = tab.url else { return }
        let av = UIActivityViewController(activityItems: [u], applicationActivities: nil)
        UIApplication.shared.topViewController?.present(av, animated: true)
    }

    func haptic(_ style: UIImpactFeedbackGenerator.FeedbackStyle) {
        guard settings.haptics else { return }
        UIImpactFeedbackGenerator(style: style).impactOccurred()
    }

    // MARK: Mode démo (captures d'écran des stores) : lancer avec -FurtifDemo page|menu|tabs|editor|settings|gallery
    private func applyDemoIfRequested() {
        let args = ProcessInfo.processInfo.arguments
        guard let i = args.firstIndex(of: "-FurtifDemo"), i + 1 < args.count else { return }
        let screen = args[i + 1]
        let demo: [(String, String, Int)] = [
            ("https://fr.wikipedia.org/wiki/Tour_Eiffel", "Tour Eiffel — Wikipédia", 24),
            ("https://fr.wikipedia.org/wiki/Gustave_Eiffel", "Gustave Eiffel — Wikipédia", 15),
            ("https://fr.wikipedia.org/wiki/Paris", "Paris — Wikipédia", 41),
            ("https://www.marmiton.org/recettes/recette_pate-a-crepes_12372.aspx", "La meilleure recette de pâte à crêpes - Marmiton", 4),
            ("https://www.marmiton.org/recettes/recette_gateau-au-chocolat-fondant-rapide_166352.aspx", "Gâteau au chocolat fondant rapide - Marmiton", 3),
            ("https://github.com/Fefe-Kurylen/jeu-final", "Fefe-Kurylen/jeu-final - GitHub", 2),
            ("https://www.openstreetmap.org", "OpenStreetMap", 1),
        ]
        tabs = demo.map { BrowserTab(url: URL(string: $0.0), title: $0.1, readingMinutes: $0.2) }
        selectedTabID = tabs.first?.id
        settings.toolbar = .preset(.complete)
        settings.tabsLayout = .list
        settings.groupTabsByDomain = true
        DispatchQueue.main.asyncAfter(deadline: .now() + 6) { [weak self] in
            guard let self else { return }
            switch screen {
            case "menu": self.showMenu = true
            case "tabs": self.showTabs = true
            case "editor": self.showToolbarEditor = true
            case "settings": self.showSettings = true
            case "gallery": self.showToolbarGallery = true
            default: break
            }
        }
    }

    // MARK: Persistance
    private struct Snapshot: Codable { var tabs: [BrowserTab]; var selected: UUID?; var bookmarks: [Bookmark]; var history: [HistoryEntry]; var settings: Settings }
    private var fileURL: URL {
        let dir = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0].appendingPathComponent("Furtif", isDirectory: true)
        try? FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
        return dir.appendingPathComponent("state.json")
    }
    private func load() {
        guard let data = try? Data(contentsOf: fileURL), let s = try? JSONDecoder().decode(Snapshot.self, from: data) else { return }
        tabs = s.tabs.filter { !$0.isPrivate }   // les onglets privés ne survivent pas au redémarrage
        selectedTabID = s.selected
        bookmarks = s.bookmarks
        history = s.history
        settings = s.settings
    }
    private func scheduleSave() {
        saveTask?.cancel()
        saveTask = Task { [weak self] in
            try? await Task.sleep(nanoseconds: 400_000_000)
            guard !Task.isCancelled, let self else { return }
            let snap = Snapshot(tabs: self.tabs, selected: self.selectedTabID, bookmarks: self.bookmarks, history: self.history, settings: self.settings)
            if let data = try? JSONEncoder().encode(snap) { try? data.write(to: self.fileURL, options: .atomic) }
        }
    }
}

extension Array {
    subscript(safe i: Int) -> Element? { indices.contains(i) ? self[i] : nil }
}

extension UIApplication {
    var topViewController: UIViewController? {
        let scene = connectedScenes.compactMap { $0 as? UIWindowScene }.first { $0.activationState == .foregroundActive } ?? connectedScenes.compactMap { $0 as? UIWindowScene }.first
        var vc = scene?.keyWindow?.rootViewController
        while let p = vc?.presentedViewController { vc = p }
        return vc
    }
}
