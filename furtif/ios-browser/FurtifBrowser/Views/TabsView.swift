import SwiftUI

/// Onglets : liste groupée par domaine (comme Quiche) ou grille de vignettes ; tri par date, temps de lecture ou titre.
struct TabsView: View {
    @EnvironmentObject var store: BrowserStore
    @Environment(\.dismiss) private var dismiss
    @State private var snapshots: [UUID: UIImage] = [:]
    @State private var showPrivate = false

    private var visibleTabs: [BrowserTab] {
        let t = store.tabs.filter { $0.isPrivate == showPrivate }
        switch store.settings.tabsSort {
        case .date: return t.sorted { $0.lastVisited > $1.lastVisited }
        case .readingTime: return t.sorted { $0.readingMinutes > $1.readingMinutes }
        case .title: return t.sorted { $0.displayTitle.localizedCaseInsensitiveCompare($1.displayTitle) == .orderedAscending }
        }
    }

    private var groups: [(host: String, tabs: [BrowserTab])] {
        guard store.settings.groupTabsByDomain else { return [(host: "", tabs: visibleTabs)] }
        var order: [String] = []; var dict: [String: [BrowserTab]] = [:]
        for t in visibleTabs {
            let key = t.url == nil ? "Nouveaux onglets" : t.host
            if dict[key] == nil { order.append(key) }
            dict[key, default: []].append(t)
        }
        let multi: [(host: String, tabs: [BrowserTab])] = order.filter { (dict[$0]?.count ?? 0) > 1 }.map { (host: $0, tabs: dict[$0]!) }
        let singles = order.filter { (dict[$0]?.count ?? 0) == 1 }.flatMap { dict[$0]! }
        return multi + (singles.isEmpty ? [] : [(host: "Autres", tabs: singles)])
    }

    var body: some View {
        NavigationStack {
            Group {
                if store.settings.tabsLayout == .list { list } else { grid }
            }
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarLeading) {
                    Picker("", selection: $showPrivate) { Text("Onglets").tag(false); Text("Privés").tag(true) }.pickerStyle(.segmented).frame(width: 170)
                }
                ToolbarItem(placement: .topBarTrailing) {
                    Menu {
                        Picker("Affichage", selection: $store.settings.tabsLayout) { ForEach(TabsLayout.allCases) { Text($0.label).tag($0) } }
                        Picker("Trier par", selection: $store.settings.tabsSort) { ForEach(TabsSort.allCases) { Text($0.label).tag($0) } }
                        Toggle("Grouper par site", isOn: $store.settings.groupTabsByDomain)
                        Picker("Vignettes", selection: $store.settings.thumbnailSize) { ForEach(ThumbnailSize.allCases) { Text($0.label).tag($0) } }
                        Divider()
                        Button(role: .destructive) { store.closeAllTabs(); dismiss() } label: { Label("Fermer tous les onglets", systemImage: "xmark.square") }
                    } label: { Image(systemName: "ellipsis.circle") }
                }
                ToolbarItemGroup(placement: .bottomBar) {
                    Button { store.newTab(isPrivate: showPrivate); dismiss() } label: { Image(systemName: "plus") }
                    Spacer()
                    Text("\(visibleTabs.count) onglet\(visibleTabs.count > 1 ? "s" : "")").font(.system(size: 15, weight: .semibold))
                    Spacer()
                    Button("OK") { dismiss() }.fontWeight(.semibold)
                }
            }
        }
        .onAppear { captureSnapshots() }
    }

    // MARK: Liste groupée par domaine
    private var list: some View {
        List {
            ForEach(groups, id: \.host) { group in
                Section {
                    ForEach(group.tabs) { tab in row(tab) }
                        .onDelete { idx in idx.map { group.tabs[$0].id }.forEach { store.close(tabID: $0) } }
                } header: {
                    if !group.host.isEmpty { Text(group.host).font(.system(size: 12, weight: .semibold)).textCase(nil) }
                }
            }
        }
        .listStyle(.insetGrouped)
    }

    private func row(_ tab: BrowserTab) -> some View {
        Button { select(tab) } label: {
            HStack(spacing: 12) {
                Group {
                    if let f = tab.favicon { Image(uiImage: f).resizable().scaledToFit() }
                    else { Image(systemName: tab.isPrivate ? "hand.raised.fill" : "globe").foregroundStyle(.secondary) }
                }
                .frame(width: 28, height: 28).background(Color(.tertiarySystemFill)).clipShape(RoundedRectangle(cornerRadius: 7))
                VStack(alignment: .leading, spacing: 2) {
                    Text(tab.displayTitle).font(.system(size: 15, weight: .medium)).lineLimit(2).foregroundStyle(.primary)
                    HStack(spacing: 6) {
                        Text(tab.url?.absoluteString.replacingOccurrences(of: "https://", with: "") ?? "").lineLimit(1)
                        if store.settings.showReadingTime, let r = tab.readingLabel { Text("· \(r)") }
                    }.font(.system(size: 12)).foregroundStyle(.secondary)
                }
                Spacer()
                if tab.id == store.selectedTabID { Image(systemName: "checkmark").foregroundStyle(Color.accentColor).font(.system(size: 13, weight: .bold)) }
            }
        }
        .swipeActions { Button(role: .destructive) { store.close(tabID: tab.id) } label: { Label("Fermer", systemImage: "xmark") } }
    }

    // MARK: Grille de vignettes
    private var grid: some View {
        let cols = store.settings.thumbnailSize == .large ? 2 : 3
        return ScrollView {
            LazyVGrid(columns: Array(repeating: GridItem(.flexible(), spacing: 12), count: cols), spacing: 12) {
                ForEach(visibleTabs) { tab in
                    Button { select(tab) } label: {
                        VStack(alignment: .leading, spacing: 6) {
                            ZStack(alignment: .topTrailing) {
                                Group {
                                    if let s = snapshots[tab.id] { Image(uiImage: s).resizable().scaledToFill() }
                                    else { Color(.secondarySystemBackground).overlay(Image(systemName: "globe").font(.largeTitle).foregroundStyle(.tertiary)) }
                                }
                                .frame(height: cols == 2 ? 200 : 130).clipped()
                                .clipShape(RoundedRectangle(cornerRadius: 14))
                                .overlay(RoundedRectangle(cornerRadius: 14).strokeBorder(tab.id == store.selectedTabID ? Color.accentColor : Color(.separator), lineWidth: tab.id == store.selectedTabID ? 2 : 0.5))
                                Button { store.close(tabID: tab.id) } label: {
                                    Image(systemName: "xmark").font(.system(size: 11, weight: .bold)).padding(7).background(.thinMaterial, in: Circle())
                                }.padding(6)
                            }
                            HStack(spacing: 6) {
                                if let f = tab.favicon { Image(uiImage: f).resizable().frame(width: 14, height: 14).clipShape(RoundedRectangle(cornerRadius: 3)) }
                                Text(tab.displayTitle).font(.system(size: 13, weight: .medium)).lineLimit(1).foregroundStyle(.primary)
                            }
                            if store.settings.showReadingTime, let r = tab.readingLabel { Text(r).font(.system(size: 11)).foregroundStyle(.secondary) }
                        }
                    }
                    .buttonStyle(.plain)
                }
            }
            .padding(16)
        }
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
