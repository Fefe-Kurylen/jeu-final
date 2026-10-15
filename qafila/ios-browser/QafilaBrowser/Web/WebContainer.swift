import SwiftUI
import WebKit

/// Affiche la WKWebView de l'onglet sélectionné dans un conteneur UIKit (changement d'onglet sans rechargement).
struct WebContainer: UIViewRepresentable {
    @EnvironmentObject var store: BrowserStore
    let tabID: UUID
    var topInset: CGFloat
    var bottomInset: CGFloat
    var onScroll: (CGFloat) -> Void

    func makeUIView(context: Context) -> UIView { UIView() }

    func updateUIView(_ container: UIView, context: Context) {
        let web = store.tabManager.webView(for: tabID)
        if web.superview !== container {
            container.subviews.forEach { $0.removeFromSuperview() }
            web.frame = container.bounds
            web.autoresizingMask = [.flexibleWidth, .flexibleHeight]
            container.addSubview(web)
            web.scrollView.delegate = context.coordinator
        }
        let insets = UIEdgeInsets(top: topInset, left: 0, bottom: bottomInset, right: 0)
        if web.scrollView.contentInset != insets {
            web.scrollView.contentInset = insets
            web.scrollView.scrollIndicatorInsets = insets
        }
        context.coordinator.onScroll = onScroll
    }

    func makeCoordinator() -> Coordinator { Coordinator(onScroll: onScroll) }

    final class Coordinator: NSObject, UIScrollViewDelegate {
        var onScroll: (CGFloat) -> Void
        private var last: CGFloat = 0
        init(onScroll: @escaping (CGFloat) -> Void) { self.onScroll = onScroll }
        func scrollViewDidScroll(_ s: UIScrollView) {
            let y = s.contentOffset.y + s.contentInset.top
            let delta = y - last
            last = y
            if y > 60 || delta < 0 { onScroll(delta) }
        }
        func scrollViewDidEndDragging(_ s: UIScrollView, willDecelerate d: Bool) { if s.contentOffset.y + s.contentInset.top < 60 { onScroll(-1000) } }
    }
}
