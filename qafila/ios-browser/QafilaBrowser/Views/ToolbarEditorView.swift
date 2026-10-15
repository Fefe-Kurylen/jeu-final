import SwiftUI

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
                    ToolbarView(slots: store.settings.toolbar.bar)
                        .environmentObject(store)
                        .allowsHitTesting(false)
                        .background(RoundedRectangle(cornerRadius: 14).fill(Color(.secondarySystemBackground)))
                        .listRowInsets(EdgeInsets(top: 8, leading: 12, bottom: 8, trailing: 12))
                        .listRowBackground(Color.clear)
                } header: { Text("Aperçu") }

                Section {
                    ForEach($store.settings.toolbar.bar) { $slot in slotRow($slot, inMenu: false) }
                        .onMove { store.settings.toolbar.bar.move(fromOffsets: $0, toOffset: $1) }
                        .onDelete { store.settings.toolbar.bar.remove(atOffsets: $0) }
                    addMenu(available: available(for: \.bar), separatorAllowed: true) { store.settings.toolbar.bar.append($0) }
                } header: { Text("Barre d'outils (\(store.settings.toolbar.bar.filter { $0.action != .separator }.count) boutons)") }
                  footer: { Text("Au-delà de 6 boutons, la barre devient serrée. Glissez pour réordonner, balayez pour retirer.") }

                Section {
                    ForEach($store.settings.toolbar.menu) { $slot in slotRow($slot, inMenu: true) }
                        .onMove { store.settings.toolbar.menu.move(fromOffsets: $0, toOffset: $1) }
                        .onDelete { store.settings.toolbar.menu.remove(atOffsets: $0) }
                    addMenu(available: available(for: \.menu), separatorAllowed: true) { store.settings.toolbar.menu.append($0) }
                } header: { Text("Menu") } footer: { Text("Les éléments « icône seule » consécutifs forment une rangée d'icônes ; les séparateurs créent des sections.") }

                Section {
                    Picker("Style", selection: $store.settings.toolbar.style) { ForEach(ToolbarStyle.allCases) { Text($0.label).tag($0) } }
                    Picker("Position", selection: $store.settings.toolbar.position) { ForEach(ToolbarPosition.allCases) { Text($0.label).tag($0) } }
                    NavigationLink { ToolbarGalleryView(embedded: true) } label: { Label("Galerie de barres prêtes à l'emploi", systemImage: "square.grid.2x2") }
                    Button(role: .destructive) { store.settings.toolbar = .preset(.complete) } label: { Label("Rétablir la barre par défaut", systemImage: "arrow.counterclockwise") }
                }
            }
            .environment(\.editMode, $editMode)
            .navigationTitle("Personnaliser")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar { if !embedded { ToolbarItem(placement: .confirmationAction) { Button("OK") { dismiss() } } } }
    }

    private func available(for keyPath: KeyPath<ToolbarConfig, [ToolbarSlot]>) -> [ToolbarAction] {
        let used = Set(store.settings.toolbar[keyPath: keyPath].map(\.action))
        return ToolbarAction.allCases.filter { $0 != .separator && !used.contains($0) }
    }

    private func slotRow(_ slot: Binding<ToolbarSlot>, inMenu: Bool) -> some View {
        HStack(spacing: 12) {
            Image(systemName: slot.wrappedValue.action.symbol).frame(width: 26).foregroundStyle(slot.wrappedValue.action.isDestructive ? .red : .primary)
            Text(slot.wrappedValue.action.label)
            Spacer()
            if slot.wrappedValue.action != .separator {
                Menu {
                    Picker("Taille", selection: slot.size) { ForEach(ButtonSize.allCases) { Text($0.label).tag($0) } }
                    if inMenu { Toggle("Afficher l'intitulé", isOn: slot.showsLabel) }
                } label: {
                    Text(inMenu && !slot.wrappedValue.showsLabel ? "Icône · \(slot.wrappedValue.size.label)" : slot.wrappedValue.size.label)
                        .font(.system(size: 13)).foregroundStyle(.secondary)
                }
            }
        }
    }

    private func addMenu(available: [ToolbarAction], separatorAllowed: Bool, add: @escaping (ToolbarSlot) -> Void) -> some View {
        Menu {
            ForEach(available) { a in Button { add(ToolbarSlot(action: a)) } label: { Label(a.label, systemImage: a.symbol) } }
            if separatorAllowed { Divider(); Button { add(ToolbarSlot(action: .separator)) } label: { Label("Séparateur", systemImage: "minus") } }
        } label: { Label("Ajouter un bouton", systemImage: "plus.circle.fill") }
    }
}

/// Galerie de barres prêtes à l'emploi (« Toolbar Gallery »), points de départ à ajuster ensuite.
struct ToolbarGalleryView: View {
    @EnvironmentObject var store: BrowserStore
    @Environment(\.dismiss) private var dismiss
    var embedded = false

    var body: some View {
        if embedded { content } else { NavigationStack { content } }
    }

    private var content: some View {
            ScrollView {
                VStack(spacing: 16) {
                    ForEach(ToolbarConfig.Preset.allCases) { p in
                        let cfg = ToolbarConfig.preset(p)
                        Button {
                            var c = cfg; c.style = store.settings.toolbar.style; c.position = store.settings.toolbar.position
                            store.settings.toolbar = c; store.haptic(.medium); dismiss()
                        } label: {
                            VStack(alignment: .leading, spacing: 10) {
                                HStack { Text(p.label).font(.headline); Spacer(); if store.settings.toolbar.bar == cfg.bar { Image(systemName: "checkmark.circle.fill").foregroundStyle(Color.accentColor) } }
                                Text(p.description).font(.subheadline).foregroundStyle(.secondary).multilineTextAlignment(.leading)
                                ToolbarView(slots: cfg.bar).environmentObject(store).allowsHitTesting(false)
                                    .background(RoundedRectangle(cornerRadius: 12).fill(Color(.tertiarySystemBackground)))
                            }
                            .padding(16)
                            .background(RoundedRectangle(cornerRadius: 18).fill(Color(.secondarySystemBackground)))
                        }
                        .buttonStyle(.plain)
                    }
                }
                .padding(16)
            }
            .navigationTitle("Galerie de barres")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar { if !embedded { ToolbarItem(placement: .cancellationAction) { Button("Fermer") { dismiss() } } } }
    }
}
