package fr.qafila.browser.ui

import android.webkit.WebView
import androidx.activity.compose.BackHandler
import androidx.compose.animation.AnimatedContent
import androidx.compose.animation.core.tween
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.slideInHorizontally
import androidx.compose.animation.slideOutHorizontally
import androidx.compose.animation.togetherWith
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyListScope
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import fr.qafila.browser.data.AccentColor
import fr.qafila.browser.data.AddressLongPressAction
import fr.qafila.browser.data.AddressStyle
import fr.qafila.browser.data.AddressTapAction
import fr.qafila.browser.data.AppIcon
import fr.qafila.browser.data.Appearance
import fr.qafila.browser.data.AutoCloseTabs
import fr.qafila.browser.data.BarColor
import fr.qafila.browser.data.BrowserStore
import fr.qafila.browser.data.GridSize
import fr.qafila.browser.data.IconWeight
import fr.qafila.browser.data.MenuIconStyle
import fr.qafila.browser.data.NewTabPage
import fr.qafila.browser.data.ScrollBehavior
import fr.qafila.browser.data.SearchEngine
import fr.qafila.browser.data.Settings
import fr.qafila.browser.data.SettingsPage
import fr.qafila.browser.data.SuggestionsMode
import fr.qafila.browser.data.TabsLayout
import fr.qafila.browser.data.TabsSort
import fr.qafila.browser.data.ToolbarPosition
import fr.qafila.browser.data.ToolbarStyle
import fr.qafila.browser.data.TranslateLanguage
import fr.qafila.browser.web.ContentBlocker

/** Réglages : navigation à sous-pages, style réglages iOS sobre (DESIGN.md §6). */
@Composable
fun SettingsScreen(store: BrowserStore, onDismiss: () -> Unit) {
    val stack by store.settingsStack.collectAsState()
    fun push(p: SettingsPage) { store.settingsStack.value = stack + p }
    fun pop() { if (stack.size > 1) store.settingsStack.value = stack.dropLast(1) else onDismiss() }
    BackHandler { pop() }
    AnimatedContent(
        targetState = stack,
        transitionSpec = {
            val forward = targetState.size >= initialState.size
            (slideInHorizontally(tween(220)) { if (forward) it / 3 else -it / 3 } + fadeIn(tween(220))) togetherWith (slideOutHorizontally(tween(220)) { if (forward) -it / 4 else it / 4 } + fadeOut(tween(160)))
        },
        label = "settings",
    ) { st ->
        val page = st.last()
        val back = if (st.size > 1) st[st.size - 2].title else null
        val onBack: () -> Unit = { pop() }
        when (page) {
            SettingsPage.ROOT -> RootPage(store, onDismiss) { push(it) }
            SettingsPage.EDITOR -> ToolbarEditorPage(store, back ?: "OK", onBack) { push(SettingsPage.GALLERY) }
            SettingsPage.GALLERY -> ToolbarGalleryPage(store, back ?: "OK", onBack)
            else -> QPage(page.title, onBack, backLabel = back ?: "OK") { pageContent(store, page) { push(it) } }
        }
    }
}

@Composable
private fun RootPage(store: BrowserStore, onDismiss: () -> Unit, open: (SettingsPage) -> Unit) {
    val state by store.state.collectAsState()
    val q = LocalQ.current
    QPage("Réglages", onBack = null, trailing = { TextAction("OK", onClick = onDismiss) }) {
        item {
            Spacer(Modifier.height(12.dp))
            GroupCard {
                NavRow("Apparence", icon = QIcon.CONTRAST) { open(SettingsPage.APPEARANCE) }; RowDivider(50.dp)
                NavRow("Barre d'outils", icon = QIcon.BAR) { open(SettingsPage.TOOLBAR) }; RowDivider(50.dp)
                NavRow("Barre d'adresse", value = state.settings.addressStyle.label, icon = QIcon.ADDRESS) { open(SettingsPage.ADDRESS) }; RowDivider(50.dp)
                NavRow("Onglets", icon = QIcon.TABS) { open(SettingsPage.TABS) }
            }
            Spacer(Modifier.height(24.dp))
            GroupCard {
                NavRow("Recherche", value = state.settings.searchEngine.label.substringBefore(" ("), icon = QIcon.SEARCH) { open(SettingsPage.SEARCH) }; RowDivider(50.dp)
                NavRow("Confidentialité et sécurité", icon = QIcon.SHIELD) { open(SettingsPage.PRIVACY) }; RowDivider(50.dp)
                NavRow("Lecture", icon = QIcon.READER) { open(SettingsPage.READING) }; RowDivider(50.dp)
                NavRow("Énergie", icon = QIcon.BATTERY) { open(SettingsPage.ENERGY) }
            }
            Spacer(Modifier.height(24.dp))
            GroupCard {
                NavRow("Favoris", icon = QIcon.BOOK) { onDismiss(); store.showBookmarks.value = true }; RowDivider(50.dp)
                NavRow("Historique", icon = QIcon.CLOCK) { onDismiss(); store.showHistory.value = true }
            }
            Spacer(Modifier.height(24.dp))
            GroupCard { NavRow("À propos", icon = QIcon.INFO) { open(SettingsPage.ABOUT) } }
            Spacer(Modifier.height(28.dp))
            Column(Modifier.fillMaxWidth(), horizontalAlignment = Alignment.CenterHorizontally) {
                Text("Qafila", color = q.secondary, fontSize = 15.sp, fontFamily = androidx.compose.ui.text.font.FontFamily.Serif)
                Text("قافلة", color = q.tertiary, fontSize = 13.sp)
            }
        }
    }
}

private fun LazyListScope.pageContent(store: BrowserStore, page: SettingsPage, open: (SettingsPage) -> Unit) {
    when (page) {
        SettingsPage.APPEARANCE -> item { AppearancePage(store) }
        SettingsPage.TOOLBAR -> item { ToolbarPage(store, open) }
        SettingsPage.ADDRESS -> item { AddressPage(store) }
        SettingsPage.TABS -> item { TabsPage(store) }
        SettingsPage.SEARCH -> item { SearchPage(store) }
        SettingsPage.PRIVACY -> item { PrivacyPage(store) }
        SettingsPage.READING -> item { ReadingPage(store) }
        SettingsPage.ENERGY -> item { EnergyPage(store) }
        SettingsPage.ABOUT -> item { AboutPage(store) }
        else -> Unit
    }
}

@Composable
private fun settingsOf(store: BrowserStore): Settings = store.state.collectAsState().value.settings

@Composable
private fun LivePreview(s: Settings) = Box(Modifier.padding(start = 16.dp, end = 16.dp, top = 12.dp)) { ChromePreview(s) }

@Composable
private fun SegmentedSection(title: String, options: List<String>, selected: Int, footer: String? = null, onSelect: (Int) -> Unit) {
    SectionHeader(title)
    Segmented(options, selected, Modifier.padding(horizontal = 16.dp), onSelect)
    if (footer != null) SectionFooter(footer)
}

// ---------------------------------------------------------------- Apparence
@Composable
private fun AppearancePage(store: BrowserStore) {
    val s = settingsOf(store)
    val q = LocalQ.current
    fun up(c: (Settings) -> Settings) = store.updateSettings(c)
    Column {
        LivePreview(s)
        SegmentedSection("Thème", Appearance.entries.map { it.label }, s.appearance.ordinal) { i -> up { it.copy(appearance = Appearance.entries[i]) } }

        SectionHeader("Couleur d'accent")
        GroupCard {
            Row(Modifier.fillMaxWidth().padding(horizontal = 12.dp, vertical = 14.dp), horizontalArrangement = Arrangement.SpaceBetween) {
                AccentColor.entries.forEach { a ->
                    val c = if (a == AccentColor.MONO) q.text else Color(a.argb)
                    Swatch(c, selected = s.accent == a) { up { it.copy(accent = a) } }
                }
            }
            RowDivider(); Text(s.accent.label, Modifier.padding(horizontal = 16.dp, vertical = 11.dp), color = q.secondary, fontSize = 13.sp)
        }

        BarColorSection("Couleur de la barre — mode clair", s.barColorLight, dark = false) { c -> up { it.copy(barColorLight = c) } }
        BarColorSection("Couleur de la barre — mode sombre", s.barColorDark, dark = true) { c -> up { it.copy(barColorDark = c) } }

        SegmentedSection("Style de la barre", ToolbarStyle.entries.map { it.label }, s.toolbar.style.ordinal,
            "Classique : couleur pleine. Verre : barre translucide. Flottante : barre arrondie détachée des bords, la page passe autour.") { i -> up { it.copy(toolbar = it.toolbar.copy(style = ToolbarStyle.entries[i])) } }

        SectionHeader("Icône de l'application")
        GroupCard {
            Row(Modifier.fillMaxWidth().padding(vertical = 14.dp), horizontalArrangement = Arrangement.SpaceEvenly) {
                AppIcon.entries.forEach { ic ->
                    Column(Modifier.pressFade { up { it.copy(appIcon = ic) } }, horizontalAlignment = Alignment.CenterHorizontally) {
                        AppIconTile(ic, selected = s.appIcon == ic)
                        Spacer(Modifier.height(6.dp))
                        Text(ic.label, color = if (s.appIcon == ic) q.text else q.secondary, fontSize = 12.sp, fontWeight = if (s.appIcon == ic) FontWeight.SemiBold else FontWeight.Normal)
                    }
                }
            }
        }
        SectionFooter("L'icône change sur l'écran d'accueil après quelques secondes.")

        SectionHeader("Retour haptique")
        GroupCard { ToggleRow("Vibrations", s.haptics) { v -> up { it.copy(haptics = v) } } }
    }
}

@Composable
private fun Swatch(color: Color, selected: Boolean, content: (@Composable () -> Unit)? = null, onClick: () -> Unit) {
    val q = LocalQ.current
    Box(Modifier.size(34.dp).pressFade(onClick = onClick).then(if (selected) Modifier.border(1.5.dp, q.text, CircleShape) else Modifier).padding(4.dp), contentAlignment = Alignment.Center) {
        Box(Modifier.size(26.dp).clip(CircleShape).background(color).border(0.5.dp, q.separator, CircleShape), contentAlignment = Alignment.Center) { content?.invoke() }
    }
}

@Composable
private fun BarColorSection(title: String, selected: BarColor, dark: Boolean, onSelect: (BarColor) -> Unit) {
    val q = LocalQ.current
    SectionHeader(title)
    GroupCard {
        Row(Modifier.fillMaxWidth().padding(horizontal = 10.dp, vertical = 14.dp), horizontalArrangement = Arrangement.SpaceBetween) {
            BarColor.entries.forEach { c ->
                if (c == BarColor.AUTO) Box(Modifier.size(34.dp).pressFade { onSelect(c) }.then(if (selected == c) Modifier.border(1.5.dp, q.text, CircleShape) else Modifier).padding(4.dp), contentAlignment = Alignment.Center) {
                    Box(Modifier.size(26.dp).clip(CircleShape).background(Brush.sweepGradient(listOf(Color(0xFFF6DCE6), Color(0xFFECE8F5), Color(0xFF7E91A8), Color(0xFFF2F2F7), Color(0xFFF6DCE6)))), contentAlignment = Alignment.Center) {
                        Text("A", color = Color(0xFF111111), fontSize = 12.sp, fontWeight = FontWeight.SemiBold)
                    }
                } else Swatch(Color(c.argb), selected == c) { onSelect(c) }
            }
        }
        RowDivider()
        Text(if (selected == BarColor.AUTO) "Auto : couleur du site (${if (dark) "barre sombre si le site est clair" else "gris clair par défaut"})" else selected.label,
            Modifier.padding(horizontal = 16.dp, vertical = 11.dp), color = q.secondary, fontSize = 13.sp)
    }
}

/** Aperçu des icônes alternatives (mêmes couleurs que les ressources du lanceur). */
@Composable
fun AppIconTile(icon: AppIcon, selected: Boolean) {
    val q = LocalQ.current
    val (bg, fg) = when (icon) {
        AppIcon.CLASSIC -> Color.White to Color(0xFF17191C)
        AppIcon.DARK -> Color(0xFF17191C) to Color.White
        AppIcon.INK -> Color(0xFF14233C) to Color(0xFFF3EEE3)
        AppIcon.DESERT -> Color(0xFFE9D7B7) to Color(0xFF7A4E25)
    }
    Box(Modifier.size(58.dp).border(if (selected) 2.dp else 0.5.dp, if (selected) q.text else q.separator, RoundedCornerShape(15.dp)).padding(3.dp).clip(RoundedCornerShape(12.dp)).background(bg), contentAlignment = Alignment.Center) {
        Box(Modifier.size(26.dp).border(7.dp, fg, CircleShape))
    }
}

// ---------------------------------------------------------------- Barre d'outils
@Composable
private fun ToolbarPage(store: BrowserStore, open: (SettingsPage) -> Unit) {
    val s = settingsOf(store)
    val q = LocalQ.current
    fun up(c: (Settings) -> Settings) = store.updateSettings(c)
    Column {
        LivePreview(s)
        Spacer(Modifier.height(20.dp))
        GroupCard {
            NavRow("Personnaliser la barre et le menu", icon = QIcon.SLIDERS) { open(SettingsPage.EDITOR) }; RowDivider(50.dp)
            NavRow("Galerie de barres", icon = QIcon.GRID) { open(SettingsPage.GALLERY) }
        }
        SegmentedSection("Position", ToolbarPosition.entries.map { it.label }, s.toolbar.position.ordinal) { i -> up { it.copy(toolbar = it.toolbar.copy(position = ToolbarPosition.entries[i])) } }
        Spacer(Modifier.height(10.dp))
        GroupCard { ToggleRow("Barre en haut en mode paysage", s.landscapeTopBar) { v -> up { it.copy(landscapeTopBar = v) } } }

        SegmentedSection("Graisse des icônes", IconWeight.entries.map { it.label }, s.iconWeight.ordinal) { i -> up { it.copy(iconWeight = IconWeight.entries[i]) } }

        SectionHeader("Icône du menu")
        GroupCard {
            Row(Modifier.fillMaxWidth().padding(vertical = 12.dp), horizontalArrangement = Arrangement.SpaceEvenly) {
                MenuIconStyle.entries.forEach { m ->
                    val sel = s.menuIcon == m
                    Column(Modifier.pressFade { up { it.copy(menuIcon = m) } }.padding(horizontal = 8.dp), horizontalAlignment = Alignment.CenterHorizontally) {
                        Box(Modifier.size(52.dp).clip(RoundedCornerShape(12.dp)).background(if (sel) q.fill else Color.Transparent).border(if (sel) 1.dp else 0.5.dp, if (sel) q.text else q.separator, RoundedCornerShape(12.dp)), contentAlignment = Alignment.Center) {
                            QIconView(fr.qafila.browser.data.ToolbarAction.MENU.qicon(menuIcon = m), m.label, q.text, 22.dp)
                        }
                        Spacer(Modifier.height(6.dp))
                        Text(m.label, color = if (sel) q.text else q.secondary, fontSize = 12.sp)
                    }
                }
            }
        }

        SectionHeader("Au défilement")
        ChoiceCard(ScrollBehavior.entries, s.scrollBehavior, { it.label }, { it.description }) { v -> up { it.copy(scrollBehavior = v) } }

        SectionHeader("Gestes")
        GroupCard { ToggleRow("Balayer l'adresse pour Précédent / Suivant", s.swipeBarNavigation) { v -> up { it.copy(swipeBarNavigation = v) } } }
        SectionFooter("Glissez l'adresse vers la droite pour revenir, vers la gauche pour avancer. Les bords de l'écran restent au geste Retour d'Android, qui revient aussi à la page précédente.")
    }
}

// ---------------------------------------------------------------- Barre d'adresse
@Composable
private fun AddressPage(store: BrowserStore) {
    val s = settingsOf(store)
    val q = LocalQ.current
    fun up(c: (Settings) -> Settings) = store.updateSettings(c)
    val bar = barColorsFor(resolveBarColor(s, q.dark, if (q.dark) Color(0xFF1E1D1B) else Color(0xFFF6F3EE), private = false, darkened = false))
    Column {
        LivePreview(s)
        SectionHeader("Style")
        GroupCard {
            AddressStyle.entries.forEachIndexed { i, st ->
                Column(Modifier.fillMaxWidth().rowClick { up { it.copy(addressStyle = st) } }.padding(horizontal = 16.dp, vertical = 12.dp)) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Column(Modifier.weight(1f)) {
                            Text(st.label, color = q.text, fontSize = 15.sp)
                            Text(st.description, color = q.secondary, fontSize = 12.5.sp, lineHeight = 16.sp)
                        }
                        if (s.addressStyle == st) QIconView(QIcon.CHECK, "Sélectionné", q.accent, 18.dp)
                    }
                    Spacer(Modifier.height(10.dp))
                    Box(Modifier.fillMaxWidth().clip(RoundedCornerShape(12.dp)).background(bar.bg).padding(8.dp)) {
                        if (st == AddressStyle.HIDDEN) Row(Modifier.fillMaxWidth().height(36.dp), horizontalArrangement = Arrangement.SpaceEvenly, verticalAlignment = Alignment.CenterVertically) {
                            listOf(QIcon.PLUS, QIcon.SEARCH, QIcon.TABS, QIcon.DOTS).forEach { QIconView(it, null, bar.text, 18.dp) }
                        } else AddressView(sampleChromeData(), s, bar, inline = false, interactive = false, cb = ChromeCallbacks(), styleOverride = st)
                    }
                }
                if (i < AddressStyle.entries.lastIndex) RowDivider()
            }
        }
        SectionHeader("Contenu")
        GroupCard {
            ToggleRow("Afficher le favicon", s.addressShowsFavicon) { v -> up { it.copy(addressShowsFavicon = v) } }; RowDivider()
            ToggleRow("Afficher le temps de lecture", s.addressShowsReadingTime) { v -> up { it.copy(addressShowsReadingTime = v) } }
        }
        SectionHeader("Le tap sur l'adresse")
        ChoiceCard(AddressTapAction.entries, s.addressTap, { it.label }) { v -> up { it.copy(addressTap = v) } }
        SectionHeader("Appui long sur l'adresse")
        if (s.addressTap == AddressTapAction.MENU) {
            GroupCard { ValueRow("Appui long", "Modifier l'adresse") }
            SectionFooter("Quand le tap ouvre le menu, l'appui long passe en saisie.")
        } else ChoiceCard(AddressLongPressAction.entries, s.addressLongPress, { it.label }) { v -> up { it.copy(addressLongPress = v) } }
    }
}

// ---------------------------------------------------------------- Onglets
@Composable
private fun TabsPage(store: BrowserStore) {
    val s = settingsOf(store)
    fun up(c: (Settings) -> Settings) = store.updateSettings(c)
    Column {
        SegmentedSection("Affichage", TabsLayout.entries.map { it.label }, s.tabsLayout.ordinal) { i -> up { it.copy(tabsLayout = TabsLayout.entries[i]) } }
        if (s.tabsLayout == TabsLayout.GRID) SegmentedSection("Vignettes", GridSize.entries.map { it.label }, s.tabsGridSize.ordinal) { i -> up { it.copy(tabsGridSize = GridSize.entries[i]) } }
        SectionHeader("Trier par")
        ChoiceCard(TabsSort.entries, s.tabsSort, { it.label }) { v -> up { it.copy(tabsSort = v) } }
        Spacer(Modifier.height(10.dp))
        GroupCard { ToggleRow("Grouper par site", s.groupTabsByDomain) { v -> up { it.copy(groupTabsByDomain = v) } } }
        SectionHeader("Nouvel onglet ouvre")
        GroupCard {
            NewTabPage.entries.forEachIndexed { i, p ->
                CheckRow(p.label, s.newTabPage == p) { up { it.copy(newTabPage = p) } }
                if (p == NewTabPage.CUSTOM && s.newTabPage == NewTabPage.CUSTOM) { RowDivider(); TextFieldRow("https://exemple.org", s.newTabCustomUrl) { v -> up { it.copy(newTabCustomUrl = v) } } }
                if (i < NewTabPage.entries.lastIndex) RowDivider()
            }
        }
        SectionHeader("Fermer automatiquement les onglets")
        ChoiceCard(AutoCloseTabs.entries, s.autoCloseTabs, { it.label }) { v -> up { it.copy(autoCloseTabs = v) } }
        SectionFooter("Au lancement, les onglets non consultés depuis ce délai sont fermés.")
        SectionHeader("Confort")
        GroupCard { ToggleRow("Mode confort (une main)", s.comfortMode, subtitle = "Listes d'onglets ancrées en bas, près du pouce.") { v -> up { it.copy(comfortMode = v) } } }
    }
}

// ---------------------------------------------------------------- Recherche
@Composable
private fun SearchPage(store: BrowserStore) {
    val s = settingsOf(store)
    fun up(c: (Settings) -> Settings) = store.updateSettings(c)
    Column {
        SectionHeader("Moteur de recherche")
        GroupCard {
            SearchEngine.entries.forEachIndexed { i, e ->
                CheckRow(e.label, s.searchEngine == e) { up { it.copy(searchEngine = e) } }
                if (s.searchEngine == e && e.needsBaseUrl) { RowDivider(); TextFieldRow(if (e == SearchEngine.QAFILA) "https://mon-qafila.exemple.org" else "https://mon-instance-searxng.org", s.searchBaseUrl) { v -> up { it.copy(searchBaseUrl = v) } } }
                if (s.searchEngine == e && e == SearchEngine.CUSTOM) { RowDivider(); TextFieldRow("https://exemple.org/search?q=%s", s.customSearchTemplate) { v -> up { it.copy(customSearchTemplate = v) } } }
                if (i < SearchEngine.entries.lastIndex) RowDivider()
            }
        }
        if (s.searchEngine == SearchEngine.CUSTOM) SectionFooter("%s est remplacé par votre recherche.")
        SectionHeader("Suggestions")
        ChoiceCard(SuggestionsMode.entries, s.suggestionsMode, { it.label }) { v -> up { it.copy(suggestionsMode = v) } }
        SectionFooter("Les suggestions sont demandées au moteur choisi (Kagi, Startpage et Personnalisé : historique et favoris seulement).")
        SectionHeader("Résultats")
        GroupCard { ToggleRow("Masquer les réponses IA", s.hideAiAnswers) { v -> up { it.copy(hideAiAnswers = v) } } }
        SectionFooter("Google : résultats Web uniquement. DuckDuckGo : version sans IA (noai.duckduckgo.com). Brave : sans résumé IA.")
    }
}

// ---------------------------------------------------------------- Confidentialité
@Composable
private fun PrivacyPage(store: BrowserStore) {
    val s = settingsOf(store)
    val q = LocalQ.current
    fun up(c: (Settings) -> Settings) = store.updateSettings(c)
    var confirm by remember { mutableStateOf(false) }
    Column {
        SectionHeader("Bloqueur")
        GroupCard {
            ToggleRow("Bloquer les publicités", s.blockAds) { v -> up { it.copy(blockAds = v) } }; RowDivider()
            ToggleRow("Bloquer les traqueurs", s.blockTrackers) { v -> up { it.copy(blockTrackers = v) } }; RowDivider()
            ToggleRow("Masquer les bandeaux de cookies", s.blockCookieBanners) { v -> up { it.copy(blockCookieBanners = v) } }
        }
        SectionFooter("Listes intégrées : ${ContentBlocker.adDomains.size} régies publicitaires, ${ContentBlocker.trackerDomains.size} traqueurs. Rien n'est téléchargé.")
        SectionHeader("Sites où le bloqueur est désactivé")
        HostListCard(s.blockerDisabledHosts, "Aucun. Utilisez « Désactiver le bloqueur ici » dans le menu.") { h -> up { it.copy(blockerDisabledHosts = it.blockerDisabledHosts - h) } }

        SectionHeader("JavaScript")
        GroupCard { ToggleRow("JavaScript", s.javascriptEnabled) { v -> up { it.copy(javascriptEnabled = v) } } }
        SectionHeader("Sites sans JavaScript")
        HostListCard(s.javascriptDisabledHosts, "Aucun. Le menu permet de couper JavaScript site par site.") { h -> up { it.copy(javascriptDisabledHosts = it.javascriptDisabledHosts - h) } }

        SectionHeader("Sécurité")
        GroupCard { ToggleRow("Passer en HTTPS automatiquement", s.upgradeToHttps) { v -> up { it.copy(upgradeToHttps = v) } } }

        SectionHeader("Données")
        GroupCard {
            ToggleRow("Effacer en fermant tous les onglets", s.clearOnCloseAll) { v -> up { it.copy(clearOnCloseAll = v) } }; RowDivider()
            ActionRow(if (confirm) "Touchez encore pour tout effacer" else "Effacer l'historique et les données de sites", q.destructive) {
                if (confirm) { store.clearBrowsingData(); confirm = false } else confirm = true
            }
        }
        SectionHeader("Avancé")
        GroupCard { TextFieldRow("User agent personnalisé (vide = par défaut)", s.customUserAgent, androidx.compose.ui.text.input.KeyboardType.Text) { v -> up { it.copy(customUserAgent = v) } } }
        SectionFooter("Qafila ne collecte rien et ne contacte aucun service tiers en dehors des sites visités et du moteur de recherche choisi.")
    }
}

// ---------------------------------------------------------------- Lecture
@Composable
private fun ReadingPage(store: BrowserStore) {
    val s = settingsOf(store)
    val q = LocalQ.current
    fun up(c: (Settings) -> Settings) = store.updateSettings(c)
    Column {
        SectionHeader("Assombrir")
        GroupCard {
            ToggleRow("Assombrir tous les sites", s.darkenSites) { v -> up { it.copy(darkenSites = v) } }; RowDivider()
            ToggleRow("Seulement en mode sombre", s.darkenOnlyInDarkMode, enabled = s.darkenSites) { v -> up { it.copy(darkenOnlyInDarkMode = v) } }
        }
        SectionHeader(if (s.darkenSites) "Sites jamais assombris" else "Sites toujours assombris")
        HostListCard(s.darkenHosts, "Aucun. « Assombrir » dans le menu ajoute une exception pour le site.") { h -> up { it.copy(darkenHosts = it.darkenHosts - h) } }

        SectionHeader("Taille du texte des pages")
        GroupCard {
            Row(Modifier.fillMaxWidth().padding(horizontal = 8.dp, vertical = 6.dp), verticalAlignment = Alignment.CenterVertically) {
                Box(Modifier.size(44.dp).pressFade(enabled = s.textZoom > 80) { up { it.copy(textZoom = (it.textZoom - 10).coerceAtLeast(80)) } }, contentAlignment = Alignment.Center) { Text("A", color = q.text, fontSize = 13.sp) }
                Column(Modifier.weight(1f), horizontalAlignment = Alignment.CenterHorizontally) {
                    Text("${s.textZoom} %", color = q.text, fontSize = 17.sp, fontWeight = FontWeight.Medium)
                    Row(Modifier.padding(top = 6.dp), horizontalArrangement = Arrangement.spacedBy(4.dp)) {
                        (80..150 step 10).forEach { v -> Box(Modifier.size(6.dp).clip(CircleShape).background(if (v <= s.textZoom) q.text else q.tertiary)) }
                    }
                }
                Box(Modifier.size(44.dp).pressFade(enabled = s.textZoom < 150) { up { it.copy(textZoom = (it.textZoom + 10).coerceAtMost(150)) } }, contentAlignment = Alignment.Center) { Text("A", color = q.text, fontSize = 21.sp) }
            }
            RowDivider()
            Text("Le vent se lève, il faut tenter de vivre.", Modifier.padding(16.dp), color = q.text, fontSize = (15f * s.textZoom / 100f).sp, fontFamily = androidx.compose.ui.text.font.FontFamily.Serif)
        }

        SectionHeader("Langue de traduction")
        ChoiceCard(TranslateLanguage.entries, s.translateLanguage, { it.label }) { v -> up { it.copy(translateLanguage = v) } }

        SectionHeader("Site bureau")
        GroupCard { ToggleRow("Site bureau par défaut", s.desktopByDefault) { v -> up { it.copy(desktopByDefault = v) } } }
        SectionHeader(if (s.desktopByDefault) "Sites en version mobile" else "Sites en version bureau")
        HostListCard(s.desktopHosts, "Aucun. « Version bureau » dans le menu change un site précis.") { h -> up { it.copy(desktopHosts = it.desktopHosts - h) } }
    }
}

// ---------------------------------------------------------------- Énergie
@Composable
private fun EnergyPage(store: BrowserStore) {
    val s = settingsOf(store)
    val power by store.powerSave.collectAsState()
    Column {
        Spacer(Modifier.height(12.dp))
        GroupCard {
            ToggleRow("Mettre en veille les onglets en arrière-plan", s.suspendTabsInPowerSave, subtitle = "En mode Économie d'énergie") { v -> store.updateSettings { it.copy(suspendTabsInPowerSave = v) } }
            RowDivider()
            ValueRow("Économie d'énergie", if (power) "Activée" else "Désactivée")
        }
        SectionFooter("Les onglets en veille libèrent leur mémoire et leur processeur ; ils se rechargent quand vous y revenez. Les onglets en arrière-plan sont toujours mis en pause (animations, vidéos).")
    }
}

// ---------------------------------------------------------------- À propos
@Composable
private fun AboutPage(store: BrowserStore) {
    val q = LocalQ.current
    val webview = remember { runCatching { WebView.getCurrentWebViewPackage()?.versionName }.getOrNull() }
    Column {
        Column(Modifier.fillMaxWidth().padding(vertical = 24.dp), horizontalAlignment = Alignment.CenterHorizontally) {
            AppIconTile(settingsOf(store).appIcon, selected = false)
            Spacer(Modifier.height(10.dp))
            Text("Qafila", color = q.text, fontSize = 26.sp, fontFamily = androidx.compose.ui.text.font.FontFamily.Serif)
            Text("قافلة", color = q.secondary, fontSize = 16.sp)
        }
        GroupCard {
            ValueRow("Version", fr.qafila.browser.BuildConfig.VERSION_NAME); RowDivider()
            ValueRow("Moteur", "WebView" + (webview?.let { " $it" } ?: ""))
        }
        SectionHeader("Confidentialité")
        GroupCard {
            Text("Aucune télémétrie, aucun compte. L'historique, les favoris et les réglages restent sur cet appareil. Les onglets privés ne laissent ni historique ni cache.",
                Modifier.padding(16.dp), color = q.text, fontSize = 14.sp, lineHeight = 19.sp, textAlign = TextAlign.Start, overflow = TextOverflow.Clip)
        }
        Spacer(Modifier.height(20.dp))
        GroupCard {
            ActionRow("Code source", icon = QIcon.CHEVRON_RIGHT) { store.showSettings.value = false; store.newTab(url = "https://github.com/Fefe-Kurylen/jeu-final") }
        }
    }
}
