import SwiftUI
import WebKit

enum SettingsRoute: String, Hashable, CaseIterable, Identifiable {
    case appearance, toolbar, address, tabs, search, privacy, reading, energy, about
    var id: String { rawValue }
    var title: String {
        switch self {
        case .appearance: return "Apparence"
        case .toolbar: return "Barre d'outils"
        case .address: return "Barre d'adresse"
        case .tabs: return "Onglets"
        case .search: return "Recherche"
        case .privacy: return "Confidentialité"
        case .reading: return "Lecture"
        case .energy: return "Énergie"
        case .about: return "À propos"
        }
    }
    var symbol: String {
        switch self {
        case .appearance: return "paintpalette"
        case .toolbar: return "menubar.dock.rectangle"
        case .address: return "link"
        case .tabs: return "square.on.square"
        case .search: return "magnifyingglass"
        case .privacy: return "hand.raised"
        case .reading: return "textformat.size"
        case .energy: return "leaf"
        case .about: return "info.circle"
        }
    }
    var tint: Color {
        switch self {
        case .appearance: return Color(red: 0.55, green: 0.42, blue: 0.86)
        case .toolbar: return Color(red: 0.30, green: 0.33, blue: 0.40)
        case .address: return Color(red: 0.22, green: 0.48, blue: 0.86)
        case .tabs: return Color(red: 0.95, green: 0.55, blue: 0.20)
        case .search: return Color(red: 0.42, green: 0.45, blue: 0.50)
        case .privacy: return Color(red: 0.20, green: 0.62, blue: 0.42)
        case .reading: return Color(red: 0.80, green: 0.36, blue: 0.30)
        case .energy: return Color(red: 0.36, green: 0.66, blue: 0.24)
        case .about: return Color(red: 0.55, green: 0.55, blue: 0.58)
        }
    }
}

/// Réglages : tout ce que Quiche permet d'ajuster, page par page, avec un aperçu en direct de la barre.
struct SettingsView: View {
    @EnvironmentObject var store: BrowserStore
    @Environment(\.dismiss) private var dismiss
    @State private var path: [SettingsRoute] = []

    var body: some View {
        NavigationStack(path: $path) {
            List {
                Section { ChromePreview().listRowInsets(EdgeInsets()).listRowBackground(Color.clear) }
                Section { ForEach([SettingsRoute.appearance, .toolbar, .address, .tabs]) { link($0) } }
                Section { ForEach([SettingsRoute.search, .privacy, .reading, .energy]) { link($0) } }
                Section { link(.about) }
            }
            .navigationTitle("Réglages")
            .navigationBarTitleDisplayMode(.inline)
            .navigationDestination(for: SettingsRoute.self) { page($0) }
            .toolbar { ToolbarItem(placement: .confirmationAction) { Button("OK") { dismiss() }.fontWeight(.semibold) } }
        }
        .onAppear { if let r = store.settingsRoute { path = [r] } }
    }

    private func link(_ r: SettingsRoute) -> some View {
        NavigationLink(value: r) {
            HStack(spacing: 12) {
                Image(systemName: r.symbol).font(.system(size: 14, weight: .medium)).foregroundStyle(.white)
                    .frame(width: 29, height: 29).background(RoundedRectangle(cornerRadius: 7, style: .continuous).fill(r.tint))
                Text(r.title)
                Spacer()
                Text(detail(r)).font(.system(size: 15)).foregroundStyle(.secondary).lineLimit(1)
            }
        }
    }

    private func detail(_ r: SettingsRoute) -> String {
        let s = store.settings
        switch r {
        case .appearance: return s.appearance.label
        case .toolbar: return s.toolbar.position.label
        case .address: return s.addressStyle.label
        case .tabs: return s.tabsLayout.label
        case .search: return s.searchEngine == .custom ? "Personnalisé" : s.searchEngine.label.replacingOccurrences(of: " (instance)", with: "").replacingOccurrences(of: " (mon serveur)", with: "")
        case .privacy: return s.blockerEnabled ? "Bloqueur actif" : "Bloqueur coupé"
        case .reading: return "\(Int((s.textZoom * 100).rounded())) %"
        case .energy, .about: return ""
        }
    }

    @ViewBuilder private func page(_ r: SettingsRoute) -> some View {
        switch r {
        case .appearance: AppearanceSettings()
        case .toolbar: ToolbarSettings()
        case .address: AddressSettings()
        case .tabs: TabsSettings()
        case .search: SearchSettings()
        case .privacy: PrivacySettings()
        case .reading: ReadingSettings()
        case .energy: EnergySettings()
        case .about: AboutSettings()
        }
    }
}

// MARK: - Aperçu en direct

/// Mini-page fictive + la vraie barre, rendue avec les réglages courants.
struct ChromePreview: View {
    @EnvironmentObject var store: BrowserStore
    @Environment(\.colorScheme) private var scheme
    @StateObject private var editor = AddressEditModel()

    var body: some View {
        let s = store.settings
        let palette = ChromePalette.make(s, scheme: scheme, site: nil)
        let top = s.toolbar.position == .top
        VStack(spacing: 0) {
            if top { bar(palette) }
            page.frame(height: 92)
            if !top { bar(palette) }
        }
        .background(Color(.systemBackground))
        .clipShape(RoundedRectangle(cornerRadius: 22, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: 22, style: .continuous).strokeBorder(Color.primary.opacity(0.08), lineWidth: 0.5))
        .padding(.vertical, 6)
        .allowsHitTesting(false)
        .animation(.easeInOut(duration: 0.2), value: s)
    }

    private func bar(_ palette: ChromePalette) -> some View {
        let floating = store.settings.toolbar.style == .floating
        return ChromeBar(editor: editor, singleRow: false, atTop: store.settings.toolbar.position == .top)
            .padding(.bottom, 6)
            .environment(\.chromeCard, palette.card)
            .modifier(SchemeOverride(scheme: palette.contentScheme))
            .background(ChromeBackground(palette: palette, style: store.settings.toolbar.style))
            .padding(floating ? 8 : 0)
    }

    private var page: some View {
        VStack(alignment: .leading, spacing: 8) {
            RoundedRectangle(cornerRadius: 3).fill(Color.primary.opacity(0.75)).frame(width: 170, height: 12)
            RoundedRectangle(cornerRadius: 3).fill(Color.primary.opacity(0.12)).frame(height: 7)
            RoundedRectangle(cornerRadius: 3).fill(Color.primary.opacity(0.12)).frame(height: 7)
            RoundedRectangle(cornerRadius: 3).fill(Color.primary.opacity(0.12)).frame(width: 210, height: 7)
        }
        .padding(.horizontal, 18)
        .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .leading)
    }
}

// MARK: - Composants

struct SwatchRow<T: Hashable & Identifiable>: View {
    let items: [T]
    @Binding var selection: T
    let color: (T) -> Color?
    let label: (T) -> String

    var body: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 14) {
                ForEach(items) { item in
                    Button { selection = item } label: {
                        VStack(spacing: 6) {
                            ZStack {
                                if let c = color(item) {
                                    Circle().fill(c)
                                } else {
                                    Circle().fill(AngularGradient(colors: [.orange, .pink, .purple, .blue, .teal, .green, .orange], center: .center))
                                    Text("A").font(.system(size: 13, weight: .bold)).foregroundStyle(.white)
                                }
                                Circle().strokeBorder(Color.primary.opacity(0.12), lineWidth: 0.5)
                            }
                            .frame(width: 34, height: 34)
                            .padding(3)
                            .overlay(Circle().strokeBorder(selection == item ? Color.accentColor : .clear, lineWidth: 2))
                            Text(label(item)).font(.system(size: 10.5)).foregroundStyle(selection == item ? .primary : .secondary).lineLimit(1)
                        }
                        .frame(minWidth: 46)
                    }
                    .buttonStyle(.plain)
                }
            }
            .padding(.vertical, 6).padding(.horizontal, 2)
        }
    }
}

/// Liste à cocher (comme les réglages iOS / Quiche).
struct CheckList<T: Hashable & Identifiable>: View {
    let items: [T]
    @Binding var selection: T
    let label: (T) -> String
    var detail: ((T) -> String?)? = nil

    var body: some View {
        ForEach(items) { item in
            Button { selection = item } label: {
                HStack {
                    VStack(alignment: .leading, spacing: 2) {
                        Text(label(item)).foregroundStyle(.primary)
                        if let d = detail?(item) { Text(d).font(.system(size: 12)).foregroundStyle(.secondary) }
                    }
                    Spacer()
                    if selection == item { Image(systemName: "checkmark").font(.system(size: 14, weight: .semibold)).foregroundStyle(Color.accentColor) }
                }
                .contentShape(Rectangle())
            }
            .buttonStyle(.plain)
        }
    }
}

struct HostListView: View {
    @EnvironmentObject var store: BrowserStore
    let keyPath: WritableKeyPath<Settings, Set<String>>
    let title: String
    let footer: String
    @State private var newHost = ""

    var body: some View {
        List {
            Section {
                HStack {
                    TextField("exemple.com", text: $newHost).keyboardType(.URL).textInputAutocapitalization(.never).autocorrectionDisabled()
                        .onSubmit(add)
                    Button("Ajouter", action: add).disabled(newHost.trimmingCharacters(in: .whitespaces).isEmpty)
                }
            } footer: { Text(footer) }
            Section {
                ForEach(store.settings[keyPath: keyPath].sorted(), id: \.self) { h in Text(h) }
                    .onDelete { idx in
                        let sorted = store.settings[keyPath: keyPath].sorted()
                        for i in idx { store.settings[keyPath: keyPath].remove(sorted[i]) }
                    }
                if store.settings[keyPath: keyPath].isEmpty { Text("Aucun site").foregroundStyle(.secondary) }
            }
        }
        .navigationTitle(title)
        .navigationBarTitleDisplayMode(.inline)
    }

    private func add() {
        var h = newHost.trimmingCharacters(in: .whitespaces).lowercased()
        if let u = URL(string: h.contains("://") ? h : "https://" + h), let host = u.host { h = host }
        guard !h.isEmpty else { return }
        store.settings[keyPath: keyPath].insert(h)
        newHost = ""
    }
}

// MARK: - Apparence

struct AppearanceSettings: View {
    @EnvironmentObject var store: BrowserStore

    var body: some View {
        List {
            Section { ChromePreview().listRowInsets(EdgeInsets()).listRowBackground(Color.clear) }
            Section("Thème") {
                Picker("Thème", selection: $store.settings.appearance) { ForEach(Appearance.allCases) { Text($0.label).tag($0) } }
                    .pickerStyle(.segmented)
            }
            Section("Couleur d'accent") {
                SwatchRow(items: AccentColor.allCases, selection: $store.settings.accent, color: { $0.color }, label: { $0.label })
            }
            Section {
                SwatchRow(items: BarColor.allCases, selection: $store.settings.barColorLight, color: { $0.color }, label: { $0 == .auto ? "Site" : $0.label })
            } header: { Text("Barre — mode clair") }
            Section {
                SwatchRow(items: BarColor.allCases, selection: $store.settings.barColorDark, color: { $0.color }, label: { $0 == .auto ? "Site" : $0.label })
            } header: { Text("Barre — mode sombre") } footer: { Text("« Site » reprend la couleur de thème du site visité. Les icônes passent en clair ou en sombre automatiquement.") }
            Section {
                Picker("Style", selection: $store.settings.toolbar.style) { ForEach(ToolbarStyle.allCases) { Text($0.label).tag($0) } }
                    .pickerStyle(.segmented)
            } header: { Text("Style de la barre") } footer: {
                Text("Classique : couleur pleine. Verre : translucide. Flottante : barre arrondie détachée des bords, la page passe autour.")
            }
            Section("Icône de l'app") {
                HStack(spacing: 0) {
                    ForEach(AppIconChoice.allCases) { icon in
                        Button { store.settings.appIcon = icon } label: {
                            VStack(spacing: 6) {
                                Image(icon.preview).resizable().frame(width: 58, height: 58)
                                    .clipShape(RoundedRectangle(cornerRadius: 13, style: .continuous))
                                    .overlay(RoundedRectangle(cornerRadius: 13, style: .continuous).strokeBorder(Color.primary.opacity(0.1), lineWidth: 0.5))
                                    .padding(3)
                                    .overlay(RoundedRectangle(cornerRadius: 15, style: .continuous).strokeBorder(store.settings.appIcon == icon ? Color.accentColor : .clear, lineWidth: 2))
                                Text(icon.label).font(.system(size: 11)).foregroundStyle(store.settings.appIcon == icon ? .primary : .secondary)
                            }
                            .frame(maxWidth: .infinity)
                        }
                        .buttonStyle(.plain)
                    }
                }
                .padding(.vertical, 6)
            }
            Section { Toggle("Vibrations", isOn: $store.settings.haptics) } footer: { Text("Retour haptique discret à l'ouverture, à la fermeture et sur les boutons.") }
        }
        .navigationTitle("Apparence")
        .navigationBarTitleDisplayMode(.inline)
    }
}

// MARK: - Barre d'outils

struct ToolbarSettings: View {
    @EnvironmentObject var store: BrowserStore

    var body: some View {
        List {
            Section { ChromePreview().listRowInsets(EdgeInsets()).listRowBackground(Color.clear) }
            Section {
                NavigationLink { ToolbarEditorView(embedded: true) } label: { Label("Boutons de la barre et du menu", systemImage: "slider.horizontal.3") }
                NavigationLink { ToolbarGalleryView(embedded: true) } label: { Label("Galerie de barres", systemImage: "square.grid.2x2") }
            }
            Section("Position") {
                Picker("Position", selection: $store.settings.toolbar.position) { ForEach(ToolbarPosition.allCases) { Text($0.label).tag($0) } }
                    .pickerStyle(.segmented)
                Toggle("Barre en haut en paysage", isOn: $store.settings.landscapeTopBar)
            }
            Section("Icônes") {
                Picker("Épaisseur", selection: $store.settings.buttonWeight) { ForEach(ButtonWeight.allCases) { Text($0.label).tag($0) } }
                    .pickerStyle(.segmented)
                HStack {
                    Text("Bouton menu")
                    Spacer()
                    ForEach(MenuIconStyle.allCases) { m in
                        Button { store.settings.menuIcon = m } label: {
                            Image(systemName: m.symbol).font(.system(size: 19, weight: store.settings.buttonWeight.fontWeight))
                                .frame(width: 44, height: 36)
                                .background(RoundedRectangle(cornerRadius: 9).fill(store.settings.menuIcon == m ? Color.accentColor.opacity(0.15) : .clear))
                                .foregroundStyle(store.settings.menuIcon == m ? Color.accentColor : .primary)
                        }
                        .buttonStyle(.plain)
                        .accessibilityLabel(m.label)
                    }
                }
            }
            Section {
                Picker("Au défilement", selection: $store.settings.scrollBehavior) { ForEach(ScrollBehavior.allCases) { Text($0.label).tag($0) } }
                    .pickerStyle(.segmented)
            } header: { Text("Au défilement") } footer: {
                Text(store.settings.scrollBehavior == .fixed ? "La barre reste toujours visible." :
                     store.settings.scrollBehavior == .shrink ? "La barre se réduit au nom du site ; touchez-le pour la rouvrir." :
                     "La barre disparaît pendant la lecture et revient en remontant.")
            }
            Section {
                Toggle("Balayer depuis le bord pour naviguer", isOn: $store.settings.edgeSwipeNavigation)
            } footer: { Text("Glissez depuis le bord gauche pour revenir en arrière, depuis le bord droit pour avancer.") }
        }
        .navigationTitle("Barre d'outils")
        .navigationBarTitleDisplayMode(.inline)
    }
}

// MARK: - Barre d'adresse

struct AddressSettings: View {
    @EnvironmentObject var store: BrowserStore

    var body: some View {
        List {
            Section { ChromePreview().listRowInsets(EdgeInsets()).listRowBackground(Color.clear) }
            Section {
                CheckList(items: AddressStyle.allCases, selection: $store.settings.addressStyle, label: { $0.label }, detail: { style in
                    switch style {
                    case .card: return "Domaine en capitales au-dessus du titre"
                    case .fullURL: return "L'adresse complète, sur une ligne"
                    case .domainPill: return "Juste le nom du site, centré"
                    case .titleReading: return "Le titre et le temps de lecture"
                    case .centered: return "Texte centré, sans fond"
                    case .hidden: return "Aucune adresse : la barre ne garde que les icônes"
                    }
                })
            } header: { Text("Style") } footer: {
                Text("Astuce : ajoutez le bouton « Adresse » à la barre d'outils pour l'afficher sur la même ligne que les icônes.")
            }
            Section("Afficher") {
                Toggle("Icône du site", isOn: $store.settings.addressShowsFavicon)
                Toggle("Temps de lecture", isOn: $store.settings.addressShowsReadingTime)
            }
            Section("Gestes") {
                Picker("Toucher", selection: $store.settings.addressTap) { ForEach(AddressTapAction.allCases) { Text($0.label).tag($0) } }
                Picker("Appui long", selection: $store.settings.addressLongPress) { ForEach(AddressLongPressAction.allCases) { Text($0.label).tag($0) } }
            }
        }
        .navigationTitle("Barre d'adresse")
        .navigationBarTitleDisplayMode(.inline)
    }
}

// MARK: - Onglets

struct TabsSettings: View {
    @EnvironmentObject var store: BrowserStore

    var body: some View {
        List {
            Section("Affichage") {
                Picker("Disposition", selection: $store.settings.tabsLayout) { ForEach(TabsLayout.allCases) { Text($0.label).tag($0) } }
                    .pickerStyle(.segmented)
                Picker("Vignettes", selection: $store.settings.thumbnailSize) { ForEach(ThumbnailSize.allCases) { Text($0.label).tag($0) } }
                Picker("Trier par", selection: $store.settings.tabsSort) { ForEach(TabsSort.allCases) { Text($0.label).tag($0) } }
                Toggle("Grouper par site", isOn: $store.settings.groupTabsByDomain)
            }
            Section {
                Toggle("Mode confort", isOn: $store.settings.comfortMode)
            } footer: { Text("La liste des onglets s'ouvre par le bas, à portée de pouce.") }
            Section("Nouvel onglet") {
                Picker("Ouvre", selection: $store.settings.newTabPage) { ForEach(NewTabPage.allCases) { Text($0.label).tag($0) } }
                if store.settings.newTabPage == .custom {
                    TextField("https://…", text: $store.settings.newTabCustomURL).keyboardType(.URL).textInputAutocapitalization(.never).autocorrectionDisabled()
                }
            }
            Section {
                Picker("Fermer automatiquement", selection: $store.settings.autoCloseTabs) { ForEach(AutoCloseTabs.allCases) { Text($0.label).tag($0) } }
            } footer: { Text("Les onglets que vous n'avez pas ouverts depuis ce délai sont fermés au retour dans l'app.") }
        }
        .navigationTitle("Onglets")
        .navigationBarTitleDisplayMode(.inline)
    }
}

// MARK: - Recherche

struct SearchSettings: View {
    @EnvironmentObject var store: BrowserStore

    var body: some View {
        List {
            Section("Moteur") {
                CheckList(items: SearchEngine.allCases, selection: $store.settings.searchEngine, label: { $0.label })
            }
            if store.settings.searchEngine.needsBaseURL {
                Section {
                    TextField(store.settings.searchEngine == .qafila ? "https://mon-qafila.exemple.fr" : "https://ma-instance-searxng.fr", text: $store.settings.searchBaseURL)
                        .keyboardType(.URL).textInputAutocapitalization(.never).autocorrectionDisabled()
                } header: { Text("Adresse de l'instance") }
            }
            if store.settings.searchEngine == .custom {
                Section {
                    TextField("https://exemple.com/search?q=%s", text: $store.settings.customSearchTemplate)
                        .keyboardType(.URL).textInputAutocapitalization(.never).autocorrectionDisabled()
                } header: { Text("Modèle d'adresse") } footer: { Text("%s est remplacé par votre recherche.") }
            }
            Section {
                Picker("Suggestions", selection: $store.settings.suggestions) { ForEach(SuggestionsMode.allCases) { Text($0.label).tag($0) } }
                Toggle("Masquer les réponses IA", isOn: $store.settings.hideAIAnswers)
            } footer: { Text("Les réponses générées par IA sont retirées des résultats Google et Brave.") }
        }
        .navigationTitle("Recherche")
        .navigationBarTitleDisplayMode(.inline)
    }
}

// MARK: - Confidentialité

struct PrivacySettings: View {
    @EnvironmentObject var store: BrowserStore
    @State private var confirmClear = false

    var body: some View {
        List {
            Section {
                Toggle("Publicités", isOn: $store.settings.blockAds)
                Toggle("Traqueurs", isOn: $store.settings.blockTrackers)
                Toggle("Bandeaux de cookies", isOn: $store.settings.blockCookieBanners)
                NavigationLink {
                    HostListView(keyPath: \.blockerDisabledHosts, title: "Bloqueur désactivé", footer: "Sur ces sites, rien n'est bloqué. Vous pouvez aussi utiliser « Désactiver le bloqueur » dans le menu.")
                } label: { LabeledContent("Sites sans bloqueur", value: "\(store.settings.blockerDisabledHosts.count)") }
            } header: { Text("Bloquer") }
            Section {
                Toggle("JavaScript", isOn: $store.settings.javascriptEnabled)
                NavigationLink {
                    HostListView(keyPath: \.javascriptDisabledHosts, title: "Sans JavaScript", footer: "JavaScript est désactivé sur ces sites uniquement.")
                } label: { LabeledContent("Sites sans JavaScript", value: "\(store.settings.javascriptDisabledHosts.count)") }
                Toggle("Passer en HTTPS automatiquement", isOn: $store.settings.upgradeToHTTPS)
            } header: { Text("Sites") }
            Section {
                Toggle("Effacer en fermant tous les onglets", isOn: $store.settings.clearDataOnCloseAll)
                Button("Effacer l'historique et les données de sites", role: .destructive) { confirmClear = true }
            } header: { Text("Données") } footer: { Text("Qafila ne collecte rien et ne contacte aucun service tiers en dehors des sites visités et du moteur de recherche choisi.") }
        }
        .confirmationDialog("Effacer l'historique, les cookies et les caches ?", isPresented: $confirmClear, titleVisibility: .visible) {
            Button("Tout effacer", role: .destructive) { store.clearHistory(); store.clearWebsiteData(); store.flash("Données effacées") }
        }
        .navigationTitle("Confidentialité")
        .navigationBarTitleDisplayMode(.inline)
    }
}

// MARK: - Lecture

struct ReadingSettings: View {
    @EnvironmentObject var store: BrowserStore

    var body: some View {
        List {
            Section {
                Toggle("Assombrir tous les sites", isOn: $store.settings.darkenSites)
                Toggle("Seulement en mode sombre", isOn: $store.settings.darkenOnlyInDarkMode).disabled(!store.settings.darkenSites)
                NavigationLink {
                    HostListView(keyPath: \.darkenHosts, title: "Exceptions", footer: "Ces sites font l'inverse du réglage général (assombris s'il est coupé, normaux s'il est actif).")
                } label: { LabeledContent("Exceptions", value: "\(store.settings.darkenHosts.count)") }
            } header: { Text("Assombrir") }
            Section {
                HStack(spacing: 12) {
                    Image(systemName: "textformat.size.smaller").foregroundStyle(.secondary)
                    Slider(value: $store.settings.textZoom, in: 0.8...1.5, step: 0.05)
                    Image(systemName: "textformat.size.larger").foregroundStyle(.secondary)
                }
                LabeledContent("Taille", value: "\(Int((store.settings.textZoom * 100).rounded())) %")
                if store.settings.textZoom != 1 { Button("Rétablir 100 %") { store.settings.textZoom = 1 } }
            } header: { Text("Taille du texte") }
            Section {
                Picker("Traduire en", selection: $store.settings.translateLanguage) { ForEach(TranslateLanguage.allCases) { Text($0.label).tag($0) } }
                Toggle("Version bureau par défaut", isOn: $store.settings.desktopByDefault)
                NavigationLink {
                    HostListView(keyPath: \.desktopHosts, title: "Exceptions bureau", footer: "Ces sites font l'inverse du réglage « Version bureau par défaut ».")
                } label: { LabeledContent("Exceptions", value: "\(store.settings.desktopHosts.count)") }
                TextField("User agent personnalisé (vide = défaut)", text: $store.settings.customUserAgent)
                    .textInputAutocapitalization(.never).autocorrectionDisabled().font(.system(size: 14))
            } header: { Text("Pages") }
        }
        .navigationTitle("Lecture")
        .navigationBarTitleDisplayMode(.inline)
    }
}

// MARK: - Énergie

struct EnergySettings: View {
    @EnvironmentObject var store: BrowserStore
    var body: some View {
        List {
            Section {
                Toggle("Suspendre les onglets en arrière-plan", isOn: $store.settings.suspendTabsInLowPower)
            } footer: { Text("En mode économie d'énergie, les onglets que vous ne regardez pas libèrent leur page. Ils se rechargent quand vous y revenez.") }
        }
        .navigationTitle("Énergie")
        .navigationBarTitleDisplayMode(.inline)
    }
}

// MARK: - À propos

struct AboutSettings: View {
    var body: some View {
        List {
            Section {
                VStack(spacing: 4) {
                    Image("PreviewIcon-Classic").resizable().frame(width: 72, height: 72).clipShape(RoundedRectangle(cornerRadius: 16, style: .continuous))
                    Text("Qafila").font(.system(size: 28, weight: .medium, design: .serif)).padding(.top, 8)
                    Text("قافلة").font(.system(size: 17)).foregroundStyle(.secondary)
                    Text("« caravane » en arabe").font(.system(size: 13)).foregroundStyle(.tertiary)
                }
                .frame(maxWidth: .infinity).padding(.vertical, 12)
                .listRowBackground(Color.clear)
            }
            Section {
                LabeledContent("Version", value: Bundle.main.infoDictionary?["CFBundleShortVersionString"] as? String ?? "1.0")
                LabeledContent("Moteur", value: "WebKit")
                LabeledContent("Données collectées", value: "Aucune")
                Link("Code source", destination: URL(string: "https://github.com/Fefe-Kurylen/qafila")!)
            }
        }
        .navigationTitle("À propos")
        .navigationBarTitleDisplayMode(.inline)
    }
}
