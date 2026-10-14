import SwiftUI
@preconcurrency import WebKit
import Combine

/// Conserve une WKWebView par onglet (l'état de navigation survit aux changements d'onglet), applique les règles de blocage,
/// le mode sombre, le user agent, et remonte titre / URL / progression au store.
@MainActor
final class TabManager: NSObject, ObservableObject {
    weak var store: BrowserStore?
    @Published var progress: [UUID: Double] = [:]
    @Published var loading: Set<UUID> = []
    @Published var navState: [UUID: (back: Bool, forward: Bool)] = [:]
    @Published var readerActive: Set<UUID> = []

    private var views: [UUID: WKWebView] = [:]
    private var observers: [UUID: [NSKeyValueObservation]] = [:]
    private var adsRules: WKContentRuleList?
    private var cookieRules: WKContentRuleList?
    private let processPool = WKProcessPool()
    private lazy var privateDataStore = WKWebsiteDataStore.nonPersistent()

    override init() {
        super.init()
        ContentBlocker.compile { [weak self] ads, cookies in
            Task { @MainActor in self?.adsRules = ads; self?.cookieRules = cookies; self?.applyRules() }
        }
    }

    // MARK: Création
    func webView(for id: UUID) -> WKWebView {
        if let v = views[id] { return v }
        guard let tab = store?.tabs.first(where: { $0.id == id }) else { return WKWebView() }
        let config = WKWebViewConfiguration()
        config.processPool = processPool
        config.websiteDataStore = tab.isPrivate ? privateDataStore : .default()
        config.allowsInlineMediaPlayback = true
        config.defaultWebpagePreferences.preferredContentMode = .mobile
        let controller = WKUserContentController()
        controller.add(LeakAvoider(self), name: "furtif")
        controller.addUserScript(WKUserScript(source: Scripts.pageInfo, injectionTime: .atDocumentEnd, forMainFrameOnly: true))
        config.userContentController = controller

        let web = WKWebView(frame: .zero, configuration: config)
        web.navigationDelegate = self
        web.uiDelegate = self
        web.allowsBackForwardNavigationGestures = true
        web.allowsLinkPreview = true
        web.scrollView.contentInsetAdjustmentBehavior = .never
        web.isFindInteractionEnabled = true
        web.backgroundColor = .systemBackground
        web.isOpaque = false
        views[id] = web
        observe(web, id: id)
        applyRules(to: web)
        applyUserAgent(id)
        if let url = tab.url { web.load(URLRequest(url: url)) } else { loadStartPage(web) }
        return web
    }

    func discard(_ id: UUID) {
        observers[id]?.forEach { $0.invalidate() }
        observers[id] = nil
        views[id]?.removeFromSuperview()
        views[id] = nil
        progress[id] = nil; loading.remove(id); navState[id] = nil; readerActive.remove(id)
    }

    private func observe(_ web: WKWebView, id: UUID) {
        observers[id] = [
            web.observe(\.estimatedProgress) { [weak self] w, _ in Task { @MainActor in self?.progress[id] = w.estimatedProgress } },
            web.observe(\.isLoading) { [weak self] w, _ in Task { @MainActor in if w.isLoading { self?.loading.insert(id) } else { self?.loading.remove(id) } } },
            web.observe(\.title) { [weak self] w, _ in Task { @MainActor in self?.store?.update(id) { $0.title = w.title ?? "" } } },
            web.observe(\.url) { [weak self] w, _ in Task { @MainActor in
                guard let u = w.url, !u.absoluteString.hasPrefix("about:blank") else { return }
                self?.store?.update(id) { $0.url = u; $0.lastVisited = Date() }
                self?.readerActive.remove(id)
            } },
            web.observe(\.canGoBack) { [weak self] w, _ in Task { @MainActor in self?.navState[id] = (w.canGoBack, w.canGoForward) } },
            web.observe(\.canGoForward) { [weak self] w, _ in Task { @MainActor in self?.navState[id] = (w.canGoBack, w.canGoForward) } },
            web.observe(\.themeColor) { [weak self] w, _ in Task { @MainActor in
                guard let store = self?.store, store.settings.adaptToSiteColor, store.selectedTabID == id else { return }
                store.siteThemeColor = w.themeColor.map { Color(uiColor: $0) }
            } },
        ]
    }

    // MARK: Navigation
    func load(_ url: URL?, in id: UUID) {
        let web = webView(for: id)
        readerActive.remove(id)
        if let url { web.load(URLRequest(url: url)) } else { loadStartPage(web) }
    }

    private func loadStartPage(_ web: WKWebView) {
        web.loadHTMLString(StartPage.html(dark: UITraitCollection.current.userInterfaceStyle == .dark), baseURL: URL(string: "about:start"))
    }

    func findInPage(_ id: UUID) {
        webView(for: id).findInteraction?.presentFindNavigator(showingReplace: false)
    }

    func toggleReader(_ id: UUID) {
        let web = webView(for: id)
        if readerActive.contains(id) { web.goBack(); readerActive.remove(id); return }
        web.evaluateJavaScript(Scripts.reader) { [weak self] result, _ in
            guard let json = result as? String, let data = json.data(using: .utf8),
                  let obj = try? JSONSerialization.jsonObject(with: data) as? [String: String] else { return }
            let dark = UITraitCollection.current.userInterfaceStyle == .dark
            let html = Scripts.readerPage(title: obj["title"] ?? "", byline: obj["byline"] ?? "", html: obj["html"] ?? "", host: obj["host"] ?? "", dark: dark)
            web.loadHTMLString(html, baseURL: URL(string: obj["url"] ?? ""))
            Task { @MainActor in self?.readerActive.insert(id) }
        }
    }

    // MARK: Règles, mode sombre, user agent
    func applyRules() { views.values.forEach { applyRules(to: $0) } }
    private func applyRules(to web: WKWebView) {
        let c = web.configuration.userContentController
        c.removeAllContentRuleLists()
        guard let store, store.settings.blockerEnabled else { return }
        if let ads = adsRules { c.add(ads) }
        if store.settings.blockCookieBanners, let cookies = cookieRules { c.add(cookies) }
    }

    func applyDarken(_ id: UUID, enabled: Bool) {
        webView(for: id).evaluateJavaScript(Scripts.darken(enabled))
    }

    func applyUserAgent(_ id: UUID) {
        guard let store, let tab = store.tabs.first(where: { $0.id == id }) else { return }
        let web = webView(for: id)
        if !store.settings.customUserAgent.isEmpty { web.customUserAgent = store.settings.customUserAgent; return }
        if store.isDesktop(tab) {
            web.customUserAgent = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Safari/605.1.15"
            web.configuration.defaultWebpagePreferences.preferredContentMode = .desktop
        } else {
            web.customUserAgent = nil
            web.configuration.defaultWebpagePreferences.preferredContentMode = .mobile
        }
    }

    func snapshot(_ id: UUID, completion: @escaping (UIImage?) -> Void) {
        guard let web = views[id] else { completion(nil); return }
        let config = WKSnapshotConfiguration()
        config.afterScreenUpdates = false
        web.takeSnapshot(with: config) { img, _ in completion(img) }
    }

    private func tabID(for web: WKWebView) -> UUID? { views.first { $0.value === web }?.key }
}

// MARK: - Délégués WebKit
extension TabManager: WKNavigationDelegate, WKUIDelegate, WKScriptMessageHandler {
    func webView(_ webView: WKWebView, decidePolicyFor navigationAction: WKNavigationAction, preferences: WKWebpagePreferences, decisionHandler: @escaping (WKNavigationActionPolicy, WKWebpagePreferences) -> Void) {
        let url = navigationAction.request.url
        preferences.allowsContentJavaScript = store?.isJavaScriptEnabled(for: url) ?? true
        // Passage automatique en HTTPS
        if let store, store.settings.upgradeToHTTPS, let u = url, u.scheme == "http", navigationAction.targetFrame?.isMainFrame == true,
           var comps = URLComponents(url: u, resolvingAgainstBaseURL: false) {
            comps.scheme = "https"
            if let https = comps.url { webView.load(URLRequest(url: https)); decisionHandler(.cancel, preferences); return }
        }
        // Liens externes (tel:, mailto:, stores)
        if let u = url, let scheme = u.scheme, !["http", "https", "about", "file", "data", "blob"].contains(scheme) {
            UIApplication.shared.open(u); decisionHandler(.cancel, preferences); return
        }
        decisionHandler(.allow, preferences)
    }

    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
        guard let id = tabID(for: webView), let store else { return }
        if let tab = store.tabs.first(where: { $0.id == id }) {
            store.recordVisit(tab)
            if store.isDarkened(tab) { applyDarken(id, enabled: true) }
        }
    }

    func webView(_ webView: WKWebView, didFail navigation: WKNavigation!, withError error: Error) { showError(webView, error) }
    func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) { showError(webView, error) }
    private func showError(_ web: WKWebView, _ error: Error) {
        let e = error as NSError
        guard e.code != NSURLErrorCancelled, e.code != 102 else { return }
        web.loadHTMLString(StartPage.error(message: e.localizedDescription, url: e.userInfo[NSURLErrorFailingURLStringErrorKey] as? String ?? ""), baseURL: nil)
    }

    func webView(_ webView: WKWebView, createWebViewWith configuration: WKWebViewConfiguration, for navigationAction: WKNavigationAction, windowFeatures: WKWindowFeatures) -> WKWebView? {
        // target=_blank : on ouvre un nouvel onglet dans Furtif.
        if let u = navigationAction.request.url { store?.newTab(url: u, isPrivate: store?.selectedTab?.isPrivate ?? false) }
        return nil
    }

    func webView(_ webView: WKWebView, runJavaScriptAlertPanelWithMessage message: String, initiatedByFrame frame: WKFrameInfo, completionHandler: @escaping () -> Void) {
        let a = UIAlertController(title: webView.url?.host, message: message, preferredStyle: .alert)
        a.addAction(UIAlertAction(title: "OK", style: .default) { _ in completionHandler() })
        UIApplication.shared.topViewController?.present(a, animated: true)
    }

    func webView(_ webView: WKWebView, runJavaScriptConfirmPanelWithMessage message: String, initiatedByFrame frame: WKFrameInfo, completionHandler: @escaping (Bool) -> Void) {
        let a = UIAlertController(title: webView.url?.host, message: message, preferredStyle: .alert)
        a.addAction(UIAlertAction(title: "Annuler", style: .cancel) { _ in completionHandler(false) })
        a.addAction(UIAlertAction(title: "OK", style: .default) { _ in completionHandler(true) })
        UIApplication.shared.topViewController?.present(a, animated: true)
    }

    func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {
        guard let body = message.body as? [String: Any], body["type"] as? String == "pageInfo",
              let web = message.webView, let id = tabID(for: web) else { return }
        let minutes = body["minutes"] as? Int ?? 0
        let color = body["color"] as? String ?? ""
        let icon = body["icon"] as? String ?? ""
        store?.update(id) { $0.readingMinutes = minutes; if !color.isEmpty { $0.themeColorHex = color } }
        if let store, store.settings.adaptToSiteColor, store.selectedTabID == id, !color.isEmpty { store.siteThemeColor = Color(hex: color) }
        fetchFavicon(icon, host: web.url?.host, id: id)
    }

    private func fetchFavicon(_ icon: String, host: String?, id: UUID) {
        let candidates = [icon, host.map { "https://\($0)/apple-touch-icon.png" } ?? "", host.map { "https://\($0)/favicon.ico" } ?? ""].filter { !$0.isEmpty }
        Task.detached {
            for c in candidates {
                guard let u = URL(string: c), let result = try? await URLSession.shared.data(from: u),
                      (result.1 as? HTTPURLResponse)?.statusCode == 200, UIImage(data: result.0) != nil, result.0.count < 400_000 else { continue }
                let data = result.0
                await MainActor.run { [weak self] in self?.store?.update(id) { $0.faviconData = data } }
                return
            }
        }
    }
}

/// Évite le cycle de rétention WKUserContentController → handler.
@MainActor
final class LeakAvoider: NSObject, WKScriptMessageHandler {
    weak var delegate: WKScriptMessageHandler?
    init(_ delegate: WKScriptMessageHandler) { self.delegate = delegate }
    func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {
        delegate?.userContentController(userContentController, didReceive: message)
    }
}

extension Color {
    init?(hex: String) {
        var s = hex.trimmingCharacters(in: .whitespaces)
        if s.hasPrefix("#") { s.removeFirst() }
        guard s.count == 6 || s.count == 3, let v = UInt64(s.count == 3 ? s.map { "\($0)\($0)" }.joined() : s, radix: 16) else { return nil }
        self.init(red: Double((v >> 16) & 0xff) / 255, green: Double((v >> 8) & 0xff) / 255, blue: Double(v & 0xff) / 255)
    }
}
