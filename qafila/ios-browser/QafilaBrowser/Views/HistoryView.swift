import SwiftUI

struct HistoryView: View {
    @EnvironmentObject var store: BrowserStore
    @Environment(\.dismiss) private var dismiss
    @State private var query = ""

    private var items: [HistoryEntry] {
        query.isEmpty ? store.history : store.history.filter { $0.title.localizedCaseInsensitiveContains(query) || $0.url.absoluteString.localizedCaseInsensitiveContains(query) }
    }
    private var sections: [(day: String, entries: [HistoryEntry])] {
        let f = DateFormatter(); f.dateStyle = .full; f.doesRelativeDateFormatting = true
        var order: [String] = []; var dict: [String: [HistoryEntry]] = [:]
        for e in items { let k = f.string(from: e.visitedAt); if dict[k] == nil { order.append(k) }; dict[k, default: []].append(e) }
        return order.map { (day: $0, entries: dict[$0]!) }
    }

    var body: some View {
        NavigationStack {
            List {
                ForEach(sections, id: \.day) { s in
                    Section(s.day) {
                        ForEach(s.entries) { e in
                            Button { open(e.url) } label: {
                                HStack(spacing: 12) {
                                    VStack(alignment: .leading, spacing: 2) {
                                        Text(e.title).font(.system(size: 15, weight: .medium)).foregroundStyle(.primary).lineLimit(2)
                                        Text(e.url.host ?? "").font(.system(size: 12)).foregroundStyle(.secondary)
                                    }
                                    Spacer()
                                    Text(e.visitedAt, style: .time).font(.system(size: 12)).foregroundStyle(.secondary)
                                }
                            }
                        }
                        .onDelete { idx in idx.map { s.entries[$0].id }.forEach { id in store.history.removeAll { $0.id == id } } }
                    }
                }
                if store.history.isEmpty { Text("Aucun historique. Les onglets privés n'y sont jamais enregistrés.").foregroundStyle(.secondary) }
            }
            .searchable(text: $query, prompt: "Rechercher dans l'historique")
            .navigationTitle("Historique")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarLeading) { Button("Effacer", role: .destructive) { store.clearHistory() }.disabled(store.history.isEmpty) }
                ToolbarItem(placement: .confirmationAction) { Button("OK") { dismiss() } }
            }
        }
    }

    private func open(_ url: URL) {
        if let id = store.selectedTabID { store.tabManager.load(url, in: id) }
        dismiss()
    }
}
