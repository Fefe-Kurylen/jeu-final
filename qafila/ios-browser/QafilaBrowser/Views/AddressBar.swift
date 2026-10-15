import SwiftUI

/// Barre d'adresse : icône du site, titre ou domaine, temps de lecture, cadenas ; passe en mode saisie avec suggestions.
struct AddressBar: View {
    @EnvironmentObject var store: BrowserStore
    @Binding var text: String
    @FocusState private var focused: Bool
    @State private var suggestions: [String] = []
    @State private var suggestTask: Task<Void, Never>?

    var body: some View {
        VStack(spacing: 6) {
            HStack(spacing: 10) {
                if store.isEditingAddress {
                    editingField
                } else {
                    display
                }
            }
            .padding(.horizontal, 14)
            .frame(height: 46)
            .background(Capsule().fill(Color(.secondarySystemBackground)))
            .overlay(Capsule().strokeBorder(store.isEditingAddress ? Color.accentColor.opacity(0.6) : .clear, lineWidth: 1.5))
            .contextMenu { addressContextMenu }

            if store.isEditingAddress, !suggestions.isEmpty {
                VStack(spacing: 0) {
                    ForEach(suggestions.prefix(6), id: \.self) { s in
                        Button { submit(s) } label: {
                            HStack(spacing: 12) {
                                Image(systemName: s.contains(".") && !s.contains(" ") ? "globe" : "magnifyingglass").foregroundStyle(.secondary).frame(width: 20)
                                Text(s).lineLimit(1).foregroundStyle(.primary)
                                Spacer()
                            }
                            .padding(.horizontal, 16).frame(height: 44)
                        }
                        Divider().padding(.leading, 48)
                    }
                }
                .background(RoundedRectangle(cornerRadius: 16).fill(Color(.secondarySystemBackground)))
            }
        }
    }

    private var tab: BrowserTab? { store.selectedTab }

    @ViewBuilder private var display: some View {
        HStack(spacing: 10) {
        Button {
            text = tab?.url?.absoluteString ?? ""
            store.isEditingAddress = true
            store.barsHidden = false
            focused = true
        } label: {
            HStack(spacing: 10) {
                if store.settings.addressShowsFavicon {
                    if let img = tab?.favicon { Image(uiImage: img).resizable().scaledToFit().frame(width: 20, height: 20).clipShape(RoundedRectangle(cornerRadius: 4)) }
                    else { Image(systemName: tab?.isPrivate == true ? "hand.raised.fill" : "globe").foregroundStyle(.secondary).frame(width: 20) }
                }
                VStack(alignment: .leading, spacing: 0) {
                    HStack(spacing: 4) {
                        if tab?.url?.scheme == "https" { Image(systemName: "lock.fill").font(.system(size: 10)).foregroundStyle(.secondary) }
                        Text(store.settings.addressShowsTitle ? (tab?.displayTitle ?? "") : (tab?.host ?? "Rechercher ou saisir une adresse"))
                            .font(.system(size: 16, weight: .medium)).lineLimit(1).foregroundStyle(tab?.url == nil ? .secondary : .primary)
                    }
                    if store.settings.addressShowsReadingTime, let r = tab?.readingLabel {
                        Text("\(r) de lecture").font(.system(size: 11)).foregroundStyle(.secondary)
                    }
                }
                Spacer(minLength: 0)
            }
            .foregroundStyle(.primary)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        if let id = tab?.id, store.tabManager.loading.contains(id) {
            Button { store.perform(.stop) } label: { Image(systemName: "xmark").font(.system(size: 14, weight: .semibold)).frame(width: 32, height: 32) }
        } else {
            Button { store.perform(.reload) } label: { Image(systemName: "arrow.clockwise").font(.system(size: 15, weight: .semibold)).frame(width: 32, height: 32) }
        }
        }
    }

    @ViewBuilder private var editingField: some View {
        Image(systemName: "magnifyingglass").foregroundStyle(.secondary)
        TextField("Rechercher ou saisir une adresse", text: $text)
            .focused($focused)
            .textInputAutocapitalization(.never).autocorrectionDisabled().keyboardType(.webSearch).submitLabel(.go)
            .onSubmit { submit(text) }
            .onChange(of: text) { _, v in fetchSuggestions(v) }
            .onAppear { DispatchQueue.main.asyncAfter(deadline: .now() + 0.05) { focused = true } }
        if !text.isEmpty {
            Button { text = "" } label: { Image(systemName: "xmark.circle.fill").foregroundStyle(.secondary) }
        }
        Button("Annuler") { cancel() }.font(.system(size: 15))
    }

    @ViewBuilder private var addressContextMenu: some View {
        Button { UIPasteboard.general.string = tab?.url?.absoluteString } label: { Label("Copier l'adresse", systemImage: "doc.on.doc") }
        Button { if let s = UIPasteboard.general.string { store.navigate(s) } } label: { Label("Coller et ouvrir", systemImage: "doc.on.clipboard") }
        Button { if let t = tab { store.toggleBookmark(t) } } label: { Label(tab.map { store.isBookmarked($0) } == true ? "Retirer des favoris" : "Ajouter aux favoris", systemImage: "star") }
        Button { store.perform(.desktopSite) } label: { Label(tab.map { store.isDesktop($0) } == true ? "Version mobile" : "Version bureau", systemImage: "desktopcomputer") }
        Button { store.perform(.javascript) } label: { Label(store.isJavaScriptEnabled(for: tab?.url) ? "Désactiver JavaScript ici" : "Activer JavaScript ici", systemImage: "curlybraces") }
    }

    private func submit(_ s: String) {
        guard !s.trimmingCharacters(in: .whitespaces).isEmpty else { cancel(); return }
        store.navigate(s)
        suggestions = []
        focused = false
    }
    private func cancel() { store.isEditingAddress = false; suggestions = []; focused = false }

    private func fetchSuggestions(_ q: String) {
        suggestTask?.cancel()
        let local = (store.history.map(\.url.absoluteString) + store.bookmarks.map(\.url.absoluteString)).filter { $0.contains(q.lowercased()) }.prefix(2)
        guard store.settings.showSuggestions, q.count >= 2, let base = store.settings.searchEngine.suggestURL ?? (store.settings.searchEngine == .qafila ? store.settings.searchBaseURL + "/api/suggest?q=" : nil) else { suggestions = Array(local); return }
        suggestTask = Task {
            try? await Task.sleep(nanoseconds: 150_000_000)
            guard !Task.isCancelled, let url = URL(string: base + (q.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed) ?? "")) else { return }
            guard let (data, _) = try? await URLSession.shared.data(from: url), let obj = try? JSONSerialization.jsonObject(with: data) else { return }
            var remote: [String] = []
            if let arr = obj as? [Any], arr.count >= 2, let list = arr[1] as? [String] { remote = list }      // format OpenSearch [q, [..]]
            else if let list = obj as? [String] { remote = list }                                              // Qafila /api/suggest
            else if let list = obj as? [[String: Any]] { remote = list.compactMap { $0["phrase"] as? String } } // DuckDuckGo
            await MainActor.run { suggestions = Array(local) + remote.prefix(5) }
        }
    }
}
