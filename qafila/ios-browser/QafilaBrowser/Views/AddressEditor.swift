import SwiftUI

/// État de la saisie d'adresse, partagé entre le champ (dans la barre) et le panneau de suggestions (au-dessus).
@MainActor
final class AddressEditModel: ObservableObject {
    @Published var text = ""
    @Published var suggestions: [String] = []
    private var task: Task<Void, Never>?

    func fetch(_ q: String, store: BrowserStore) {
        task?.cancel()
        let lower = q.lowercased()
        let local = Array(Set((store.bookmarks.map(\.url.absoluteString) + store.history.map(\.url.absoluteString)).filter { $0.lowercased().contains(lower) }).prefix(2))
        let s = store.settings
        let allowed: Bool = {
            switch s.suggestions {
            case .everywhere: return true
            case .notPrivate: return store.selectedTab?.isPrivate != true
            case .never: return false
            }
        }()
        guard allowed, q.count >= 2, let base = s.searchEngine.suggestURL(settings: s) else { suggestions = q.isEmpty ? [] : local; return }
        task = Task { [weak self] in
            try? await Task.sleep(nanoseconds: 150_000_000)
            guard !Task.isCancelled, let url = URL(string: base + (q.addingPercentEncoding(withAllowedCharacters: .alphanumerics) ?? "")) else { return }
            guard let (data, _) = try? await URLSession.shared.data(from: url), let obj = try? JSONSerialization.jsonObject(with: data) else { return }
            var remote: [String] = []
            if let arr = obj as? [Any], arr.count >= 2, let list = arr[1] as? [String] { remote = list }        // OpenSearch [q, [..]]
            else if let list = obj as? [String] { remote = list }                                                // Qafila /api/suggest
            else if let list = obj as? [[String: Any]] { remote = list.compactMap { $0["phrase"] as? String } }   // DuckDuckGo
            guard !Task.isCancelled else { return }
            self?.suggestions = local + remote.prefix(6)
        }
    }

    func reset() { task?.cancel(); suggestions = []; text = "" }
}

/// Barre en mode saisie : champ dans la carte + « Annuler ».
struct AddressEditorRow: View {
    @EnvironmentObject var store: BrowserStore
    @Environment(\.chromeCard) private var cardColor
    @ObservedObject var editor: AddressEditModel
    @FocusState private var focused: Bool

    var body: some View {
        HStack(spacing: 10) {
            HStack(spacing: 8) {
                Image(systemName: "magnifyingglass").font(.system(size: 14, weight: .medium)).foregroundStyle(.secondary)
                TextField("Rechercher ou saisir une adresse", text: $editor.text)
                    .font(.system(size: 15))
                    .focused($focused)
                    .textInputAutocapitalization(.never).autocorrectionDisabled().keyboardType(.webSearch).submitLabel(.go)
                    .onSubmit { submit(editor.text) }
                    .onChange(of: editor.text) { _, v in editor.fetch(v, store: store) }
                if !editor.text.isEmpty {
                    Button { editor.text = "" } label: { Image(systemName: "xmark.circle.fill").foregroundStyle(.tertiary) }.buttonStyle(.plain)
                }
            }
            .padding(.horizontal, 12)
            .frame(height: 44)
            .background(RoundedRectangle(cornerRadius: 12, style: .continuous).fill(cardColor))

            Button("Annuler") { cancel() }.font(.system(size: 15)).foregroundStyle(.primary)
        }
        .onAppear {
            editor.text = store.selectedTab?.url?.absoluteString ?? ""
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.05) { focused = true }
        }
    }

    private func submit(_ s: String) {
        guard !s.trimmingCharacters(in: .whitespaces).isEmpty else { cancel(); return }
        store.navigate(s)
        editor.reset()
    }
    private func cancel() { store.isEditingAddress = false; editor.reset() }
}

/// Panneau flottant au-dessus de la barre : suggestions, ou favoris et pages récentes quand le champ est vide.
struct SuggestionsPanel: View {
    @EnvironmentObject var store: BrowserStore
    @ObservedObject var editor: AddressEditModel

    private var showingDefaults: Bool { editor.text.isEmpty || editor.text == store.selectedTab?.url?.absoluteString }

    var body: some View {
        VStack(alignment: .leading, spacing: 0) {
            if showingDefaults {
                if !store.bookmarks.isEmpty {
                    header("FAVORIS")
                    ScrollView(.horizontal, showsIndicators: false) {
                        HStack(spacing: 14) {
                            ForEach(store.bookmarks.prefix(10)) { b in
                                Button { go(b.url.absoluteString) } label: {
                                    VStack(spacing: 6) {
                                        Text(String(b.title.prefix(1)).uppercased())
                                            .font(.system(size: 19, weight: .medium, design: .serif))
                                            .frame(width: 48, height: 48)
                                            .background(RoundedRectangle(cornerRadius: 12, style: .continuous).fill(Color.primary.opacity(0.06)))
                                        Text(b.title).font(.system(size: 10.5)).foregroundStyle(.secondary).lineLimit(1).frame(width: 58)
                                    }
                                }.buttonStyle(.plain)
                            }
                        }.padding(.horizontal, 14)
                    }.padding(.bottom, 8)
                }
                let recent = Array(store.history.prefix(4))
                if !recent.isEmpty {
                    header("RÉCENTS")
                    ForEach(recent) { e in row(icon: "clock", text: e.title, detail: e.url.host) { go(e.url.absoluteString) } }
                }
            } else {
                ForEach(editor.suggestions.prefix(7), id: \.self) { s in
                    let isURL = s.contains(".") && !s.contains(" ")
                    row(icon: isURL ? "globe" : "magnifyingglass", text: s, detail: nil) { go(s) }
                }
            }
        }
        .padding(.vertical, 6)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(.regularMaterial, in: RoundedRectangle(cornerRadius: 16, style: .continuous))
        .shadow(color: .black.opacity(0.12), radius: 18, y: 4)
    }

    private func header(_ t: String) -> some View {
        Text(t).font(.system(size: 10, weight: .bold)).tracking(0.6).foregroundStyle(.secondary)
            .padding(.horizontal, 16).padding(.top, 8).padding(.bottom, 6)
    }

    private func row(icon: String, text: String, detail: String?, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            HStack(spacing: 12) {
                Image(systemName: icon).font(.system(size: 13)).foregroundStyle(.secondary).frame(width: 18)
                VStack(alignment: .leading, spacing: 0) {
                    Text(text).font(.system(size: 15)).foregroundStyle(.primary).lineLimit(1)
                    if let d = detail { Text(d).font(.system(size: 11)).foregroundStyle(.secondary).lineLimit(1) }
                }
                Spacer(minLength: 0)
                Image(systemName: "arrow.up.left").font(.system(size: 11)).foregroundStyle(.tertiary)
            }
            .padding(.horizontal, 16).frame(minHeight: 40).contentShape(Rectangle())
        }
        .buttonStyle(.plain)
    }

    private func go(_ s: String) { store.navigate(s); editor.reset() }
}
