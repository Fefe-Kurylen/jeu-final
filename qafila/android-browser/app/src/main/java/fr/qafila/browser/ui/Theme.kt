package fr.qafila.browser.ui

import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Typography
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.Immutable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.staticCompositionLocalOf
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.compositeOver
import androidx.compose.ui.graphics.lerp
import androidx.compose.ui.graphics.luminance
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.unit.sp
import fr.qafila.browser.data.AccentColor
import fr.qafila.browser.data.Appearance
import fr.qafila.browser.data.BarColor
import fr.qafila.browser.data.BrowserStore
import fr.qafila.browser.data.IconWeight
import fr.qafila.browser.data.Settings

/** Palette neutre (DESIGN.md §1) : pas de surfaces tonales, couleurs explicites. */
@Immutable
data class QColors(
    val dark: Boolean,
    val groupedBg: Color,     // fond des écrans réglages / onglets
    val card: Color,          // cartes blanches
    val page: Color,          // fond de page (démarrage)
    val text: Color,
    val secondary: Color,
    val tertiary: Color,
    val separator: Color,
    val fill: Color,          // pastilles, capsules
    val accent: Color,
    val onAccent: Color,
    val destructive: Color,
    val barDefault: Color,
    val menuBg: Color,
)

fun qColors(dark: Boolean, accent: AccentColor): QColors {
    val acc = if (accent == AccentColor.MONO) (if (dark) Color(0xFFF2F2F7) else Color(0xFF111111)) else Color(accent.argb)
    return if (dark) QColors(
        dark = true, groupedBg = Color(0xFF000000), card = Color(0xFF1C1C1E), page = Color(0xFF000000), text = Color(0xFFF2F2F7), secondary = Color(0xFF8E8E93),
        tertiary = Color(0xFF48484A), separator = Color(0xFF38383A), fill = Color(0xFF2C2C2E), accent = acc, onAccent = if (accent == AccentColor.MONO) Color(0xFF111111) else Color.White,
        destructive = Color(0xFFFF453A), barDefault = Color(0xFF1C1C1E), menuBg = Color(0xF22C2C2E),
    ) else QColors(
        dark = false, groupedBg = Color(0xFFF2F2F7), card = Color.White, page = Color.White, text = Color(0xFF111111), secondary = Color(0xFF8E8E93),
        tertiary = Color(0xFFC7C7CC), separator = Color(0xFFD1D1D6), fill = Color(0xFFE9E9EE), accent = acc, onAccent = Color.White,
        destructive = Color(0xFFFF3B30), barDefault = Color(0xFFF2F2F7), menuBg = Color(0xF5F9F9F9),
    )
}

/** Couleurs de la barre, dérivées de sa couleur de fond (lisibles sur n'importe quelle teinte). */
@Immutable
data class BarColors(val bg: Color, val card: Color, val capsule: Color, val text: Color, val secondary: Color, val pill: Color, val light: Boolean, val hairline: Color)

fun barColorsFor(bg: Color): BarColors {
    val light = bg.luminance() > 0.45f
    val nearWhite = bg.luminance() > 0.93f
    val card = when {
        nearWhite -> Color(0xFFF1F1F4)
        light -> lerp(bg, Color.White, 0.72f)
        else -> lerp(bg, Color.White, 0.11f)
    }
    val capsule = if (light) lerp(bg, Color.Black, 0.07f) else lerp(bg, Color.White, 0.13f)
    return BarColors(
        bg = bg, card = card, capsule = capsule,
        text = if (light) Color(0xFF111111) else Color(0xFFF2F2F7),
        secondary = if (light) Color(0xFF6C6C70) else Color(0xFFAEAEB2),
        pill = if (light) Color.Black.copy(alpha = 0.07f).compositeOver(card) else Color.White.copy(alpha = 0.12f).compositeOver(card),
        light = light,
        hairline = if (light) Color.Black.copy(alpha = 0.08f) else Color.White.copy(alpha = 0.08f),
    )
}

/** Couleur de fond de la barre selon les réglages (palette claire/sombre, ou Auto = couleur du site). */
fun resolveBarColor(s: Settings, dark: Boolean, siteColor: Color?, private: Boolean, darkened: Boolean): Color {
    if (private) return Color(0xFF1C1C1E)
    val choice = if (dark) s.barColorDark else s.barColorLight
    val fallback = if (dark) Color(0xFF1C1C1E) else Color(0xFFF2F2F7)
    if (choice != BarColor.AUTO) return Color(choice.argb)
    if (siteColor == null || darkened) return if (darkened) Color(0xFF1C1C1E) else fallback
    // En mode sombre, une couleur de site très claire éblouirait : on garde la barre sombre.
    if (dark && siteColor.luminance() > 0.5f) return fallback
    return siteColor
}

fun parseHex(hex: String?): Color? = runCatching { Color(android.graphics.Color.parseColor(hex ?: return null)) }.getOrNull()

val LocalQ = staticCompositionLocalOf { qColors(false, AccentColor.MONO) }
val LocalIconWeight = staticCompositionLocalOf { IconWeight.REGULAR }

/** Typographie système, petite et précise : pas d'interlignage ni d'interlettrage Material par défaut. */
private val baseText = TextStyle(fontSize = 15.sp, letterSpacing = (-0.1).sp)
private val qTypography = Typography(
    bodyLarge = baseText, bodyMedium = baseText.copy(fontSize = 14.sp), bodySmall = baseText.copy(fontSize = 12.sp),
    labelLarge = baseText.copy(fontSize = 14.sp), labelMedium = baseText.copy(fontSize = 12.sp), labelSmall = baseText.copy(fontSize = 11.sp),
    titleLarge = baseText.copy(fontSize = 20.sp), titleMedium = baseText.copy(fontSize = 16.sp), titleSmall = baseText.copy(fontSize = 14.sp),
)

object QType {
    val title = TextStyle(fontSize = 17.sp, letterSpacing = (-0.2).sp)
    val body = TextStyle(fontSize = 15.sp, letterSpacing = (-0.1).sp)
    val small = TextStyle(fontSize = 13.sp)
    val caption = TextStyle(fontSize = 11.sp, letterSpacing = 0.3.sp)
}

@Composable
fun isQDark(store: BrowserStore): Boolean {
    val state by store.state.collectAsState()
    return when (state.settings.appearance) { Appearance.SYSTEM -> isSystemInDarkTheme(); Appearance.LIGHT -> false; Appearance.DARK -> true }
}

@Composable
fun QafilaTheme(store: BrowserStore, content: @Composable () -> Unit) {
    val state by store.state.collectAsState()
    val dark = isQDark(store)
    val q = qColors(dark, state.settings.accent)
    // Schéma Material neutralisé : aucune teinte tonale (surfaceTint transparent), mêmes couleurs que la palette Qafila.
    val scheme = if (dark) darkColorScheme(
        primary = q.accent, onPrimary = q.onAccent, secondary = q.accent, tertiary = q.accent, background = q.groupedBg, onBackground = q.text,
        surface = q.card, onSurface = q.text, surfaceVariant = q.fill, onSurfaceVariant = q.secondary, surfaceTint = Color.Transparent,
        surfaceContainer = q.card, surfaceContainerLow = q.card, surfaceContainerHigh = q.card, surfaceContainerHighest = q.fill, surfaceContainerLowest = q.card,
        outline = q.separator, outlineVariant = q.separator, error = q.destructive, primaryContainer = q.fill, onPrimaryContainer = q.text, secondaryContainer = q.fill, onSecondaryContainer = q.text,
    ) else lightColorScheme(
        primary = q.accent, onPrimary = q.onAccent, secondary = q.accent, tertiary = q.accent, background = q.groupedBg, onBackground = q.text,
        surface = q.card, onSurface = q.text, surfaceVariant = q.fill, onSurfaceVariant = q.secondary, surfaceTint = Color.Transparent,
        surfaceContainer = q.card, surfaceContainerLow = q.card, surfaceContainerHigh = q.card, surfaceContainerHighest = q.fill, surfaceContainerLowest = q.card,
        outline = q.separator, outlineVariant = q.separator, error = q.destructive, primaryContainer = q.fill, onPrimaryContainer = q.text, secondaryContainer = q.fill, onSecondaryContainer = q.text,
    )
    CompositionLocalProvider(LocalQ provides q, LocalIconWeight provides state.settings.iconWeight) {
        MaterialTheme(colorScheme = scheme, typography = qTypography, content = content)
    }
}
