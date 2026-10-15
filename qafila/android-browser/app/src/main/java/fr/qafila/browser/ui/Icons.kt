package fr.qafila.browser.ui

import androidx.compose.material3.Icon
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.StrokeJoin
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.graphics.vector.PathBuilder
import androidx.compose.ui.graphics.vector.path
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.foundation.layout.size
import fr.qafila.browser.data.IconWeight
import fr.qafila.browser.data.MenuIconStyle
import fr.qafila.browser.data.ToolbarAction
import kotlin.math.cos
import kotlin.math.sin

/**
 * Icônes au trait fin dessinées à la main (grille 24), façon SF Symbols « light » :
 * la graisse (Fine / Normale / Grasse) change réellement l'épaisseur du trait.
 */
enum class QIcon {
    BACK, FORWARD, SHARE, PLUS, CLOSE, RELOAD, SEARCH, DOTS, DOTS_CIRCLE, LINES_CIRCLE, TABS, PRIVATE, TRASH, STAR, STAR_FILLED, BOOK, CLOCK, COPY,
    FIND, SHIELD, SHIELD_SLASH, MOON, SUN, READER, JS, JS_SLASH, DESKTOP, TRANSLATE, TOP, BOTTOM, HOME, GEAR, SLIDERS, UNDO, ADDRESS, SEPARATOR,
    CHEVRON_RIGHT, CHEVRON_UP, CHEVRON_DOWN, CHEVRON_UPDOWN, CHECK, CONTRAST, BAR, GLOBE, LOCK, INFO, BATTERY, GRID, LIST, TEXT, MINUS, PHONE,
}

private val cache = HashMap<Pair<QIcon, IconWeight>, ImageVector>()

fun QIcon.vector(weight: IconWeight = IconWeight.REGULAR): ImageVector = cache.getOrPut(this to weight) { build(this, weight.stroke) }

@Composable
fun QIconView(icon: QIcon, contentDescription: String?, tint: Color, size: Dp = 20.dp, modifier: Modifier = Modifier, weight: IconWeight? = null) {
    Icon(icon.vector(weight ?: LocalIconWeight.current), contentDescription, modifier.size(size), tint = tint)
}

private fun PathBuilder.circle(cx: Float, cy: Float, r: Float) { moveTo(cx - r, cy); arcToRelative(r, r, 0f, true, true, 2 * r, 0f); arcToRelative(r, r, 0f, true, true, -2 * r, 0f); close() }
private fun PathBuilder.rrect(l: Float, t: Float, r: Float, b: Float, rad: Float) {
    moveTo(l + rad, t); lineTo(r - rad, t); arcTo(rad, rad, 0f, false, true, r, t + rad); lineTo(r, b - rad); arcTo(rad, rad, 0f, false, true, r - rad, b)
    lineTo(l + rad, b); arcTo(rad, rad, 0f, false, true, l, b - rad); lineTo(l, t + rad); arcTo(rad, rad, 0f, false, true, l + rad, t); close()
}
private fun PathBuilder.poly(vararg p: Float) { moveTo(p[0], p[1]); var i = 2; while (i < p.size) { lineTo(p[i], p[i + 1]); i += 2 } }

private fun build(icon: QIcon, w: Float): ImageVector {
    val b = ImageVector.Builder(name = icon.name, defaultWidth = 24.dp, defaultHeight = 24.dp, viewportWidth = 24f, viewportHeight = 24f)
    val black = SolidColor(Color.Black)
    fun stroke(block: PathBuilder.() -> Unit) = b.path(stroke = black, strokeLineWidth = w, strokeLineCap = StrokeCap.Round, strokeLineJoin = StrokeJoin.Round, pathBuilder = block)
    fun fill(block: PathBuilder.() -> Unit) = b.path(fill = black, pathBuilder = block)
    fun star(filled: Boolean) {
        val pts = FloatArray(20)
        for (i in 0 until 10) {
            val a = Math.toRadians(-90.0 + i * 36.0); val r = if (i % 2 == 0) 9.2f else 3.9f
            pts[i * 2] = 12f + r * cos(a).toFloat(); pts[i * 2 + 1] = 12.8f + r * sin(a).toFloat()
        }
        val block: PathBuilder.() -> Unit = { poly(*pts); close() }
        if (filled) { fill(block); stroke(block) } else stroke(block)
    }
    when (icon) {
        QIcon.BACK -> stroke { poly(15f, 4.5f, 7.5f, 12f, 15f, 19.5f) }
        QIcon.FORWARD -> stroke { poly(9f, 4.5f, 16.5f, 12f, 9f, 19.5f) }
        QIcon.SHARE -> {
            stroke { poly(12f, 14.5f, 12f, 3f); poly(8.3f, 6.6f, 12f, 2.9f, 15.7f, 6.6f) }
            stroke { moveTo(9f, 9.5f); lineTo(8f, 9.5f); arcTo(1.6f, 1.6f, 0f, false, false, 6.4f, 11.1f); lineTo(6.4f, 19f); arcTo(1.6f, 1.6f, 0f, false, false, 8f, 20.6f)
                lineTo(16f, 20.6f); arcTo(1.6f, 1.6f, 0f, false, false, 17.6f, 19f); lineTo(17.6f, 11.1f); arcTo(1.6f, 1.6f, 0f, false, false, 16f, 9.5f); lineTo(15f, 9.5f) }
        }
        QIcon.PLUS -> stroke { poly(12f, 4.5f, 12f, 19.5f); poly(4.5f, 12f, 19.5f, 12f) }
        QIcon.CLOSE -> stroke { poly(6.2f, 6.2f, 17.8f, 17.8f); poly(17.8f, 6.2f, 6.2f, 17.8f) }
        QIcon.MINUS -> stroke { poly(6f, 12f, 18f, 12f) }
        QIcon.RELOAD -> stroke { moveTo(17.4f, 7.1f); arcTo(7.4f, 7.4f, 0f, true, true, 12f, 5.1f); poly(9.4f, 2.6f, 12.1f, 5.1f, 9.4f, 7.6f) }
        QIcon.SEARCH -> stroke { circle(10.6f, 10.6f, 6.1f); poly(15.1f, 15.1f, 20f, 20f) }
        QIcon.DOTS -> fill { circle(5.4f, 12f, 1.5f); circle(12f, 12f, 1.5f); circle(18.6f, 12f, 1.5f) }
        QIcon.DOTS_CIRCLE -> { stroke { circle(12f, 12f, 9f) }; fill { circle(8f, 12f, 1.15f); circle(12f, 12f, 1.15f); circle(16f, 12f, 1.15f) } }
        QIcon.LINES_CIRCLE -> stroke { circle(12f, 12f, 9f); poly(8f, 9f, 16f, 9f); poly(8f, 12f, 16f, 12f); poly(8f, 15f, 16f, 15f) }
        QIcon.TABS -> stroke {
            rrect(3.8f, 8.2f, 15.8f, 20.2f, 2.6f)
            moveTo(8.2f, 8.2f); lineTo(8.2f, 6.4f); arcTo(2.6f, 2.6f, 0f, false, true, 10.8f, 3.8f); lineTo(17.6f, 3.8f); arcTo(2.6f, 2.6f, 0f, false, true, 20.2f, 6.4f)
            lineTo(20.2f, 13.2f); arcTo(2.6f, 2.6f, 0f, false, true, 17.6f, 15.8f); lineTo(15.8f, 15.8f)
        }
        QIcon.PRIVATE -> stroke {
            moveTo(2.5f, 12f); curveTo(4.8f, 7.8f, 8.2f, 5.6f, 12f, 5.6f); curveTo(15.8f, 5.6f, 19.2f, 7.8f, 21.5f, 12f); curveTo(19.2f, 16.2f, 15.8f, 18.4f, 12f, 18.4f); curveTo(8.2f, 18.4f, 4.8f, 16.2f, 2.5f, 12f); close()
            circle(12f, 12f, 3f); poly(4f, 4f, 20f, 20f)
        }
        QIcon.TRASH -> stroke { poly(4f, 6.5f, 20f, 6.5f); poly(9.2f, 6.5f, 9.2f, 4f, 14.8f, 4f, 14.8f, 6.5f); poly(6f, 6.5f, 7f, 20.2f, 17f, 20.2f, 18f, 6.5f); poly(10.2f, 10f, 10.2f, 16.5f); poly(13.8f, 10f, 13.8f, 16.5f) }
        QIcon.STAR -> star(false)
        QIcon.STAR_FILLED -> star(true)
        QIcon.BOOK -> stroke {
            moveTo(12f, 6.6f); curveTo(10f, 5f, 6.6f, 4.5f, 3f, 5f); lineTo(3f, 18.6f); curveTo(6.6f, 18.1f, 10f, 18.6f, 12f, 20.1f); curveTo(14f, 18.6f, 17.4f, 18.1f, 21f, 18.6f)
            lineTo(21f, 5f); curveTo(17.4f, 4.5f, 14f, 5f, 12f, 6.6f); close(); poly(12f, 6.6f, 12f, 20.1f)
        }
        QIcon.CLOCK -> stroke { circle(12f, 12f, 9f); poly(12f, 7f, 12f, 12f, 15.5f, 14.2f) }
        QIcon.COPY -> stroke {
            rrect(4.5f, 7.5f, 14.5f, 20.5f, 2.2f)
            moveTo(8.5f, 7.5f); lineTo(8.5f, 5.7f); arcTo(2.2f, 2.2f, 0f, false, true, 10.7f, 3.5f); lineTo(17.3f, 3.5f); arcTo(2.2f, 2.2f, 0f, false, true, 19.5f, 5.7f)
            lineTo(19.5f, 14.3f); arcTo(2.2f, 2.2f, 0f, false, true, 17.3f, 16.5f); lineTo(14.5f, 16.5f)
        }
        QIcon.FIND -> stroke {
            moveTo(11f, 20.5f); lineTo(6.5f, 20.5f); arcTo(2f, 2f, 0f, false, true, 4.5f, 18.5f); lineTo(4.5f, 5.5f); arcTo(2f, 2f, 0f, false, true, 6.5f, 3.5f)
            lineTo(15.5f, 3.5f); arcTo(2f, 2f, 0f, false, true, 17.5f, 5.5f); lineTo(17.5f, 9.5f)
            poly(8f, 7.5f, 14f, 7.5f); poly(8f, 11f, 11.5f, 11f); circle(15.2f, 15.2f, 3.1f); poly(17.5f, 17.5f, 20.2f, 20.2f)
        }
        QIcon.SHIELD, QIcon.SHIELD_SLASH -> stroke {
            moveTo(12f, 3f); lineTo(19.2f, 5.9f); lineTo(19.2f, 11.4f); curveTo(19.2f, 15.8f, 16.2f, 19.3f, 12f, 21f); curveTo(7.8f, 19.3f, 4.8f, 15.8f, 4.8f, 11.4f); lineTo(4.8f, 5.9f); close()
            if (icon == QIcon.SHIELD_SLASH) poly(3.5f, 3.5f, 20.5f, 20.5f)
        }
        QIcon.MOON -> stroke { moveTo(19.8f, 14.6f); arcTo(8.4f, 8.4f, 0f, true, true, 9.4f, 4.2f); arcTo(6.8f, 6.8f, 0f, false, false, 19.8f, 14.6f); close() }
        QIcon.SUN -> stroke {
            circle(12f, 12f, 3.8f)
            for (i in 0 until 8) { val a = Math.toRadians(i * 45.0); poly(12f + 6.6f * cos(a).toFloat(), 12f + 6.6f * sin(a).toFloat(), 12f + 8.9f * cos(a).toFloat(), 12f + 8.9f * sin(a).toFloat()) }
        }
        QIcon.READER -> stroke { rrect(4.5f, 3.5f, 19.5f, 20.5f, 2.4f); poly(8f, 8f, 16f, 8f); poly(8f, 11.5f, 16f, 11.5f); poly(8f, 15f, 13f, 15f) }
        QIcon.JS, QIcon.JS_SLASH -> stroke {
            moveTo(10f, 5f); lineTo(10f, 15f); curveTo(10f, 17.9f, 8.6f, 19f, 6.6f, 19f); curveTo(5.3f, 19f, 4.5f, 18.4f, 4f, 17.5f)
            moveTo(19.5f, 7f); curveTo(18.9f, 5.6f, 17.6f, 5f, 16.1f, 5f); curveTo(14.1f, 5f, 12.9f, 6.2f, 12.9f, 7.8f); curveTo(12.9f, 11.6f, 19.8f, 10.3f, 19.8f, 14.8f)
            curveTo(19.8f, 17.3f, 18.2f, 19f, 15.8f, 19f); curveTo(14.2f, 19f, 12.9f, 18.2f, 12.3f, 16.8f)
            if (icon == QIcon.JS_SLASH) poly(3f, 3f, 21f, 21f)
        }
        QIcon.DESKTOP -> stroke { rrect(3f, 4f, 21f, 16f, 2f); poly(12f, 16f, 12f, 20f); poly(8f, 20f, 16f, 20f) }
        QIcon.TRANSLATE -> stroke {
            moveTo(10f, 14f); lineTo(5.5f, 14f); arcTo(2.5f, 2.5f, 0f, false, true, 3f, 11.5f); lineTo(3f, 5.5f); arcTo(2.5f, 2.5f, 0f, false, true, 5.5f, 3f)
            lineTo(11.5f, 3f); arcTo(2.5f, 2.5f, 0f, false, true, 14f, 5.5f); lineTo(14f, 10f)
            poly(5.6f, 6.4f, 11.4f, 6.4f); poly(8.5f, 4.9f, 8.5f, 6.4f); poly(6.3f, 6.4f, 10.7f, 11.6f); poly(10.7f, 6.4f, 6.3f, 11.6f)
            rrect(10f, 10f, 21f, 21f, 2.5f); poly(13f, 18.6f, 15.5f, 12.6f, 18f, 18.6f); poly(13.9f, 16.6f, 17.1f, 16.6f)
        }
        QIcon.TOP -> stroke { circle(12f, 12f, 9f); poly(8f, 13.8f, 12f, 9.8f, 16f, 13.8f) }
        QIcon.BOTTOM -> stroke { circle(12f, 12f, 9f); poly(8f, 10.2f, 12f, 14.2f, 16f, 10.2f) }
        QIcon.HOME -> stroke { poly(3.5f, 11f, 12f, 4f, 20.5f, 11f); poly(6f, 9f, 6f, 20f, 18f, 20f, 18f, 9f); poly(10f, 20f, 10f, 14.5f, 14f, 14.5f, 14f, 20f) }
        QIcon.GEAR -> stroke {
            val pts = ArrayList<Float>()
            for (i in 0 until 8) {
                val base = i * 45.0
                for ((da, r) in listOf(-15.0 to 6.9f, -8.0 to 9.2f, 8.0 to 9.2f, 15.0 to 6.9f)) { val a = Math.toRadians(base + da); pts += 12f + r * cos(a).toFloat(); pts += 12f + r * sin(a).toFloat() }
            }
            poly(*pts.toFloatArray()); close(); circle(12f, 12f, 3f)
        }
        QIcon.SLIDERS -> stroke {
            poly(4f, 7f, 7f, 7f); circle(9f, 7f, 2f); poly(11f, 7f, 20f, 7f)
            poly(4f, 12f, 13f, 12f); circle(15f, 12f, 2f); poly(17f, 12f, 20f, 12f)
            poly(4f, 17f, 6f, 17f); circle(8f, 17f, 2f); poly(10f, 17f, 20f, 17f)
        }
        QIcon.UNDO -> stroke { poly(9f, 13.5f, 4.5f, 9f, 9f, 4.5f); moveTo(4.5f, 9f); lineTo(14.5f, 9f); curveTo(17.6f, 9f, 20f, 11.4f, 20f, 14.5f); curveTo(20f, 17.6f, 17.6f, 20f, 14.5f, 20f); lineTo(11f, 20f) }
        QIcon.ADDRESS -> stroke { rrect(2.5f, 7f, 21.5f, 17f, 5f); poly(6.5f, 12f, 14f, 12f) }
        QIcon.SEPARATOR -> stroke { poly(3f, 12f, 21f, 12f) }
        QIcon.CHEVRON_RIGHT -> stroke { poly(9.5f, 5.5f, 16f, 12f, 9.5f, 18.5f) }
        QIcon.CHEVRON_UP -> stroke { poly(5.5f, 15f, 12f, 8.5f, 18.5f, 15f) }
        QIcon.CHEVRON_DOWN -> stroke { poly(5.5f, 9f, 12f, 15.5f, 18.5f, 9f) }
        QIcon.CHEVRON_UPDOWN -> stroke { poly(8f, 9.5f, 12f, 5.5f, 16f, 9.5f); poly(8f, 14.5f, 12f, 18.5f, 16f, 14.5f) }
        QIcon.CHECK -> stroke { poly(5f, 12.5f, 10f, 17.5f, 19.5f, 7f) }
        QIcon.CONTRAST -> { stroke { circle(12f, 12f, 9f) }; fill { moveTo(12f, 3f); arcTo(9f, 9f, 0f, false, true, 12f, 21f); close() } }
        QIcon.BAR -> stroke { rrect(3.5f, 3.5f, 20.5f, 20.5f, 3.5f); poly(3.5f, 15f, 20.5f, 15f); poly(8f, 17.8f, 9.5f, 17.8f); poly(14.5f, 17.8f, 16f, 17.8f) }
        QIcon.GLOBE -> stroke { circle(12f, 12f, 9f); moveTo(12f, 3f); curveTo(8.4f, 6.2f, 8.4f, 17.8f, 12f, 21f); moveTo(12f, 3f); curveTo(15.6f, 6.2f, 15.6f, 17.8f, 12f, 21f); poly(3.3f, 9.5f, 20.7f, 9.5f); poly(3.3f, 14.5f, 20.7f, 14.5f) }
        QIcon.LOCK -> stroke { rrect(5.5f, 10.5f, 18.5f, 20.5f, 2.2f); moveTo(8.5f, 10.5f); lineTo(8.5f, 7.8f); arcTo(3.5f, 3.5f, 0f, false, true, 15.5f, 7.8f); lineTo(15.5f, 10.5f) }
        QIcon.INFO -> { stroke { circle(12f, 12f, 9f); poly(12f, 11f, 12f, 16.6f) }; fill { circle(12f, 7.9f, 1.05f) } }
        QIcon.BATTERY -> { stroke { rrect(2.5f, 7.5f, 19f, 16.5f, 2.6f); poly(21.2f, 10.6f, 21.2f, 13.4f) }; fill { rrect(5f, 10f, 10.5f, 14f, 1f) } }
        QIcon.GRID -> stroke { rrect(4f, 4f, 10.6f, 10.6f, 1.8f); rrect(13.4f, 4f, 20f, 10.6f, 1.8f); rrect(4f, 13.4f, 10.6f, 20f, 1.8f); rrect(13.4f, 13.4f, 20f, 20f, 1.8f) }
        QIcon.LIST -> stroke { poly(8.5f, 6.5f, 20f, 6.5f); poly(8.5f, 12f, 20f, 12f); poly(8.5f, 17.5f, 20f, 17.5f); poly(4.5f, 6.5f, 4.6f, 6.5f); poly(4.5f, 12f, 4.6f, 12f); poly(4.5f, 17.5f, 4.6f, 17.5f) }
        QIcon.TEXT -> stroke { poly(3f, 18.5f, 8f, 5.5f, 13f, 18.5f); poly(4.9f, 13.6f, 11.1f, 13.6f); poly(15f, 18.5f, 18f, 10.5f, 21f, 18.5f); poly(16.1f, 15.6f, 19.9f, 15.6f) }
        QIcon.PHONE -> stroke { rrect(6.5f, 2.5f, 17.5f, 21.5f, 2.8f); poly(10.5f, 18.5f, 13.5f, 18.5f) }
    }
    return b.build()
}

/** Icône d'une action (selon son état : favori ajouté, bloqueur actif…). */
fun ToolbarAction.qicon(active: Boolean = false, menuIcon: MenuIconStyle = MenuIconStyle.DOTS): QIcon = when (this) {
    ToolbarAction.BACK -> QIcon.BACK
    ToolbarAction.FORWARD -> QIcon.FORWARD
    ToolbarAction.RELOAD -> QIcon.RELOAD
    ToolbarAction.STOP -> QIcon.CLOSE
    ToolbarAction.TABS -> QIcon.TABS
    ToolbarAction.NEW_TAB -> QIcon.PLUS
    ToolbarAction.NEW_PRIVATE_TAB -> QIcon.PRIVATE
    ToolbarAction.REOPEN_TAB -> QIcon.UNDO
    ToolbarAction.CLOSE_TAB -> QIcon.CLOSE
    ToolbarAction.CLOSE_ALL_TABS -> QIcon.CLOSE
    ToolbarAction.CLOSE_ALL_AND_CLEAR -> QIcon.TRASH
    ToolbarAction.BOOKMARKS -> QIcon.BOOK
    ToolbarAction.ADD_BOOKMARK -> if (active) QIcon.STAR_FILLED else QIcon.STAR
    ToolbarAction.HISTORY -> QIcon.CLOCK
    ToolbarAction.SHARE -> QIcon.SHARE
    ToolbarAction.COPY_LINK -> QIcon.COPY
    ToolbarAction.FIND -> QIcon.FIND
    ToolbarAction.SEARCH -> QIcon.SEARCH
    ToolbarAction.BLOCKER -> if (active) QIcon.SHIELD else QIcon.SHIELD_SLASH
    ToolbarAction.DARKEN -> if (active) QIcon.SUN else QIcon.MOON
    ToolbarAction.READER -> QIcon.READER
    ToolbarAction.JAVASCRIPT -> if (active) QIcon.JS else QIcon.JS_SLASH
    ToolbarAction.DESKTOP_SITE -> if (active) QIcon.PHONE else QIcon.DESKTOP
    ToolbarAction.TRANSLATE -> QIcon.TRANSLATE
    ToolbarAction.SCROLL_TOP -> QIcon.TOP
    ToolbarAction.SCROLL_BOTTOM -> QIcon.BOTTOM
    ToolbarAction.HOME -> QIcon.HOME
    ToolbarAction.SETTINGS -> QIcon.GEAR
    ToolbarAction.CUSTOMIZE -> QIcon.SLIDERS
    ToolbarAction.MENU -> when (menuIcon) { MenuIconStyle.DOTS -> QIcon.DOTS; MenuIconStyle.DOTS_CIRCLE -> QIcon.DOTS_CIRCLE; MenuIconStyle.LINES_CIRCLE -> QIcon.LINES_CIRCLE }
    ToolbarAction.ADDRESS -> QIcon.ADDRESS
    ToolbarAction.SEPARATOR -> QIcon.SEPARATOR
}
