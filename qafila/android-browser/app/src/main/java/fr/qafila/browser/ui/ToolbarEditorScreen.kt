package fr.qafila.browser.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties
import fr.qafila.browser.data.*

/** Éditeur : chaque bouton peut être dans la barre, dans le menu, dans les deux ou nulle part ; ordre, taille, séparateurs. */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ToolbarEditorScreen(store: BrowserStore, onDismiss: () -> Unit) {
    val state by store.state.collectAsState()
    val cfg = state.settings.toolbar
    fun set(c: ToolbarConfig) = store.updateSettings { it.copy(toolbar = c) }
    var gallery by remember { mutableStateOf(false) }

    Dialog(onDismissRequest = onDismiss, properties = DialogProperties(usePlatformDefaultWidth = false, decorFitsSystemWindows = false)) {
        Scaffold(topBar = { TopAppBar(title = { Text("Personnaliser") }, navigationIcon = { IconButton(onDismiss) { Icon(Icons.Filled.Close, "Fermer") } }, actions = { TextButton(onDismiss) { Text("OK", fontWeight = FontWeight.SemiBold) } }) }) { pad ->
            LazyColumn(Modifier.padding(pad).fillMaxSize(), contentPadding = PaddingValues(16.dp)) {
                item { SectionTitle("Aperçu"); Card { ToolbarRow(store, cfg.bar, interactive = false) }; Spacer(Modifier.height(16.dp)) }
                item { SectionTitle("Barre d'outils (${cfg.bar.count { it.action != ToolbarAction.SEPARATOR }} boutons)") }
                item { SlotList(cfg.bar, inMenu = false, onChange = { set(cfg.copy(bar = it)) }) }
                item { Text("Au-delà de 6 boutons, la barre devient serrée.", fontSize = 12.sp, color = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.padding(8.dp)); Spacer(Modifier.height(8.dp)) }
                item { SectionTitle("Menu") }
                item { SlotList(cfg.menu, inMenu = true, onChange = { set(cfg.copy(menu = it)) }) }
                item { Text("Les éléments « icône seule » consécutifs forment une rangée d'icônes ; les séparateurs créent des sections.", fontSize = 12.sp, color = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.padding(8.dp)); Spacer(Modifier.height(8.dp)) }
                item { SectionTitle("Style") }
                item {
                    Card {
                        EnumRow("Style", ToolbarStyle.entries, cfg.style, { it.label }) { set(cfg.copy(style = it)) }
                        HorizontalDivider()
                        EnumRow("Position", ToolbarPosition.entries, cfg.position, { it.label }) { set(cfg.copy(position = it)) }
                        HorizontalDivider()
                        Row(Modifier.fillMaxWidth().clickable { gallery = true }.padding(16.dp), verticalAlignment = Alignment.CenterVertically) { Icon(Icons.Filled.GridView, null); Spacer(Modifier.width(12.dp)); Text("Galerie de barres prêtes à l'emploi") }
                        HorizontalDivider()
                        Row(Modifier.fillMaxWidth().clickable { set(ToolbarConfig.preset(ToolbarConfig.Preset.COMPLETE)) }.padding(16.dp), verticalAlignment = Alignment.CenterVertically) { Icon(Icons.Filled.RestartAlt, null, tint = MaterialTheme.colorScheme.error); Spacer(Modifier.width(12.dp)); Text("Rétablir la barre par défaut", color = MaterialTheme.colorScheme.error) }
                    }
                }
            }
        }
    }
    if (gallery) ToolbarGalleryScreen(store) { gallery = false }
}

@Composable
fun SectionTitle(t: String) = Text(t.uppercase(), fontSize = 12.sp, fontWeight = FontWeight.SemiBold, color = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.padding(start = 12.dp, bottom = 6.dp, top = 6.dp))

@Composable
fun Card(content: @Composable ColumnScope.() -> Unit) = Column(Modifier.fillMaxWidth().clip(RoundedCornerShape(14.dp)).background(MaterialTheme.colorScheme.surfaceVariant), content = content)

@Composable
fun <T> EnumRow(title: String, values: List<T>, selected: T, label: (T) -> String, onSelect: (T) -> Unit) {
    var open by remember { mutableStateOf(false) }
    Row(Modifier.fillMaxWidth().clickable { open = true }.padding(16.dp), verticalAlignment = Alignment.CenterVertically) {
        Text(title, Modifier.weight(1f)); Text(label(selected), color = MaterialTheme.colorScheme.onSurfaceVariant); Icon(Icons.Filled.ArrowDropDown, null)
        DropdownMenu(open, { open = false }) { values.forEach { v -> DropdownMenuItem({ Text((if (v == selected) "✓ " else "") + label(v)) }, { onSelect(v); open = false }) } }
    }
}

@Composable
private fun SlotList(slots: List<ToolbarSlot>, inMenu: Boolean, onChange: (List<ToolbarSlot>) -> Unit) {
    var addOpen by remember { mutableStateOf(false) }
    val used = slots.map { it.action }.toSet()
    val available = ToolbarAction.entries.filter { it != ToolbarAction.SEPARATOR && it !in used }
    Card {
        slots.forEachIndexed { i, slot ->
            var sizeOpen by remember(slot.id) { mutableStateOf(false) }
            Row(Modifier.fillMaxWidth().padding(start = 8.dp, end = 4.dp), verticalAlignment = Alignment.CenterVertically) {
                IconButton(onClick = { onChange(slots - slot) }, Modifier.size(36.dp)) { Icon(Icons.Filled.RemoveCircle, "Retirer", tint = Color(0xFFE5484D)) }
                Icon(slot.action.icon(), null, Modifier.size(22.dp), tint = if (slot.action.destructive) Color(0xFFE5484D) else MaterialTheme.colorScheme.onSurface)
                Spacer(Modifier.width(12.dp))
                Text(slot.action.label, Modifier.weight(1f))
                if (slot.action != ToolbarAction.SEPARATOR) {
                    TextButton(onClick = { sizeOpen = true }) { Text(if (inMenu && !slot.showsLabel) "Icône · ${slot.size.label}" else slot.size.label, fontSize = 13.sp, color = MaterialTheme.colorScheme.onSurfaceVariant) }
                    DropdownMenu(sizeOpen, { sizeOpen = false }) {
                        ButtonSize.entries.forEach { sz -> DropdownMenuItem({ Text((if (slot.size == sz) "✓ " else "") + sz.label) }, { onChange(slots.map { if (it.id == slot.id) it.copy(size = sz) else it }); sizeOpen = false }) }
                        if (inMenu) { HorizontalDivider(); DropdownMenuItem({ Text((if (slot.showsLabel) "✓ " else "") + "Afficher l'intitulé") }, { onChange(slots.map { if (it.id == slot.id) it.copy(showsLabel = !it.showsLabel) else it }); sizeOpen = false }) }
                    }
                }
                IconButton(onClick = { if (i > 0) onChange(slots.toMutableList().apply { add(i - 1, removeAt(i)) }) }, Modifier.size(32.dp), enabled = i > 0) { Icon(Icons.Filled.KeyboardArrowUp, "Monter") }
                IconButton(onClick = { if (i < slots.lastIndex) onChange(slots.toMutableList().apply { add(i + 1, removeAt(i)) }) }, Modifier.size(32.dp), enabled = i < slots.lastIndex) { Icon(Icons.Filled.KeyboardArrowDown, "Descendre") }
            }
            HorizontalDivider(Modifier.padding(start = 52.dp), color = MaterialTheme.colorScheme.outlineVariant)
        }
        Row(Modifier.fillMaxWidth().clickable { addOpen = true }.padding(16.dp), verticalAlignment = Alignment.CenterVertically) {
            Icon(Icons.Filled.AddCircle, null, tint = MaterialTheme.colorScheme.primary); Spacer(Modifier.width(12.dp)); Text("Ajouter un bouton", color = MaterialTheme.colorScheme.primary)
            DropdownMenu(addOpen, { addOpen = false }) {
                available.forEach { a -> DropdownMenuItem({ Row(verticalAlignment = Alignment.CenterVertically) { Icon(a.icon(), null, Modifier.size(18.dp)); Spacer(Modifier.width(10.dp)); Text(a.label) } }, { onChange(slots + ToolbarSlot(action = a)); addOpen = false }) }
                HorizontalDivider()
                DropdownMenuItem({ Text("Séparateur") }, { onChange(slots + ToolbarSlot(action = ToolbarAction.SEPARATOR)); addOpen = false })
            }
        }
    }
}

/** Galerie de barres prêtes à l'emploi, points de départ à ajuster ensuite. */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ToolbarGalleryScreen(store: BrowserStore, onDismiss: () -> Unit) {
    val state by store.state.collectAsState()
    Dialog(onDismissRequest = onDismiss, properties = DialogProperties(usePlatformDefaultWidth = false, decorFitsSystemWindows = false)) {
        Scaffold(topBar = { TopAppBar(title = { Text("Galerie de barres") }, navigationIcon = { IconButton(onDismiss) { Icon(Icons.Filled.Close, "Fermer") } }) }) { pad ->
            LazyColumn(Modifier.padding(pad).fillMaxSize(), contentPadding = PaddingValues(16.dp), verticalArrangement = Arrangement.spacedBy(16.dp)) {
                items(ToolbarConfig.Preset.entries.size) { i ->
                    val p = ToolbarConfig.Preset.entries[i]
                    val cfg = ToolbarConfig.preset(p)
                    val current = state.settings.toolbar.bar.map { it.action to it.size } == cfg.bar.map { it.action to it.size }
                    Column(Modifier.fillMaxWidth().clip(RoundedCornerShape(18.dp)).background(MaterialTheme.colorScheme.surfaceVariant).clickable {
                        store.updateSettings { it.copy(toolbar = cfg.copy(style = it.toolbar.style, position = it.toolbar.position)) }; store.haptic(); onDismiss()
                    }.padding(16.dp)) {
                        Row(verticalAlignment = Alignment.CenterVertically) { Text(p.label, fontWeight = FontWeight.SemiBold, fontSize = 17.sp); Spacer(Modifier.weight(1f)); if (current) Icon(Icons.Filled.CheckCircle, null, tint = MaterialTheme.colorScheme.primary) }
                        Text(p.description, fontSize = 14.sp, color = MaterialTheme.colorScheme.onSurfaceVariant, modifier = Modifier.padding(vertical = 8.dp))
                        Box(Modifier.clip(RoundedCornerShape(12.dp)).background(MaterialTheme.colorScheme.background)) { ToolbarRow(store, cfg.bar, interactive = false) }
                    }
                }
            }
        }
    }
}
