package fr.furtif.browser.ui

import android.webkit.CookieManager
import android.webkit.WebStorage
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Close
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties
import fr.furtif.browser.data.*

/** Réglages : recherche, apparence, barre d'outils, barre d'adresse, onglets, confidentialité, lecture. */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun SettingsScreen(store: BrowserStore, onDismiss: () -> Unit) {
    val state by store.state.collectAsState()
    val s = state.settings
    fun up(change: (Settings) -> Settings) = store.updateSettings(change)
    var editor by remember { mutableStateOf(false) }
    var gallery by remember { mutableStateOf(false) }

    Dialog(onDismissRequest = onDismiss, properties = DialogProperties(usePlatformDefaultWidth = false, decorFitsSystemWindows = false)) {
        Scaffold(topBar = { TopAppBar(title = { Text("Réglages") }, navigationIcon = { IconButton(onDismiss) { Icon(Icons.Filled.Close, "Fermer") } }, actions = { TextButton(onDismiss) { Text("OK", fontWeight = FontWeight.SemiBold) } }) }) { pad ->
            LazyColumn(Modifier.padding(pad).fillMaxSize(), contentPadding = PaddingValues(16.dp)) {
                item { SectionTitle("Recherche"); Card {
                    EnumRow("Moteur de recherche", SearchEngine.entries, s.searchEngine, { it.label }) { e -> up { it.copy(searchEngine = e) } }
                    if (s.searchEngine.needsBaseUrl) { HorizontalDivider(); TextRow(if (s.searchEngine == SearchEngine.FURTIF) "https://mon-furtif.example.com" else "https://ma-instance-searxng", s.searchBaseUrl) { v -> up { it.copy(searchBaseUrl = v) } } }
                    HorizontalDivider(); SwitchRow("Suggestions pendant la saisie", s.showSuggestions) { v -> up { it.copy(showSuggestions = v) } }
                    HorizontalDivider(); EnumRow("Nouvel onglet", NewTabPage.entries, s.newTabPage, { it.label }) { e -> up { it.copy(newTabPage = e) } }
                    if (s.newTabPage == NewTabPage.CUSTOM) { HorizontalDivider(); TextRow("https://…", s.newTabCustomUrl) { v -> up { it.copy(newTabCustomUrl = v) } } }
                }; Spacer(Modifier.height(16.dp)) }

                item { SectionTitle("Apparence"); Card {
                    EnumRow("Thème", Appearance.entries, s.appearance, { it.label }) { e -> up { it.copy(appearance = e) } }
                    HorizontalDivider()
                    Row(Modifier.padding(16.dp), verticalAlignment = Alignment.CenterVertically) { Text("Couleur", Modifier.weight(1f)); AccentColor.entries.forEach { a ->
                        Box(Modifier.padding(3.dp).size(if (s.accent == a) 26.dp else 20.dp).background(Color(a.argb), CircleShape).clickable { up { it.copy(accent = a) } })
                    } }
                    HorizontalDivider(); SwitchRow("Adapter la couleur au site", s.adaptToSiteColor) { v -> up { it.copy(adaptToSiteColor = v) } }
                    HorizontalDivider(); SwitchRow("Vibrations", s.haptics) { v -> up { it.copy(haptics = v) } }
                }; Spacer(Modifier.height(16.dp)) }

                item { SectionTitle("Barre d'outils"); Card {
                    LinkRow("Personnaliser la barre et le menu") { editor = true }
                    HorizontalDivider(); LinkRow("Galerie de barres") { gallery = true }
                    HorizontalDivider(); EnumRow("Style", ToolbarStyle.entries, s.toolbar.style, { it.label }) { e -> up { it.copy(toolbar = it.toolbar.copy(style = e)) } }
                    HorizontalDivider(); EnumRow("Position", ToolbarPosition.entries, s.toolbar.position, { it.label }) { e -> up { it.copy(toolbar = it.toolbar.copy(position = e)) } }
                    HorizontalDivider(); SwitchRow("Masquer les barres au défilement", s.hideBarsOnScroll) { v -> up { it.copy(hideBarsOnScroll = v) } }
                }; Spacer(Modifier.height(16.dp)) }

                item { SectionTitle("Barre d'adresse"); Card {
                    SwitchRow("Icône du site", s.addressShowsFavicon) { v -> up { it.copy(addressShowsFavicon = v) } }
                    HorizontalDivider(); SwitchRow("Temps de lecture", s.addressShowsReadingTime) { v -> up { it.copy(addressShowsReadingTime = v) } }
                    HorizontalDivider(); SwitchRow("Titre de la page plutôt que le domaine", s.addressShowsTitle) { v -> up { it.copy(addressShowsTitle = v) } }
                }; Spacer(Modifier.height(16.dp)) }

                item { SectionTitle("Onglets"); Card {
                    EnumRow("Affichage", TabsLayout.entries, s.tabsLayout, { it.label }) { e -> up { it.copy(tabsLayout = e) } }
                    HorizontalDivider(); EnumRow("Trier par", TabsSort.entries, s.tabsSort, { it.label }) { e -> up { it.copy(tabsSort = e) } }
                    HorizontalDivider(); SwitchRow("Grouper par site", s.groupTabsByDomain) { v -> up { it.copy(groupTabsByDomain = v) } }
                    HorizontalDivider(); SwitchRow("Afficher le temps de lecture", s.showReadingTime) { v -> up { it.copy(showReadingTime = v) } }
                }; Spacer(Modifier.height(16.dp)) }

                item { SectionTitle("Confidentialité"); Card {
                    SwitchRow("Bloquer pubs et traqueurs", s.blockerEnabled) { v -> up { it.copy(blockerEnabled = v) } }
                    HorizontalDivider(); SwitchRow("Masquer les bandeaux de cookies", s.blockCookieBanners, enabled = s.blockerEnabled) { v -> up { it.copy(blockCookieBanners = v) } }
                    HorizontalDivider(); SwitchRow("JavaScript", s.javascriptEnabled) { v -> up { it.copy(javascriptEnabled = v) } }
                    if (s.javascriptDisabledHosts.isNotEmpty()) { HorizontalDivider(); HostList("Sites sans JavaScript", s.javascriptDisabledHosts) { h -> up { it.copy(javascriptDisabledHosts = it.javascriptDisabledHosts - h) } } }
                    HorizontalDivider(); SwitchRow("Passer en HTTPS automatiquement", s.upgradeToHttps) { v -> up { it.copy(upgradeToHttps = v) } }
                    HorizontalDivider(); TextRow("User agent personnalisé (vide = défaut)", s.customUserAgent) { v -> up { it.copy(customUserAgent = v) } }
                    if (s.desktopHosts.isNotEmpty()) { HorizontalDivider(); HostList("Sites en version bureau", s.desktopHosts) { h -> up { it.copy(desktopHosts = it.desktopHosts - h) } } }
                    HorizontalDivider()
                    Row(Modifier.fillMaxWidth().clickable { store.clearHistory(); CookieManager.getInstance().removeAllCookies(null); WebStorage.getInstance().deleteAllData() }.padding(16.dp)) { Text("Effacer l'historique et les données de sites", color = MaterialTheme.colorScheme.error) }
                }
                Text("Furtif ne collecte rien et ne contacte aucun service tiers en dehors des sites que vous visitez et du moteur de recherche choisi.", fontSize = 12.sp, color = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.padding(8.dp)); Spacer(Modifier.height(8.dp)) }

                item { SectionTitle("Lecture"); Card {
                    SwitchRow("Assombrir tous les sites", s.darkenSites) { v -> up { it.copy(darkenSites = v) } }
                    if (s.darkenHosts.isNotEmpty()) { HorizontalDivider(); HostList("Exceptions d'assombrissement", s.darkenHosts) { h -> up { it.copy(darkenHosts = it.darkenHosts - h) } } }
                }; Spacer(Modifier.height(16.dp)) }

                item { SectionTitle("À propos"); Card {
                    Row(Modifier.padding(16.dp)) { Text("Version", Modifier.weight(1f)); Text(fr.furtif.browser.BuildConfig.VERSION_NAME, color = MaterialTheme.colorScheme.onSurfaceVariant) }
                    HorizontalDivider(); Row(Modifier.padding(16.dp)) { Text("Moteur", Modifier.weight(1f)); Text("WebView Android (Chromium)", color = MaterialTheme.colorScheme.onSurfaceVariant) }
                } }
            }
        }
    }
    if (editor) ToolbarEditorScreen(store) { editor = false }
    if (gallery) ToolbarGalleryScreen(store) { gallery = false }
}

@Composable fun SwitchRow(title: String, value: Boolean, enabled: Boolean = true, onChange: (Boolean) -> Unit) =
    Row(Modifier.fillMaxWidth().padding(horizontal = 16.dp, vertical = 8.dp), verticalAlignment = Alignment.CenterVertically) { Text(title, Modifier.weight(1f)); Switch(value, onChange, enabled = enabled) }

@Composable fun LinkRow(title: String, onClick: () -> Unit) = Row(Modifier.fillMaxWidth().clickable(onClick = onClick).padding(16.dp)) { Text(title, color = MaterialTheme.colorScheme.primary) }

@Composable fun TextRow(placeholder: String, value: String, onChange: (String) -> Unit) =
    OutlinedTextField(value, onChange, Modifier.fillMaxWidth().padding(horizontal = 12.dp, vertical = 8.dp), placeholder = { Text(placeholder) }, singleLine = true)

@Composable fun HostList(title: String, hosts: Set<String>, onRemove: (String) -> Unit) {
    Column(Modifier.padding(horizontal = 16.dp, vertical = 8.dp)) {
        Text(title, fontWeight = FontWeight.Medium)
        hosts.sorted().forEach { h -> Row(verticalAlignment = Alignment.CenterVertically) { Text(h, Modifier.weight(1f), fontSize = 14.sp, color = MaterialTheme.colorScheme.onSurfaceVariant); TextButton(onClick = { onRemove(h) }) { Text("Retirer") } } }
    }
}
