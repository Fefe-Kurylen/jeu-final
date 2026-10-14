package fr.furtif.browser.ui

import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.graphics.Color
import fr.furtif.browser.data.AccentColor
import fr.furtif.browser.data.Appearance
import fr.furtif.browser.data.BrowserStore

@Composable
fun FurtifTheme(store: BrowserStore, content: @Composable () -> Unit) {
    val state by store.state.collectAsState()
    val dark = when (state.settings.appearance) { Appearance.SYSTEM -> isSystemInDarkTheme(); Appearance.LIGHT -> false; Appearance.DARK -> true }
    val accent = if (state.settings.accent == AccentColor.MONO) (if (dark) Color(0xFFF2F4F7) else Color(0xFF17191C)) else Color(state.settings.accent.argb)
    val scheme = if (dark) darkColorScheme(primary = accent, onPrimary = if (state.settings.accent == AccentColor.MONO) Color(0xFF17191C) else Color.White, background = Color(0xFF17191C), surface = Color(0xFF17191C), surfaceVariant = Color(0xFF23252B), onSurface = Color(0xFFF2F4F7), onSurfaceVariant = Color(0xFFA8B4C7), outlineVariant = Color(0xFF2F323A))
                 else lightColorScheme(primary = accent, onPrimary = Color.White, background = Color.White, surface = Color.White, surfaceVariant = Color(0xFFF2F4F7), onSurface = Color(0xFF17191C), onSurfaceVariant = Color(0xFF647896), outlineVariant = Color(0xFFE6EAEF))
    MaterialTheme(colorScheme = scheme, content = content)
}
