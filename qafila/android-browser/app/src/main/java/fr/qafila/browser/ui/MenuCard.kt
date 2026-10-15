package fr.qafila.browser.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxHeight
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.lifecycle.viewModelScope
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import fr.qafila.browser.data.BrowserStore
import fr.qafila.browser.data.ToolbarAction
import fr.qafila.browser.data.ToolbarSlot
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch

/** Regroupe les éléments du menu : tuiles (sans intitulé, consécutifs), lignes (avec intitulé), séparateurs. */
sealed interface MenuBlock {
    data class Tiles(val slots: List<ToolbarSlot>) : MenuBlock
    data class Line(val slot: ToolbarSlot) : MenuBlock
    data object Separator : MenuBlock
}

fun menuBlocks(menu: List<ToolbarSlot>): List<MenuBlock> {
    val out = mutableListOf<MenuBlock>()
    var tiles = mutableListOf<ToolbarSlot>()
    fun flush() { if (tiles.isNotEmpty()) { out += MenuBlock.Tiles(tiles.toList()); tiles = mutableListOf() } }
    for (s in menu) {
        when {
            s.action == ToolbarAction.ADDRESS || s.action == ToolbarAction.MENU -> Unit
            s.action == ToolbarAction.SEPARATOR -> { flush(); if (out.isNotEmpty() && out.last() != MenuBlock.Separator) out += MenuBlock.Separator }
            s.showsLabel -> { flush(); out += MenuBlock.Line(s) }
            else -> tiles += s
        }
    }
    flush()
    while (out.lastOrNull() == MenuBlock.Separator) out.removeAt(out.lastIndex)
    return out
}

/**
 * Menu flottant (DESIGN.md §3) : carte translucide 250 dp, rayon 18, ancrée au-dessus de la barre, côté du bouton Menu.
 * Rendu des éléments configurés : tuiles, lignes « intitulé à gauche / icône à droite », actions destructives en rouge.
 */
@Composable
fun MenuCard(store: BrowserStore, maxHeight: Dp, modifier: Modifier = Modifier) {
    val state by store.state.collectAsState()
    val nav by store.tabManager.navState.collectAsState()
    val reader by store.tabManager.readerActive.collectAsState()
    val q = LocalQ.current
    val tab = state.tabs.firstOrNull { it.id == state.selectedTabId }
    val n = tab?.let { nav[it.id] }

    fun act(a: ToolbarAction) {
        store.showMenu.value = false
        // Portée du ViewModel : l'action survit à la sortie du menu de la composition.
        store.viewModelScope.launch { delay(90); store.perform(a) }
    }
    fun enabled(a: ToolbarAction) = when (a) {
        ToolbarAction.BACK -> n?.canBack == true
        ToolbarAction.FORWARD -> n?.canForward == true
        ToolbarAction.SHARE, ToolbarAction.COPY_LINK, ToolbarAction.ADD_BOOKMARK, ToolbarAction.TRANSLATE, ToolbarAction.READER -> tab?.url != null
        else -> true
    }
    fun active(a: ToolbarAction): Boolean = tab != null && when (a) {
        ToolbarAction.BLOCKER -> store.isBlockerActive(store.hostOf(tab.url))
        ToolbarAction.DARKEN -> store.isDarkened(tab)
        ToolbarAction.JAVASCRIPT -> store.isJavaScriptEnabled(tab.url)
        ToolbarAction.DESKTOP_SITE -> store.isDesktop(tab)
        ToolbarAction.READER -> tab.id in reader
        ToolbarAction.ADD_BOOKMARK -> store.isBookmarked(tab)
        else -> false
    }
    fun label(a: ToolbarAction): String = when (a) {
        ToolbarAction.BLOCKER -> if (active(a)) "Désactiver le bloqueur ici" else "Activer le bloqueur ici"
        ToolbarAction.DARKEN -> if (active(a)) "Ne plus assombrir" else "Assombrir le site"
        ToolbarAction.JAVASCRIPT -> if (active(a)) "Désactiver JavaScript" else "Activer JavaScript"
        ToolbarAction.DESKTOP_SITE -> if (active(a)) "Version mobile" else "Version bureau"
        ToolbarAction.READER -> if (active(a)) "Quitter le lecteur" else "Lecteur"
        ToolbarAction.ADD_BOOKMARK -> if (active(a)) "Retirer des favoris" else "Ajouter aux favoris"
        ToolbarAction.RELOAD -> if (n?.loading == true) "Arrêter" else "Recharger"
        ToolbarAction.CLOSE_TAB -> "Fermer cet onglet"
        ToolbarAction.CLOSE_ALL_TABS -> if (state.tabs.size > 1) "Fermer les ${state.tabs.size} onglets" else "Fermer l'onglet"
        else -> a.label
    }
    fun icon(a: ToolbarAction) = if (a == ToolbarAction.RELOAD && n?.loading == true) QIcon.CLOSE else a.qicon(active(a), state.settings.menuIcon)

    val blocks = menuBlocks(state.settings.toolbar.menu)
    FloatingCard(modifier) {
        Column(Modifier.heightIn(max = maxHeight).verticalScroll(rememberScrollState())) {
            // Adresse masquée sans bouton Rechercher : la saisie reste accessible depuis le menu.
            val s = state.settings
            if (s.addressStyle == fr.qafila.browser.data.AddressStyle.HIDDEN && s.toolbar.bar.none { it.action == ToolbarAction.ADDRESS || it.action == ToolbarAction.SEARCH }) {
                MenuLine("Rechercher ou saisir une adresse", QIcon.SEARCH) { act(ToolbarAction.SEARCH) }
                if (blocks.isNotEmpty()) Hairline()
            }
            if (blocks.isEmpty()) Text("Menu vide — ajoutez des éléments dans Personnaliser.", Modifier.padding(16.dp), color = q.secondary, fontSize = 13.sp)
            blocks.forEach { b ->
                when (b) {
                    MenuBlock.Separator -> Hairline()
                    is MenuBlock.Line -> {
                        val a = b.slot.action
                        val color = if (a.destructive) q.destructive else q.text
                        Box(Modifier.alpha(if (enabled(a)) 1f else 0.3f)) {
                            MenuLine(label(a), icon(a), color) { if (enabled(a)) act(a) }
                        }
                    }
                    is MenuBlock.Tiles -> {
                        val withLabels = b.slots.size <= 3
                        Row(Modifier.fillMaxWidth().height(if (withLabels) 62.dp else 46.dp), verticalAlignment = Alignment.CenterVertically) {
                            b.slots.forEachIndexed { i, s ->
                                if (i > 0) Box(Modifier.width(0.5.dp).fillMaxHeight().background(q.separator))
                                val a = s.action
                                val color = if (a.destructive) q.destructive else q.text
                                Column(
                                    Modifier.weight(1f).fillMaxHeight().alpha(if (enabled(a)) 1f else 0.3f).rowClick(enabled = enabled(a)) { act(a) },
                                    horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.Center,
                                ) {
                                    QIconView(icon(a), a.label, color, if (withLabels) 19.dp else 18.dp)
                                    if (withLabels) {
                                        Spacer(Modifier.height(5.dp))
                                        Text(a.short, color = color, fontSize = 11.sp, maxLines = 1, overflow = TextOverflow.Ellipsis, textAlign = TextAlign.Center, modifier = Modifier.padding(horizontal = 4.dp))
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
    }
}
