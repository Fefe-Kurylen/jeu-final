package fr.qafila.browser.ui

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import fr.qafila.browser.data.BrowserStore
import fr.qafila.browser.data.ToolbarAction
import fr.qafila.browser.data.ToolbarSlot
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch

/** Menu principal (feuille), fidèle à Quiche : rangée Nouvel onglet / Onglet privé, rangées d'icônes, lignes, actions rouges, navigation. */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun MenuSheet(store: BrowserStore, onDismiss: () -> Unit) {
    val state by store.state.collectAsState()
    val reader by store.tabManager.readerActive.collectAsState()
    val tab = state.tabs.firstOrNull { it.id == state.selectedTabId }
    val sheet = rememberModalBottomSheetState()
    val scope = rememberCoroutineScope()
    fun act(a: ToolbarAction) { scope.launch { sheet.hide(); onDismiss(); delay(120); store.perform(a) } }

    fun label(a: ToolbarAction): String = if (tab == null) a.label else when (a) {
        ToolbarAction.BLOCKER -> if (state.settings.blockerEnabled) "Désactiver le bloqueur" else "Activer le bloqueur"
        ToolbarAction.DARKEN -> if (store.isDarkened(tab)) "Ne plus assombrir" else "Assombrir"
        ToolbarAction.JAVASCRIPT -> if (store.isJavaScriptEnabled(tab.url)) "Désactiver JavaScript" else "Activer JavaScript"
        ToolbarAction.DESKTOP_SITE -> if (store.isDesktop(tab)) "Version mobile" else "Version bureau"
        ToolbarAction.READER -> if (tab.id in reader) "Quitter le lecteur" else "Lecteur"
        ToolbarAction.ADD_BOOKMARK -> if (store.isBookmarked(tab)) "Retirer des favoris" else "Ajouter aux favoris"
        ToolbarAction.CLOSE_TAB -> "Fermer cet onglet"
        ToolbarAction.CLOSE_ALL_TABS -> "Fermer les ${state.tabs.size} onglets"
        else -> a.label
    }

    // Regroupe les éléments consécutifs de même type.
    val rows = remember(state.settings.toolbar.menu) {
        val out = mutableListOf<Pair<String, List<ToolbarSlot>>>()
        var icons = mutableListOf<ToolbarSlot>(); var lines = mutableListOf<ToolbarSlot>()
        fun flush() { if (icons.isNotEmpty()) { out += "icons" to icons.toList(); icons = mutableListOf() }; if (lines.isNotEmpty()) { out += "lines" to lines.toList(); lines = mutableListOf() } }
        for (s in state.settings.toolbar.menu) {
            if (s.action == ToolbarAction.SEPARATOR) { flush(); out += "sep" to emptyList(); continue }
            if (s.showsLabel) { if (icons.isNotEmpty()) flush(); lines += s } else { if (lines.isNotEmpty()) flush(); icons += s }
        }
        flush(); out.toList()
    }

    ModalBottomSheet(onDismissRequest = onDismiss, sheetState = sheet) {
        Column(Modifier.verticalScroll(rememberScrollState()).padding(bottom = 24.dp)) {
            rows.forEach { (kind, slots) ->
                when (kind) {
                    "sep" -> HorizontalDivider(Modifier.padding(horizontal = 20.dp, vertical = 6.dp))
                    "icons" -> Row(Modifier.fillMaxWidth().padding(horizontal = 12.dp, vertical = 4.dp)) {
                        slots.forEach { s ->
                            Column(Modifier.weight(1f).height(if (slots.size <= 2) 64.dp else 48.dp).clickable { act(s.action) }, horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.Center) {
                                Icon(s.action.icon(), s.action.label, Modifier.size((s.size.dp + 2).dp), tint = if (s.action.destructive) Color(0xFFE5484D) else MaterialTheme.colorScheme.onSurface)
                                if (slots.size <= 2) { Spacer(Modifier.height(6.dp)); Text(s.action.label, fontSize = 12.sp) }
                            }
                        }
                    }
                    else -> slots.forEach { s ->
                        Row(Modifier.fillMaxWidth().height(46.dp).clickable { act(s.action) }.padding(horizontal = 22.dp), verticalAlignment = Alignment.CenterVertically) {
                            val color = if (s.action.destructive) Color(0xFFE5484D) else MaterialTheme.colorScheme.onSurface
                            Icon(s.action.icon(), null, Modifier.size(s.size.dp.dp), tint = color)
                            Spacer(Modifier.width(14.dp))
                            Text(label(s.action), fontSize = 17.sp, color = color)
                            Spacer(Modifier.weight(1f))
                            if (s.action in listOf(ToolbarAction.JAVASCRIPT, ToolbarAction.DARKEN, ToolbarAction.DESKTOP_SITE)) Text(tab?.host ?: "", fontSize = 14.sp, color = MaterialTheme.colorScheme.onSurfaceVariant)
                        }
                    }
                }
            }
            TextButton(onClick = { scope.launch { sheet.hide(); onDismiss(); delay(120); store.showToolbarEditor.value = true } }, Modifier.align(Alignment.CenterHorizontally).padding(top = 8.dp)) {
                Icon(ToolbarAction.CUSTOMIZE.icon(), null, Modifier.size(18.dp)); Spacer(Modifier.width(6.dp)); Text("Personnaliser le menu")
            }
        }
    }
}
