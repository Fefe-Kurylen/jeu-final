import SwiftUI

/// Onglets façon Quiche : fond gris groupé, cartes blanches, domaine en capitales, temps de lecture ;
/// liste ou grille de vignettes, groupement par site (carrousels en grille), tri, mode confort, onglets privés.
struct TabsView: View {
    @EnvironmentObject var store: BrowserStore
    @Environment(\.dismiss) private var dismiss
    @State private var snapshots: [UUID: UIImage] = [:]
    @State private var showPrivate = false
    @State private var query = ""

    private var s: Settings { store.settings }

    private var visibleTabs: [BrowserTab] {
        var t = store.tabs.filter { $0.isPrivate == showPrivate }
        if !query.isEmpty { t = t.filter { $0.displayTitle.localizedCaseInsensitiveContains(query) || $0.host.localizedCaseInsensitiveContains(query) } }
        switch s.tabsSort {
        case .date: return t.sorted { $0.lastVisited > $1.lastVisited }
        case .readingTime: return t.sorted { $0.readingMinutes > $1.readingMinutes }
        case .title: return t.sorted { $0.displayTitle.localizedCaseInsensitiveCompare($1.displayTitle) == .orderedAscending }
        }
    }

    private struct TabGroup: Identifiable { let id: String; let title: String; let tabs: [BrowserTab] }

    private var groups: [TabGroup] {
        let all = visibleTabs
        guard s.groupTabsByDomain, query.isEmpty else { return [TabGroup(id: "all", title: "", tabs: all)] }
        var order: [String] = []; var dict: [String: [BrowserTab]] = [:]
        for t in all {
            let key = t.url == nil ? "NOUVEAUX ONGLETS" : t.host.uppercased()
            if dict[key] == nil { order.append(key) }
            dict[key, default: []].append(t)
        }
        var out = order.filter { (dict[$0]?.count ?? 0) > 1 }.map { TabGroup(id: $0, title: $0, tabs: dict[$0] ?? []) }
        let singles = order.filter { (dict[$0]?.count ?? 0) == 1 }.flatMap { dict[$0] ?? [] }
        if !singles.isEmpty { out.append(TabGroup(id: "others", title: out.isEmpty ? "" : "AUTRES SITES", tabs: singles)) }
        return out
    }

    var body: some View {
        ZStack(alignment: .bottom) {
            Color(.systemGroupedBackground).ignoresSafeArea()
            VStack(spacing: 0) {
                searchField
                if visibleTabs.isEmpty { empty } else if s.tabsLayout == .list { list } else { grid }
            }
            bottomBar
        }
        .onAppear { captureSnapshots() }
    }

    // MARK: En-tête et pied

    private var searchField: some View {
        HStack(spacing: 8) {
            Image(systemName: "magnifyingglass").font(.system(size: 13, weight: .medium)).foregroundStyle(.secondary)
            TextField(showPrivate ? "Rechercher dans les onglets privés" : "Rechercher dans les onglets", text: $query)
                .font(.system(size: 15)).textInputAutocapitalization(.never).autocorrectionDisabled()
        }
        .padding(.horizontal, 12).frame(height: 38)
        .background(RoundedRectangle(cornerRadius: 11, style: .continuous).fill(Color(.tertiarySystemFill)))
        .padding(.horizontal, 16).padding(.top, 8).padding(.bottom, 4)
    }

    private var empty: some View {
        VStack(spacing: 10) {
            Spacer()
            Image(systemName: showPrivate ? "hand.raised" : "square.on.square").font(.system(size: 34, weight: .light)).foregroundStyle(.tertiary)
            Text(showPrivate ? "Aucun onglet privé" : "Aucun onglet").font(.system(size: 17, weight: .semibold))
            if showPrivate { Text("Les onglets privés ne gardent ni historique ni cookies.").font(.system(size: 14)).foregroundStyle(.secondary) }
            Spacer(); Spacer()
        }
        .frame(maxWidth: .infinity)
    }

    private var bottomBar: some View {
        HStack {
            Button { store.newTab(isPrivate: showPrivate); dismiss() } label: {
                Image(systemName: "plus").font(.system(size: 21, weight: store.settings.buttonWeight.fontWeight)).frame(width: 48, height: 44)
            }
            Spacer()
            Menu {
                Section {
                    Picker("Affichage", selection: $store.settings.tabsLayout) {
                        Label("Liste", systemImage: "list.bullet").tag(TabsLayout.list)
                        Label("Grille", systemImage: "square.grid.2x2").tag(TabsLayout.grid)
                    }
                    Picker("Trier par", selection: $store.settings.tabsSort) { ForEach(TabsSort.allCases) { Text($0.label).tag($0) } }
                    Toggle("Grouper par site", isOn: $store.settings.groupTabsByDomain)
                    if s.tabsLayout == .grid {
                        Picker("Vignettes", selection: $store.settings.thumbnailSize) { ForEach(ThumbnailSize.allCases) { Text($0.label).tag($0) } }
                    }
                }
                Section {
                    Button { withAnimation { showPrivate.toggle() } } label: {
                        Label(showPrivate ? "Onglets normaux" : "Onglets privés", systemImage: showPrivate ? "square.on.square" : "hand.raised")
                    }
                }
                Section {
                    Button(role: .destructive) { store.closeAllTabs(privateOnly: showPrivate); if !showPrivate { dismiss() } } label: {
                        Label("Fermer les \(visibleTabs.count) onglets", systemImage: "xmark")
                    }
                }
            } label: {
                HStack(spacing: 5) {
                    if showPrivate { Image(systemName: "hand.raised.fill").font(.system(size: 11)) }
                    Text(countLabel)
                        .font(.system(size: 14, weight: .semibold))
                    Image(systemName: "chevron.up").font(.system(size: 9, weight: .bold))
                }
                .foregroundStyle(.primary)
                .padding(.horizontal, 14).frame(height: 34)
                .background(Capsule().fill(Color(.secondarySystemGroupedBackground)))
                .overlay(Capsule().strokeBorder(Color.primary.opacity(0.06), lineWidth: 0.5))
            }
            Spacer()
            Button { dismiss() } label: { Text("OK").font(.system(size: 17, weight: .semibold)).frame(width: 48, height: 44) }
        }
        .foregroundStyle(.primary)
        .padding(.horizontal, 10).padding(.top, 8)
        .background(.bar)
    }

    private var countLabel: String {
        let n = visibleTabs.count
        let plural = n > 1 ? "s" : ""
        return showPrivate ? "\(n) onglet\(plural) privé\(plural)" : "\(n) onglet\(plural)"
    }

    // MARK: Liste

    private var list: some View {
        List {
            ForEach(groups) { group in
                Section {
                    ForEach(group.tabs) { tab in row(tab) }
                } header: {
                    if !group.title.isEmpty {
                        HStack {
                            Text(group.title).font(.system(size: 11, weight: .bold)).tracking(0.6)
                            Spacer()
                            Text("\(group.tabs.count)").font(.system(size: 11, weight: .semibold)).monospacedDigit()
                        }
                        .foregroundStyle(.secondary)
                    }
                }
            }
            Color.clear.frame(height: 50).listRowBackground(Color.clear)
        }
        .listStyle(.insetGrouped)
        .scrollContentBackground(.hidden)
        .environment(\.defaultMinListRowHeight, 58)
        .defaultScrollAnchor(s.comfortMode ? .bottom : .top)
    }

    private func row(_ tab: BrowserTab) -> some View {
        Button { select(tab) } label: {
            HStack(spacing: 12) {
                Favicon(tab: tab, size: 26)
                VStack(alignment: .leading, spacing: 3) {
                    Text(tab.displayTitle).font(.system(size: 14, weight: .medium)).lineLimit(2).foregroundStyle(.primary).multilineTextAlignment(.leading)
                    Text(tab.url == nil ? "PAGE DE DÉMARRAGE" : tab.host.uppercased()).font(.system(size: 10, weight: .semibold)).tracking(0.5).foregroundStyle(.secondary).lineLimit(1)
                }
                Spacer(minLength: 6)
                if s.addressShowsReadingTime, let r = tab.readingLabel { ReadingPill(text: r) }
                if tab.id == store.selectedTabID { Circle().fill(Color.accentColor).frame(width: 7, height: 7) }
            }
            .padding(.vertical, 4)
            .contentShape(Rectangle())
        }
        .buttonStyle(.plain)
        .swipeActions(edge: .trailing) { Button(role: .destructive) { store.close(tabID: tab.id) } label: { Label("Fermer", systemImage: "xmark") } }
        .contextMenu { tabMenu(tab) }
    }

    @ViewBuilder private func tabMenu(_ tab: BrowserTab) -> some View {
        Button { UIPasteboard.general.url = tab.url } label: { Label("Copier l'adresse", systemImage: "doc.on.doc") }
        Button { store.toggleBookmark(tab) } label: { Label(store.isBookmarked(tab) ? "Retirer des favoris" : "Ajouter aux favoris", systemImage: "bookmark") }
        if let u = tab.url { Button { store.newTab(url: u, isPrivate: tab.isPrivate, select: false) } label: { Label("Dupliquer", systemImage: "plus.square.on.square") } }
        Divider()
        Button(role: .destructive) { store.close(tabID: tab.id) } label: { Label("Fermer", systemImage: "xmark") }
    }

    // MARK: Grille

    private var columns: Int { s.thumbnailSize == .large ? 2 : 3 }

    private var grid: some View {
        ScrollView {
            if s.groupTabsByDomain && query.isEmpty {
                LazyVStack(alignment: .leading, spacing: 18) {
                    ForEach(groups) { group in
                        VStack(alignment: .leading, spacing: 8) {
                            if !group.title.isEmpty {
                                Text(group.title).font(.system(size: 11, weight: .bold)).tracking(0.6).foregroundStyle(.secondary).padding(.horizontal, 20)
                            }
                            ScrollView(.horizontal, showsIndicators: false) {
                                HStack(spacing: 12) {
                                    ForEach(group.tabs) { tab in card(tab).frame(width: columns == 2 ? 162 : 112) }
                                }
                                .padding(.horizontal, 16)
                            }
                        }
                    }
                }
                .padding(.vertical, 10)
            } else {
                LazyVGrid(columns: Array(repeating: GridItem(.flexible(), spacing: 12), count: columns), spacing: 14) {
                    ForEach(visibleTabs) { tab in card(tab) }
                }
                .padding(16)
            }
            Color.clear.frame(height: 60)
        }
        .defaultScrollAnchor(s.comfortMode ? .bottom : .top)
    }

    private func card(_ tab: BrowserTab) -> some View {
        let selected = tab.id == store.selectedTabID
        return Button { select(tab) } label: {
            VStack(spacing: 0) {
                HStack(spacing: 6) {
                    Favicon(tab: tab, size: 15)
                    Text(tab.displayTitle).font(.system(size: 11.5, weight: .semibold)).lineLimit(1).foregroundStyle(.primary)
                    Spacer(minLength: 0)
                    Button { withAnimation { store.close(tabID: tab.id) } } label: {
                        Image(systemName: "xmark").font(.system(size: 9, weight: .bold)).foregroundStyle(.secondary)
                            .frame(width: 20, height: 20).background(Circle().fill(Color.primary.opacity(0.07)))
                    }
                    .buttonStyle(.plain)
                }
                .padding(.horizontal, 8).frame(height: 32)
                Color(.secondarySystemBackground)
                    .aspectRatio(3 / 4, contentMode: .fit)
                    .overlay {
                        if let img = snapshots[tab.id] { Image(uiImage: img).resizable().scaledToFill() }
                        else { Text(String(tab.host.prefix(1)).uppercased()).font(.system(size: 30, weight: .medium, design: .serif)).foregroundStyle(.tertiary) }
                    }
                    .clipped()
            }
            .background(Color(.secondarySystemGroupedBackground))
            .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
            .overlay(RoundedRectangle(cornerRadius: 14, style: .continuous).strokeBorder(selected ? Color.accentColor : Color.primary.opacity(0.06), lineWidth: selected ? 2 : 0.5))
            .shadow(color: .black.opacity(0.06), radius: 6, y: 2)
        }
        .buttonStyle(.plain)
        .contextMenu { tabMenu(tab) }
    }

    private func select(_ tab: BrowserTab) {
        store.selectedTabID = tab.id
        store.haptic(.light)
        dismiss()
    }

    private func captureSnapshots() {
        for t in store.tabs where snapshots[t.id] == nil {
            store.tabManager.snapshot(t.id) { img in if let img { snapshots[t.id] = img } }
        }
    }
}
