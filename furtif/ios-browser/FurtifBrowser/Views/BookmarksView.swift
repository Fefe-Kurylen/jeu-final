import SwiftUI

struct BookmarksView: View {
    @EnvironmentObject var store: BrowserStore
    @Environment(\.dismiss) private var dismiss
    @State private var query = ""

    private var items: [Bookmark] {
        query.isEmpty ? store.bookmarks : store.bookmarks.filter { $0.title.localizedCaseInsensitiveContains(query) || $0.url.absoluteString.localizedCaseInsensitiveContains(query) }
    }

    var body: some View {
        NavigationStack {
            List {
                if let t = store.selectedTab, t.url != nil, !store.isBookmarked(t) {
                    Button { store.toggleBookmark(t) } label: { Label("Ajouter « \(t.displayTitle) »", systemImage: "star.fill") }
                }
                ForEach(items) { b in
                    Button { open(b.url) } label: {
                        VStack(alignment: .leading, spacing: 2) {
                            Text(b.title).font(.system(size: 15, weight: .medium)).foregroundStyle(.primary).lineLimit(2)
                            Text(b.url.host ?? b.url.absoluteString).font(.system(size: 12)).foregroundStyle(.secondary)
                        }
                    }
                }
                .onDelete { idx in idx.map { items[$0].id }.forEach { id in store.bookmarks.removeAll { $0.id == id } } }
                .onMove { store.bookmarks.move(fromOffsets: $0, toOffset: $1) }
                if store.bookmarks.isEmpty { Text("Aucun favori pour l'instant.").foregroundStyle(.secondary) }
            }
            .searchable(text: $query, prompt: "Rechercher dans les favoris")
            .navigationTitle("Favoris")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarLeading) { EditButton() }
                ToolbarItem(placement: .confirmationAction) { Button("OK") { dismiss() } }
            }
        }
    }

    private func open(_ url: URL) {
        if let id = store.selectedTabID { store.tabManager.load(url, in: id) }
        dismiss()
    }
}
