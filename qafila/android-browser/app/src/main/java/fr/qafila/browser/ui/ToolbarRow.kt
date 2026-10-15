package fr.qafila.browser.ui

import androidx.compose.foundation.ExperimentalFoundationApi
import androidx.compose.foundation.border
import androidx.compose.foundation.combinedClickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.clip
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import fr.qafila.browser.data.BrowserStore
import fr.qafila.browser.data.ToolbarAction
import fr.qafila.browser.data.ToolbarSlot

/** Barre d'outils : rend les emplacements configurés. Appui long → personnaliser. */
@OptIn(ExperimentalFoundationApi::class)
@Composable
fun ToolbarRow(store: BrowserStore, slots: List<ToolbarSlot>, interactive: Boolean = true) {
    Row(Modifier.fillMaxWidth().height(54.dp).padding(horizontal = 8.dp), verticalAlignment = Alignment.CenterVertically) {
        slots.forEach { slot ->
            if (slot.action == ToolbarAction.SEPARATOR) VerticalDivider(Modifier.height(22.dp).padding(horizontal = 4.dp))
            else Box(Modifier.weight(1f), contentAlignment = Alignment.Center) { ToolbarButton(store, slot, interactive) }
        }
    }
}

@OptIn(ExperimentalFoundationApi::class)
@Composable
fun ToolbarButton(store: BrowserStore, slot: ToolbarSlot, interactive: Boolean = true) {
    val state by store.state.collectAsState()
    val nav by store.tabManager.navState.collectAsState()
    val reader by store.tabManager.readerActive.collectAsState()
    val tab = state.tabs.firstOrNull { it.id == state.selectedTabId }
    val n = tab?.let { nav[it.id] }
    val enabled = when (slot.action) { ToolbarAction.BACK -> n?.canBack == true; ToolbarAction.FORWARD -> n?.canForward == true; else -> true }
    val active = tab != null && when (slot.action) {
        ToolbarAction.BLOCKER -> state.settings.blockerEnabled
        ToolbarAction.DARKEN -> store.isDarkened(tab)
        ToolbarAction.JAVASCRIPT -> store.isJavaScriptEnabled(tab.url)
        ToolbarAction.DESKTOP_SITE -> store.isDesktop(tab)
        ToolbarAction.READER -> tab.id in reader
        ToolbarAction.ADD_BOOKMARK -> store.isBookmarked(tab)
        else -> false
    }
    val tint = if (!enabled) MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.4f) else if (active) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.onSurface
    Box(
        Modifier.size(44.dp).clip(RoundedCornerShape(12.dp)).then(if (interactive) Modifier.combinedClickable(enabled = enabled, onClick = { store.perform(slot.action) }, onLongClick = {
            when (slot.action) { ToolbarAction.TABS -> store.newTab(); ToolbarAction.BACK -> store.perform(ToolbarAction.HISTORY); else -> store.showToolbarEditor.value = true }
        }) else Modifier),
        contentAlignment = Alignment.Center,
    ) {
        if (slot.action == ToolbarAction.TABS) {
            Box(Modifier.size((slot.size.dp - 2).dp).border(2.dp, tint, RoundedCornerShape(5.dp)), contentAlignment = Alignment.Center) { Text("${state.tabs.size}", fontSize = 10.sp, color = tint, style = MaterialTheme.typography.labelSmall) }
        } else {
            val icon = if (slot.action == ToolbarAction.RELOAD && n?.loading == true) ToolbarAction.STOP.icon() else slot.action.icon(active)
            Icon(icon, slot.action.label, Modifier.size(slot.size.dp.dp).alpha(if (enabled) 1f else 0.6f), tint = tint)
        }
    }
}
