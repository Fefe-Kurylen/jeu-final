import SwiftUI

/// Rendu d'une barre (aperçu dans l'éditeur et la galerie), avec la palette courante.
struct BarPreview: View {
    @EnvironmentObject var store: BrowserStore
    @Environment(\.colorScheme) private var scheme
    let config: ToolbarConfig

    var body: some View {
        let palette = ChromePalette.make(store.settings, scheme: scheme, site: nil)
        VStack(spacing: 2) {
            if !config.hasInlineAddress && store.settings.addressStyle != .hidden { AddressCard().padding(.horizontal, 10).padding(.top, 8) }
            ToolbarRow(forceInlineAddress: false, preview: config.bar).padding(.horizontal, 6).frame(height: 44)
        }
        .padding(.bottom, 4)
        .environment(\.chromeCard, palette.card)
        .modifier(SchemeOverride(scheme: palette.contentScheme))
        .background(ChromeBackground(palette: palette, style: store.settings.toolbar.style))
        .clipShape(RoundedRectangle(cornerRadius: 16, style: .continuous))
        .overlay(RoundedRectangle(cornerRadius: 16, style: .continuous).strokeBorder(Color.primary.opacity(0.08), lineWidth: 0.5))
        .allowsHitTesting(false)
    }
}

/// Éditeur de barre et de menu, comme dans Quiche : chaque bouton peut être dans la barre, dans le menu, dans les deux ou nulle part ;
/// on réordonne par glisser, on choisit la taille, on ajoute des séparateurs.
struct ToolbarEditorView: View {
    @EnvironmentObject var store: BrowserStore
    @Environment(\.dismiss) private var dismiss
    @State private var editMode: EditMode = .active
    /// `embedded` : poussé dans une pile de navigation existante (Réglages) plutôt que présenté en feuille.
    var embedded = false

    var body: some View {
        if embedded { content } else { NavigationStack { content } }
    }

    private var content: some View {
        List {
            Section {
                BarPreview(config: store.settings.toolbar)
                    .listRowInsets(EdgeInsets(top: 6, leading: 0, bottom: 6, trailing: 0))
                    .listRowBackground(Color.clear)
            }

            Section {
                ForEach($store.settings.toolbar.bar) { $slot in slotRow($slot, inMenu: false) }
                    .onMove { store.settings.toolbar.bar.move(fromOffsets: $0, toOffset: $1) }
                    .onDelete { store.settings.toolbar.bar.remove(atOffsets: $0) }
                addMenu(available: available(inMenu: false)) { store.settings.toolbar.bar.append($0) }
            } header: { Text("Barre") }
              footer: { Text("Jusqu'à 7 boutons. « Adresse » place la barre d'adresse sur la même ligne que les icônes.") }

            Section {
                ForEach($store.settings.toolbar.menu) { $slot in slotRow($slot, inMenu: true) }
                    .onMove { store.settings.toolbar.menu.move(fromOffsets: $0, toOffset: $1) }
                    .onDelete { store.settings.toolbar.menu.remove(atOffsets: $0) }
                addMenu(available: available(inMenu: true)) { store.settings.toolbar.menu.append(ToolbarSlot(action: $0.action, showsLabel: $0.showsLabel)) }
            } header: { Text("Menu") } footer: { Text("Les éléments « icône seule » qui se suivent forment une rangée de tuiles ; les séparateurs créent des sections.") }

            Section {
                NavigationLink { ToolbarGalleryView(embedded: true) } label: { Label("Galerie de barres", systemImage: "square.grid.2x2") }
                Button { store.settings.toolbar.menu = ToolbarConfig.standardMenu } label: { Label("Rétablir le menu par défaut", systemImage: "arrow.counterclockwise") }
                Button(role: .destructive) {
                    var c = ToolbarConfig.preset(.complete); c.style = store.settings.toolbar.style; c.position = store.settings.toolbar.position
                    store.settings.toolbar = c
                } label: { Label("Tout rétablir", systemImage: "arrow.counterclockwise") }
            }
        }
        .environment(\.editMode, $editMode)
        .navigationTitle("Personnaliser")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar { if !embedded { ToolbarItem(placement: .confirmationAction) { Button("OK") { dismiss() }.fontWeight(.semibold) } } }
    }

    private func available(inMenu: Bool) -> [ToolbarAction] {
        let used = Set((inMenu ? store.settings.toolbar.menu : store.settings.toolbar.bar).map(\.action))
        return ToolbarAction.allCases.filter { a in
            a != .separator && !used.contains(a) && !(inMenu && (a == .menu || a == .address))
        }
    }

    private func slotRow(_ slot: Binding<ToolbarSlot>, inMenu: Bool) -> some View {
        let a = slot.wrappedValue.action
        return HStack(spacing: 12) {
            Group {
                if a == .tabs { TabsGlyph(count: store.tabs.count, size: 16, stroke: 1.2) }
                else { Image(systemName: a.symbol).font(.system(size: 16)) }
            }
            .frame(width: 26)
            .foregroundStyle(a.isDestructive ? Color.red : a == .separator ? Color.secondary : Color.primary)
            Text(a == .separator ? "— Séparateur —" : a.label).foregroundStyle(a == .separator ? .secondary : .primary)
            Spacer()
            if a != .separator && a != .address {
                Menu {
                    if inMenu {
                        Picker("Forme", selection: slot.showsLabel) { Text("Ligne avec intitulé").tag(true); Text("Icône seule (tuile)").tag(false) }
                    } else {
                        Picker("Taille", selection: slot.size) { ForEach(ButtonSize.allCases) { Text($0.label).tag($0) } }
                    }
                } label: {
                    Text(inMenu ? (slot.wrappedValue.showsLabel ? "Ligne" : "Tuile") : slot.wrappedValue.size.label)
                        .font(.system(size: 13)).foregroundStyle(.secondary)
                        .padding(.horizontal, 8).padding(.vertical, 4)
                        .background(Capsule().fill(Color.primary.opacity(0.06)))
                }
            }
        }
    }

    private func addMenu(available: [ToolbarAction], add: @escaping (ToolbarSlot) -> Void) -> some View {
        Menu {
            Button { add(ToolbarSlot(action: .separator)) } label: { Label("Séparateur", systemImage: "minus") }
            Divider()
            ForEach(available) { a in Button { add(ToolbarSlot(action: a)) } label: { Label(a.label, systemImage: a.symbol) } }
        } label: { Label("Ajouter", systemImage: "plus.circle.fill") }
    }
}

/// Galerie de barres prêtes à l'emploi (« Toolbar Gallery » de Quiche), points de départ à ajuster ensuite.
struct ToolbarGalleryView: View {
    @EnvironmentObject var store: BrowserStore
    @Environment(\.dismiss) private var dismiss
    var embedded = false

    var body: some View {
        if embedded { content } else { NavigationStack { content } }
    }

    private var content: some View {
        ScrollView {
            VStack(spacing: 22) {
                ForEach(ToolbarConfig.Preset.allCases) { p in
                    let cfg = ToolbarConfig.preset(p)
                    let current = store.settings.toolbar.bar.map(\.action) == cfg.bar.map(\.action)
                    Button {
                        var c = cfg
                        c.menu = store.settings.toolbar.menu
                        c.style = store.settings.toolbar.style
                        c.position = store.settings.toolbar.position
                        store.settings.toolbar = c
                        store.haptic(.medium)
                        if !embedded { dismiss() }
                    } label: {
                        VStack(alignment: .leading, spacing: 8) {
                            HStack(alignment: .firstTextBaseline) {
                                Text(p.label).font(.system(size: 17, weight: .semibold))
                                Spacer()
                                if current { Image(systemName: "checkmark.circle.fill").foregroundStyle(Color.accentColor) }
                            }
                            Text(p.description).font(.system(size: 13)).foregroundStyle(.secondary).multilineTextAlignment(.leading)
                            BarPreview(config: cfg).padding(.top, 4)
                        }
                        .padding(.horizontal, 4)
                    }
                    .buttonStyle(.plain)
                }
            }
            .padding(16)
        }
        .background(Color(.systemGroupedBackground))
        .navigationTitle("Galerie de barres")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar { if !embedded { ToolbarItem(placement: .cancellationAction) { Button("Fermer") { dismiss() } } } }
    }
}
