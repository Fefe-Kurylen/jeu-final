package fr.qafila.browser.ui

import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.automirrored.filled.ArrowForward
import androidx.compose.material.icons.automirrored.filled.OpenInNew
import androidx.compose.material.icons.filled.*
import androidx.compose.ui.graphics.vector.ImageVector
import fr.qafila.browser.data.ToolbarAction

fun ToolbarAction.icon(active: Boolean = false): ImageVector = when (this) {
    ToolbarAction.BACK -> Icons.AutoMirrored.Filled.ArrowBack
    ToolbarAction.FORWARD -> Icons.AutoMirrored.Filled.ArrowForward
    ToolbarAction.RELOAD -> Icons.Filled.Refresh
    ToolbarAction.STOP -> Icons.Filled.Close
    ToolbarAction.TABS -> Icons.Filled.CropSquare
    ToolbarAction.NEW_TAB -> Icons.Filled.AddBox
    ToolbarAction.NEW_PRIVATE_TAB -> Icons.Filled.VisibilityOff
    ToolbarAction.CLOSE_TAB -> Icons.Filled.Close
    ToolbarAction.CLOSE_ALL_TABS -> Icons.Filled.DeleteSweep
    ToolbarAction.BOOKMARKS -> Icons.Filled.StarBorder
    ToolbarAction.ADD_BOOKMARK -> if (active) Icons.Filled.Star else Icons.Filled.StarBorder
    ToolbarAction.HISTORY -> Icons.Filled.History
    ToolbarAction.SHARE -> Icons.Filled.Share
    ToolbarAction.FIND -> Icons.Filled.FindInPage
    ToolbarAction.BLOCKER -> if (active) Icons.Filled.Shield else Icons.Filled.RemoveModerator
    ToolbarAction.DARKEN -> if (active) Icons.Filled.DarkMode else Icons.Filled.LightMode
    ToolbarAction.READER -> Icons.Filled.ChromeReaderMode
    ToolbarAction.JAVASCRIPT -> Icons.Filled.Code
    ToolbarAction.DESKTOP_SITE -> Icons.Filled.DesktopWindows
    ToolbarAction.TRANSLATE -> Icons.Filled.Translate
    ToolbarAction.SCROLL_TOP -> Icons.Filled.VerticalAlignTop
    ToolbarAction.SCROLL_BOTTOM -> Icons.Filled.VerticalAlignBottom
    ToolbarAction.HOME -> Icons.Filled.Home
    ToolbarAction.SETTINGS -> Icons.Filled.Settings
    ToolbarAction.CUSTOMIZE -> Icons.Filled.Tune
    ToolbarAction.MENU -> Icons.Filled.MoreHoriz
    ToolbarAction.SEPARATOR -> Icons.Filled.Remove
}

val IconOpenInNew = Icons.AutoMirrored.Filled.OpenInNew
