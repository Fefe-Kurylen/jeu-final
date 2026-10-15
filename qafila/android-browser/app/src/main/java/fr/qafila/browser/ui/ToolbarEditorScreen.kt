package fr.qafila.browser.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import fr.qafila.browser.data.BrowserStore
import fr.qafila.browser.data.ButtonSize
import fr.qafila.browser.data.ToolbarAction
import fr.qafila.browser.data.ToolbarConfig
import fr.qafila.browser.data.ToolbarSlot

/** Éditeur : barre et menu — ordre, taille, intitulé dans le menu, séparateurs, ajout / retrait. Aperçu en direct en haut. */
@Composable
fun ToolbarEditorPage(store: BrowserStore, backLabel: String, onBack: () -> Unit, openGallery: () -> Unit) {
    val state by store.state.collectAsState()
    val s = state.settings
    val cfg = s.toolbar
    val q = LocalQ.current
    var tab by rememberSaveable { mutableIntStateOf(0) }
    fun set(c: ToolbarConfig) = store.updateSettings { it.copy(toolbar = c) }
    val slots = if (tab == 0) cfg.bar else cfg.menu
    fun change(list: List<ToolbarSlot>) = set(if (tab == 0) cfg.copy(bar = list) else cfg.copy(menu = list))
    val used = slots.map { it.action }.toSet()
    val available = ToolbarAction.entries.filter { a ->
        a != ToolbarAction.SEPARATOR && a !in used && !(tab == 1 && (a == ToolbarAction.ADDRESS || a == ToolbarAction.MENU || a == ToolbarAction.STOP))
    }

    QPage("Personnaliser", onBack, backLabel = backLabel, header = {
        Box(Modifier.padding(start = 16.dp, end = 16.dp, top = 4.dp)) { ChromePreview(s, compact = true) }
        Segmented(listOf("Barre", "Menu"), tab, Modifier.padding(start = 16.dp, end = 16.dp, top = 12.dp, bottom = 4.dp)) { tab = it }
    }) {
        item {
            SectionHeader(if (tab == 0) "Barre · ${slots.count { it.action != ToolbarAction.SEPARATOR }} éléments" else "Menu · ${slots.count { it.action != ToolbarAction.SEPARATOR }} éléments")
            GroupCard {
                if (slots.isEmpty()) Text("Aucun élément.", Modifier.padding(16.dp), color = q.secondary, fontSize = 14.sp)
                slots.forEachIndexed { i, slot ->
                    SlotRow(slot, inMenu = tab == 1, first = i == 0, last = i == slots.lastIndex,
                        onRemove = { change(slots - slot) },
                        onMove = { d -> change(slots.toMutableList().apply { add(i + d, removeAt(i)) }) },
                        onUpdate = { u -> change(slots.map { if (it.id == slot.id) u else it }) })
                    if (i < slots.lastIndex) RowDivider(52.dp)
                }
            }
            SectionFooter(if (tab == 0) "« Adresse (en ligne) » place l'adresse dans la rangée d'icônes. Au-delà de 7 boutons, la barre devient serrée. Appui long sur un bouton de la barre : ce même éditeur."
                else "Les éléments sans intitulé qui se suivent forment une rangée de tuiles ; les séparateurs créent des sections. Les actions de fermeture s'affichent en rouge.")
        }
        item {
            SectionHeader("Ajouter")
            GroupCard {
                (available + ToolbarAction.SEPARATOR).forEachIndexed { i, a ->
                    Row(Modifier.fillMaxWidth().heightIn(min = 44.dp).rowClick { change(slots + ToolbarSlot(action = a, showsLabel = tab == 0 || a.destructive || a == ToolbarAction.SEPARATOR || slots.lastOrNull()?.showsLabel != false)) }
                        .padding(horizontal = 14.dp), verticalAlignment = Alignment.CenterVertically) {
                        Box(Modifier.size(22.dp).clip(CircleShape).background(q.text), contentAlignment = Alignment.Center) { QIconView(QIcon.PLUS, "Ajouter", q.card, 14.dp) }
                        Spacer(Modifier.width(12.dp))
                        QIconView(a.qicon(menuIcon = s.menuIcon), null, if (a.destructive) q.destructive else q.text, 19.dp)
                        Spacer(Modifier.width(12.dp))
                        Text(a.label, color = q.text, fontSize = 15.sp, maxLines = 1, overflow = TextOverflow.Ellipsis)
                    }
                    if (i < available.size) RowDivider(52.dp)
                }
            }
        }
        item {
            Spacer(Modifier.height(24.dp))
            GroupCard {
                NavRow("Galerie de barres", icon = QIcon.GRID, onClick = openGallery); RowDivider(50.dp)
                ActionRow("Rétablir la barre et le menu par défaut", q.destructive) { set(ToolbarConfig.preset(ToolbarConfig.Preset.COMPLETE).copy(style = cfg.style, position = cfg.position)) }
            }
        }
    }
}

@Composable
private fun SlotRow(slot: ToolbarSlot, inMenu: Boolean, first: Boolean, last: Boolean, onRemove: () -> Unit, onMove: (Int) -> Unit, onUpdate: (ToolbarSlot) -> Unit) {
    val q = LocalQ.current
    val a = slot.action
    Row(Modifier.fillMaxWidth().heightIn(min = 52.dp).padding(start = 12.dp, end = 4.dp, top = 6.dp, bottom = 6.dp), verticalAlignment = Alignment.CenterVertically) {
        Box(Modifier.size(28.dp).pressFade(onClick = onRemove), contentAlignment = Alignment.Center) {
            Box(Modifier.size(20.dp).clip(CircleShape).background(q.destructive), contentAlignment = Alignment.Center) { Box(Modifier.width(9.dp).height(1.6.dp).background(Color.White)) }
        }
        Spacer(Modifier.width(8.dp))
        if (a == ToolbarAction.SEPARATOR) {
            Box(Modifier.weight(1f).height(20.dp), contentAlignment = Alignment.CenterStart) { Hairline(Modifier.padding(end = 12.dp), q.secondary) }
        } else {
            QIconView(a.qicon(), null, if (a.destructive) q.destructive else q.text, 20.dp)
            Spacer(Modifier.width(12.dp))
            Column(Modifier.weight(1f)) {
                Text(a.label, color = q.text, fontSize = 15.sp, maxLines = 1, overflow = TextOverflow.Ellipsis)
                Row(Modifier.padding(top = 5.dp), verticalAlignment = Alignment.CenterVertically) {
                    if (!inMenu && a != ToolbarAction.ADDRESS) MiniSegment(ButtonSize.entries.map { it.label.take(1) }, slot.size.ordinal) { onUpdate(slot.copy(size = ButtonSize.entries[it])) }
                    if (inMenu) Chip(if (slot.showsLabel) "Ligne avec intitulé" else "Tuile", selected = slot.showsLabel) { onUpdate(slot.copy(showsLabel = !slot.showsLabel)) }
                }
            }
        }
        Box(Modifier.size(34.dp).pressFade(enabled = !first) { onMove(-1) }, contentAlignment = Alignment.Center) { QIconView(QIcon.CHEVRON_UP, "Monter", q.text.copy(alpha = if (first) 0.25f else 1f), 16.dp) }
        Box(Modifier.size(34.dp).pressFade(enabled = !last) { onMove(1) }, contentAlignment = Alignment.Center) { QIconView(QIcon.CHEVRON_DOWN, "Descendre", q.text.copy(alpha = if (last) 0.25f else 1f), 16.dp) }
    }
}

@Composable
private fun MiniSegment(options: List<String>, selected: Int, onSelect: (Int) -> Unit) {
    val q = LocalQ.current
    Row(Modifier.clip(RoundedCornerShape(7.dp)).background(q.fill).padding(2.dp)) {
        options.forEachIndexed { i, o ->
            val sel = i == selected
            Box(Modifier.size(28.dp, 20.dp).clip(RoundedCornerShape(5.dp)).background(if (sel) q.card else Color.Transparent).pressFade { onSelect(i) }, contentAlignment = Alignment.Center) {
                Text(o, color = if (sel) q.text else q.secondary, fontSize = 11.sp, fontWeight = if (sel) FontWeight.SemiBold else FontWeight.Normal)
            }
        }
    }
}

@Composable
private fun Chip(text: String, selected: Boolean, onClick: () -> Unit) {
    val q = LocalQ.current
    Text(text, Modifier.clip(RoundedCornerShape(50)).border(0.5.dp, if (selected) q.text else q.separator, RoundedCornerShape(50)).pressFade(onClick = onClick).padding(horizontal = 9.dp, vertical = 3.dp),
        color = if (selected) q.text else q.secondary, fontSize = 11.sp)
}

/** Galerie de barres (DESIGN.md §7) : six barres prêtes à l'emploi, avec aperçu. */
@Composable
fun ToolbarGalleryPage(store: BrowserStore, backLabel: String, onBack: () -> Unit) {
    val state by store.state.collectAsState()
    val s = state.settings
    val q = LocalQ.current
    QPage("Galerie de barres", onBack, backLabel = backLabel) {
        item { SectionFooter("Touchez une barre pour l'adopter ; vous pourrez ensuite l'ajuster dans Personnaliser."); Spacer(Modifier.height(6.dp)) }
        ToolbarConfig.Preset.entries.forEach { p ->
            item(p.name) {
                val cfg = ToolbarConfig.preset(p).copy(style = s.toolbar.style, position = s.toolbar.position)
                val current = s.toolbar.bar.map { it.action } == cfg.bar.map { it.action }
                Column(Modifier.padding(horizontal = 16.dp, vertical = 7.dp).fillMaxWidth().clip(RoundedCornerShape(16.dp)).background(q.card)
                    .border(if (current) 1.5.dp else 0.dp, if (current) q.text else Color.Transparent, RoundedCornerShape(16.dp))
                    .rowClick { store.applyPreset(p) }.padding(14.dp)) {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Text(p.label, color = q.text, fontSize = 17.sp, fontWeight = FontWeight.SemiBold)
                        Spacer(Modifier.weight(1f))
                        if (current) QIconView(QIcon.CHECK, "Barre actuelle", q.text, 18.dp)
                    }
                    Text(p.description, color = q.secondary, fontSize = 13.sp, lineHeight = 17.sp, modifier = Modifier.padding(top = 3.dp, bottom = 12.dp))
                    ChromePreview(s.copy(menuIcon = p.menuIcon ?: s.menuIcon), toolbar = cfg, compact = true)
                }
            }
        }
        item { Spacer(Modifier.height(8.dp)); Row(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.Center) { Text("Style, couleurs et position sont conservés.", color = q.secondary, fontSize = 12.sp) } }
    }
}
