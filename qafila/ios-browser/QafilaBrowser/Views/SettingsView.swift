import SwiftUI
import WebKit

/// Réglages, organisés comme ceux de Quiche : recherche, apparence, barre d'adresse, onglets, confidentialité, lecture.
struct SettingsView: View {
    @EnvironmentObject var store: BrowserStore
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        NavigationStack {
            Form {
                Section("Recherche") {
                    Picker("Moteur de recherche", selection: $store.settings.searchEngine) { ForEach(SearchEngine.allCases) { Text($0.label).tag($0) } }
                    if store.settings.searchEngine.needsBaseURL {
                        TextField(store.settings.searchEngine == .qafila ? "https://mon-qafila.example.com" : "https://ma-instance-searxng", text: $store.settings.searchBaseURL)
                            .keyboardType(.URL).textInputAutocapitalization(.never).autocorrectionDisabled()
                    }
                    Toggle("Suggestions pendant la saisie", isOn: $store.settings.showSuggestions)
                    Picker("Nouvel onglet", selection: $store.settings.newTabPage) { ForEach(NewTabPage.allCases) { Text($0.label).tag($0) } }
                    if store.settings.newTabPage == .custom {
                        TextField("https://…", text: $store.settings.newTabCustomURL).keyboardType(.URL).textInputAutocapitalization(.never).autocorrectionDisabled()
                    }
                }

                Section("Apparence") {
                    Picker("Thème", selection: $store.settings.appearance) { ForEach(Appearance.allCases) { Text($0.label).tag($0) } }
                    Picker("Couleur", selection: $store.settings.accent) {
                        ForEach(AccentColor.allCases) { a in HStack { Circle().fill(a.color).frame(width: 14, height: 14); Text(a.label) }.tag(a) }
                    }
                    Toggle("Adapter la couleur au site", isOn: $store.settings.adaptToSiteColor)
                    Toggle("Vibrations", isOn: $store.settings.haptics)
                }

                Section("Barre d'outils") {
                    NavigationLink { ToolbarEditorView(embedded: true) } label: { Label("Personnaliser la barre et le menu", systemImage: "slider.horizontal.3") }
                    NavigationLink { ToolbarGalleryView(embedded: true) } label: { Label("Galerie de barres", systemImage: "square.grid.2x2") }
                    Picker("Style", selection: $store.settings.toolbar.style) { ForEach(ToolbarStyle.allCases) { Text($0.label).tag($0) } }
                    Picker("Position", selection: $store.settings.toolbar.position) { ForEach(ToolbarPosition.allCases) { Text($0.label).tag($0) } }
                    Toggle("Masquer les barres au défilement", isOn: $store.settings.hideBarsOnScroll)
                }

                Section("Barre d'adresse") {
                    Toggle("Icône du site", isOn: $store.settings.addressShowsFavicon)
                    Toggle("Temps de lecture", isOn: $store.settings.addressShowsReadingTime)
                    Toggle("Titre de la page plutôt que le domaine", isOn: $store.settings.addressShowsTitle)
                }

                Section("Onglets") {
                    Picker("Affichage", selection: $store.settings.tabsLayout) { ForEach(TabsLayout.allCases) { Text($0.label).tag($0) } }
                    Picker("Trier par", selection: $store.settings.tabsSort) { ForEach(TabsSort.allCases) { Text($0.label).tag($0) } }
                    Toggle("Grouper par site", isOn: $store.settings.groupTabsByDomain)
                    Picker("Vignettes", selection: $store.settings.thumbnailSize) { ForEach(ThumbnailSize.allCases) { Text($0.label).tag($0) } }
                    Toggle("Afficher le temps de lecture", isOn: $store.settings.showReadingTime)
                }

                Section {
                    Toggle("Bloquer pubs et traqueurs", isOn: $store.settings.blockerEnabled)
                    Toggle("Masquer les bandeaux de cookies", isOn: $store.settings.blockCookieBanners).disabled(!store.settings.blockerEnabled)
                    Toggle("JavaScript", isOn: $store.settings.javascriptEnabled)
                    if !store.settings.javascriptDisabledHosts.isEmpty {
                        NavigationLink("Sites sans JavaScript (\(store.settings.javascriptDisabledHosts.count))") { hostList(\.javascriptDisabledHosts, title: "Sites sans JavaScript") }
                    }
                    Toggle("Passer en HTTPS automatiquement", isOn: $store.settings.upgradeToHTTPS)
                    TextField("User agent personnalisé (vide = défaut)", text: $store.settings.customUserAgent).textInputAutocapitalization(.never).autocorrectionDisabled()
                    if !store.settings.desktopHosts.isEmpty {
                        NavigationLink("Sites en version bureau (\(store.settings.desktopHosts.count))") { hostList(\.desktopHosts, title: "Sites en version bureau") }
                    }
                    Button(role: .destructive) { store.clearHistory(); clearWebsiteData() } label: { Text("Effacer l'historique et les données de sites") }
                } header: { Text("Confidentialité") } footer: { Text("Qafila ne collecte rien et ne contacte aucun service tiers en dehors des sites que vous visitez et du moteur de recherche choisi.") }

                Section("Lecture") {
                    Toggle("Assombrir tous les sites", isOn: $store.settings.darkenSites)
                    if !store.settings.darkenHosts.isEmpty {
                        NavigationLink("Exceptions (\(store.settings.darkenHosts.count))") { hostList(\.darkenHosts, title: "Exceptions d'assombrissement") }
                    }
                }

                Section("À propos") {
                    LabeledContent("Version", value: Bundle.main.infoDictionary?["CFBundleShortVersionString"] as? String ?? "1.0")
                    LabeledContent("Moteur", value: "WebKit (le même que Safari)")
                    Link("Code source", destination: URL(string: "https://github.com/Fefe-Kurylen/jeu-final/tree/claude/furtif-navigateur/qafila/ios-browser")!)
                }
            }
            .onChange(of: store.settings.blockerEnabled) { _, _ in store.tabManager.applyRules() }
            .onChange(of: store.settings.blockCookieBanners) { _, _ in store.tabManager.applyRules() }
            .navigationTitle("Réglages")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar { ToolbarItem(placement: .confirmationAction) { Button("OK") { dismiss() } } }
        }
    }

    private func hostList(_ keyPath: WritableKeyPath<Settings, Set<String>>, title: String) -> some View {
        List {
            ForEach(store.settings[keyPath: keyPath].sorted(), id: \.self) { h in Text(h) }
                .onDelete { idx in
                    let sorted = store.settings[keyPath: keyPath].sorted()
                    for i in idx { store.settings[keyPath: keyPath].remove(sorted[i]) }
                }
        }
        .navigationTitle(title)
    }

    private func clearWebsiteData() {
        let types = WKWebsiteDataStore.allWebsiteDataTypes()
        WKWebsiteDataStore.default().removeData(ofTypes: types, modifiedSince: .distantPast) {}
    }
}
