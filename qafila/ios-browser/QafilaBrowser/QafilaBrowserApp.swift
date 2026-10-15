import SwiftUI

@main
struct QafilaBrowserApp: App {
    @StateObject private var store = BrowserStore()

    var body: some Scene {
        WindowGroup {
            BrowserView()
                .environmentObject(store)
                .tint(store.settings.accent.color)
                .preferredColorScheme(store.settings.appearance.colorScheme)
                .onOpenURL { url in store.openTab(url: url) }
        }
    }
}
