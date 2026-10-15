package fr.qafila.browser.ui

import android.graphics.Bitmap
import androidx.compose.animation.animateContentSize
import androidx.compose.animation.core.tween
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.gestures.detectHorizontalDragGestures
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
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.Immutable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.focus.FocusRequester
import androidx.compose.ui.focus.focusRequester
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.layout.boundsInRoot
import androidx.compose.ui.layout.onGloballyPositioned
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.platform.LocalSoftwareKeyboardController
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.input.TextFieldValue
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import fr.qafila.browser.data.AccentColor
import fr.qafila.browser.data.AddressStyle
import fr.qafila.browser.data.Settings
import fr.qafila.browser.data.ToolbarAction
import fr.qafila.browser.data.ToolbarConfig
import fr.qafila.browser.data.ToolbarSlot
import fr.qafila.browser.data.ToolbarStyle

/** Ce que la barre affiche (page courante ou exemple pour les aperçus). */
@Immutable
data class ChromeData(
    val url: String?, val host: String?, val title: String, val readLabel: String?, val favicon: Bitmap?, val isPrivate: Boolean,
    val tabCount: Int, val canBack: Boolean, val canForward: Boolean, val loading: Boolean, val progress: Float, val active: Set<ToolbarAction>,
) {
    val shortUrl: String get() = (url ?: "").removePrefix("https://").removePrefix("http://").removePrefix("www.").removeSuffix("/")
}

class ChromeCallbacks(
    val onAction: (ToolbarAction) -> Unit = {},
    val onLongAction: (ToolbarAction) -> Unit = {},
    val onAddressTap: () -> Unit = {},
    val onAddressLongPress: () -> Unit = {},
    val onExpand: () -> Unit = {},
    /** -1 = Précédent, +1 = Suivant (balayage de la barre). */
    val onSwipe: (Int) -> Unit = {},
    /** Position horizontale (px, racine) du bouton Menu, pour y ancrer le menu flottant. */
    val onMenuAnchor: (Float) -> Unit = {},
)

const val ADDRESS_PLACEHOLDER = "Rechercher ou saisir une adresse"

/** Exemple utilisé par les aperçus (réglages, galerie, éditeur). */
fun sampleChromeData() = ChromeData(
    url = "https://aeon.co/essays/tech-vexed", host = "aeon.co", title = "Tech-vexed: how digital life threatens our capacity for awe", readLabel = "19 min",
    favicon = null, isPrivate = false, tabCount = 7, canBack = true, canForward = false, loading = false, progress = 1f, active = setOf(ToolbarAction.BLOCKER, ToolbarAction.JAVASCRIPT),
)

/**
 * La barre (« chrome ») : carte d'adresse + rangée d'icônes, ou mini-adresse (défilement « Réduire »), ou champ de saisie.
 * Le fond est dessiné ici ; les marges système (barre de navigation / d'état) sont ajoutées par l'appelant.
 */
@Composable
fun ChromeContent(
    data: ChromeData,
    s: Settings,
    toolbar: ToolbarConfig,
    colors: BarColors,
    modifier: Modifier = Modifier,
    collapsed: Boolean = false,
    interactive: Boolean = true,
    cb: ChromeCallbacks = ChromeCallbacks(),
    editing: (@Composable () -> Unit)? = null,
    background: Boolean = true,
) {
    val glass = toolbar.style == ToolbarStyle.GLASS
    val q = LocalQ.current
    Box(modifier.fillMaxWidth().animateContentSize(tween(180)).then(if (background) Modifier.background(if (glass) colors.bg.copy(alpha = 0.80f) else colors.bg) else Modifier)) {
        Column(Modifier.fillMaxWidth()) {
            if (glass) Box(Modifier.fillMaxWidth().height(0.5.dp).background(colors.hairline))
            when {
                editing != null -> editing()
                collapsed -> MiniAddress(data, colors, interactive, cb)
                else -> {
                    val inline = toolbar.hasInlineAddress
                    if (!inline && s.addressStyle != AddressStyle.HIDDEN) {
                        Box(Modifier.padding(start = 10.dp, end = 10.dp, top = 8.dp)) { AddressView(data, s, colors, inline = false, interactive = interactive, cb = cb) }
                    }
                    IconRow(data, s, toolbar.bar, colors, inline, interactive, cb, topPad = if (inline || s.addressStyle == AddressStyle.HIDDEN) 6.dp else 2.dp)
                }
            }
        }
        if (data.loading && data.progress < 1f && editing == null) {
            val c = if (s.accent == AccentColor.MONO) colors.text.copy(alpha = 0.55f) else q.accent
            Box(Modifier.fillMaxWidth(data.progress.coerceIn(0.05f, 1f)).height(2.dp).background(c))
        }
    }
}

@Composable
private fun IconRow(data: ChromeData, s: Settings, bar: List<ToolbarSlot>, colors: BarColors, inline: Boolean, interactive: Boolean, cb: ChromeCallbacks, topPad: Dp) {
    Row(Modifier.fillMaxWidth().padding(top = topPad, start = 6.dp, end = 6.dp).height(if (inline) 50.dp else 44.dp), verticalAlignment = Alignment.CenterVertically) {
        if (bar.isEmpty()) Spacer(Modifier.weight(1f))
        bar.forEach { slot ->
            when (slot.action) {
                ToolbarAction.SEPARATOR -> Box(Modifier.padding(horizontal = 3.dp).width(0.5.dp).height(20.dp).background(colors.secondary.copy(alpha = 0.5f)))
                ToolbarAction.ADDRESS -> Box(Modifier.weight(1f).padding(horizontal = 4.dp)) { AddressView(data, s, colors, inline = true, interactive = interactive, cb = cb) }
                else -> Box(if (inline) Modifier.width(46.dp) else Modifier.weight(1f), contentAlignment = Alignment.Center) { BarButton(slot, data, s, colors, interactive, cb) }
            }
        }
    }
}

@Composable
private fun BarButton(slot: ToolbarSlot, data: ChromeData, s: Settings, colors: BarColors, interactive: Boolean, cb: ChromeCallbacks) {
    val q = LocalQ.current
    val a = slot.action
    val enabled = when (a) { ToolbarAction.BACK -> data.canBack; ToolbarAction.FORWARD -> data.canForward; else -> true }
    val active = a in data.active
    val base = if (active && s.accent != AccentColor.MONO && a !in listOf(ToolbarAction.JAVASCRIPT, ToolbarAction.BLOCKER)) q.accent else colors.text
    val tint = base.copy(alpha = if (enabled) 1f else 0.3f)
    var mod = Modifier.size(44.dp)
    if (a == ToolbarAction.MENU) mod = mod.onGloballyPositioned { cb.onMenuAnchor(it.boundsInRoot().center.x) }
    Box(
        mod.then(if (interactive) Modifier.pressFade(enabled = enabled, onLongClick = { cb.onLongAction(a) }) { cb.onAction(a) } else Modifier),
        contentAlignment = Alignment.Center,
    ) {
        if (a == ToolbarAction.TABS) TabsSquare(data.tabCount, (slot.size.dp + 1).dp, tint, s.iconWeight.stroke)
        else {
            val icon = if (a == ToolbarAction.RELOAD && data.loading) QIcon.CLOSE else a.qicon(active, s.menuIcon)
            QIconView(icon, a.label, tint, slot.size.dp.dp, weight = s.iconWeight)
        }
    }
}

/** Mini-adresse (barre réduite) : domaine seul, 11 pt ; un tap rouvre la barre. */
@Composable
private fun MiniAddress(data: ChromeData, colors: BarColors, interactive: Boolean, cb: ChromeCallbacks) {
    Row(
        Modifier.fillMaxWidth().height(30.dp).then(if (interactive) Modifier.pressFade(onClick = cb.onExpand) else Modifier),
        horizontalArrangement = Arrangement.Center, verticalAlignment = Alignment.CenterVertically,
    ) {
        if (data.isPrivate) { QIconView(QIcon.PRIVATE, null, colors.secondary, 12.dp); Spacer(Modifier.width(4.dp)) }
        else if (data.url?.startsWith("https") == true) { QIconView(QIcon.LOCK, null, colors.secondary, 10.dp); Spacer(Modifier.width(4.dp)) }
        Text(data.host ?: "Rechercher", color = colors.text, fontSize = 11.sp, fontWeight = FontWeight.Medium, maxLines = 1)
    }
}

/** Les six styles d'adresse (DESIGN.md §2), en carte autonome ou « en ligne » dans la rangée d'icônes. */
@Composable
fun AddressView(data: ChromeData, s: Settings, colors: BarColors, inline: Boolean, interactive: Boolean, cb: ChromeCallbacks, styleOverride: AddressStyle? = null) {
    val style = styleOverride ?: s.addressStyle
    val empty = data.url == null
    val density = LocalDensity.current
    val gestures = if (!interactive) Modifier else Modifier
        .pointerInput(s.swipeBarNavigation) {
            if (!s.swipeBarNavigation) return@pointerInput
            var dx = 0f
            val threshold = with(density) { 56.dp.toPx() }
            detectHorizontalDragGestures(onDragStart = { dx = 0f }, onDragEnd = { if (dx > threshold) cb.onSwipe(-1) else if (dx < -threshold) cb.onSwipe(1) }) { _, d -> dx += d }
        }
        .pressFade(onLongClick = cb.onAddressLongPress, onClick = cb.onAddressTap)
    val showFav = s.addressShowsFavicon
    val showRead = s.addressShowsReadingTime && data.readLabel != null && !empty
    @Composable fun fav(size: Dp) = Favicon(data.favicon, data.host, size, private = data.isPrivate, bg = colors.pill, fg = colors.secondary)
    @Composable fun pill() = Pill(data.readLabel ?: "", colors.pill, colors.text)
    val cardShape = RoundedCornerShape(12.dp)
    val card = Modifier.fillMaxWidth().clip(cardShape).background(colors.card)

    when (style) {
        AddressStyle.CARD -> Row(card.heightIn(min = if (inline) 40.dp else 44.dp).then(gestures).padding(horizontal = 10.dp, vertical = 5.dp), verticalAlignment = Alignment.CenterVertically) {
            if (showFav) { fav(22.dp); Spacer(Modifier.width(9.dp)) }
            Column(Modifier.weight(1f)) {
                if (empty) Text(ADDRESS_PLACEHOLDER, color = colors.secondary, fontSize = 13.5.sp, maxLines = 1, overflow = TextOverflow.Ellipsis)
                else {
                    Text((data.host ?: "").uppercase(), color = colors.text, fontSize = 9.5.sp, lineHeight = 12.sp, fontWeight = FontWeight.Bold, letterSpacing = 0.6.sp, maxLines = 1, overflow = TextOverflow.Ellipsis)
                    Text(data.title, color = colors.text, fontSize = 12.5.sp, lineHeight = 16.sp, maxLines = 1, overflow = TextOverflow.Ellipsis)
                }
            }
            if (showRead) { Spacer(Modifier.width(8.dp)); pill() }
        }
        AddressStyle.FULL_URL -> Row(card.height(40.dp).then(gestures).padding(horizontal = 12.dp), verticalAlignment = Alignment.CenterVertically) {
            if (showFav) { fav(18.dp); Spacer(Modifier.width(8.dp)) }
            Text(if (empty) ADDRESS_PLACEHOLDER else data.shortUrl, Modifier.weight(1f), color = if (empty) colors.secondary else colors.text, fontSize = 13.5.sp, maxLines = 1, overflow = TextOverflow.Ellipsis)
            if (showRead) { Spacer(Modifier.width(8.dp)); pill() }
        }
        AddressStyle.CENTERED_DOMAIN -> Row(Modifier.fillMaxWidth().height(40.dp).clip(cardShape).background(colors.capsule).then(gestures).padding(horizontal = 12.dp), horizontalArrangement = Arrangement.Center, verticalAlignment = Alignment.CenterVertically) {
            if (showFav && !empty) { fav(16.dp); Spacer(Modifier.width(7.dp)) }
            Text(if (empty) ADDRESS_PLACEHOLDER else data.host ?: "", color = if (empty) colors.secondary else colors.text, fontSize = if (empty) 14.sp else 15.sp, maxLines = 1, overflow = TextOverflow.Ellipsis)
        }
        AddressStyle.TITLE_READ -> Row(card.height(40.dp).then(gestures).padding(horizontal = 10.dp), verticalAlignment = Alignment.CenterVertically) {
            if (showFav) { fav(20.dp); Spacer(Modifier.width(9.dp)) }
            Text(if (empty) ADDRESS_PLACEHOLDER else data.title, Modifier.weight(1f), color = if (empty) colors.secondary else colors.text, fontSize = 13.5.sp, maxLines = 1, overflow = TextOverflow.Ellipsis)
            if (showRead) { Spacer(Modifier.width(8.dp)); pill() }
        }
        AddressStyle.CENTERED_PLAIN, AddressStyle.HIDDEN -> {
            val align = if (inline) Alignment.Start else Alignment.CenterHorizontally
            val textAlign = if (inline) TextAlign.Start else TextAlign.Center
            if (style == AddressStyle.HIDDEN && !inline) return
            Column(Modifier.fillMaxWidth().heightIn(min = 38.dp).then(gestures).padding(horizontal = 4.dp, vertical = 3.dp), horizontalAlignment = align, verticalArrangement = Arrangement.Center) {
                if (empty) Text(ADDRESS_PLACEHOLDER, color = colors.secondary, fontSize = 14.sp, maxLines = 1, textAlign = textAlign)
                else if (style == AddressStyle.HIDDEN) Text(data.host ?: "", color = colors.text, fontSize = 15.sp, maxLines = 1, overflow = TextOverflow.Ellipsis)
                else {
                    Text((data.host ?: "").uppercase(), color = colors.text, fontSize = 9.5.sp, lineHeight = 12.sp, fontWeight = FontWeight.Bold, letterSpacing = 0.6.sp, maxLines = 1, textAlign = textAlign)
                    Text(data.title, color = colors.text, fontSize = 12.sp, lineHeight = 15.sp, maxLines = 1, overflow = TextOverflow.Ellipsis, textAlign = textAlign)
                }
            }
        }
    }
}

/** Mode saisie : la carte devient un champ, avec « Annuler ». */
@Composable
fun AddressEditor(value: TextFieldValue, colors: BarColors, onChange: (TextFieldValue) -> Unit, onGo: () -> Unit, onCancel: () -> Unit) {
    val focus = remember { FocusRequester() }
    val keyboard = LocalSoftwareKeyboardController.current
    LaunchedEffect(Unit) { focus.requestFocus(); keyboard?.show() }
    Row(Modifier.fillMaxWidth().padding(start = 10.dp, end = 4.dp, top = 8.dp, bottom = 8.dp), verticalAlignment = Alignment.CenterVertically) {
        Row(Modifier.weight(1f).height(42.dp).clip(RoundedCornerShape(12.dp)).background(colors.card).padding(start = 10.dp, end = 4.dp), verticalAlignment = Alignment.CenterVertically) {
            QIconView(QIcon.SEARCH, null, colors.secondary, 16.dp)
            Spacer(Modifier.width(8.dp))
            BasicTextField(
                value = value, onValueChange = onChange, singleLine = true, modifier = Modifier.weight(1f).focusRequester(focus),
                textStyle = TextStyle(color = colors.text, fontSize = 15.sp), cursorBrush = SolidColor(colors.text),
                keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Uri, imeAction = ImeAction.Go, autoCorrectEnabled = false),
                keyboardActions = KeyboardActions(onGo = { onGo() }),
                decorationBox = { inner -> Box(contentAlignment = Alignment.CenterStart) { if (value.text.isEmpty()) Text(ADDRESS_PLACEHOLDER, color = colors.secondary, fontSize = 15.sp, maxLines = 1); inner() } },
            )
            if (value.text.isNotEmpty()) Box(Modifier.size(32.dp).pressFade { onChange(TextFieldValue("")) }, contentAlignment = Alignment.Center) {
                Box(Modifier.size(17.dp).clip(RoundedCornerShape(50)).background(colors.secondary.copy(alpha = 0.6f)), contentAlignment = Alignment.Center) { QIconView(QIcon.CLOSE, "Effacer", colors.card, 11.dp) }
            }
        }
        Text("Annuler", Modifier.pressFade(onClick = onCancel).padding(horizontal = 10.dp, vertical = 10.dp), color = colors.text, fontSize = 15.sp)
    }
}

/** Aperçu en direct de la barre (réglages, galerie, éditeur) avec une page d'exemple. */
@Composable
fun ChromePreview(s: Settings, modifier: Modifier = Modifier, toolbar: ToolbarConfig = s.toolbar, addressStyle: AddressStyle? = null, compact: Boolean = false) {
    val q = LocalQ.current
    val siteColor = if (q.dark) Color(0xFF1E1D1B) else Color(0xFFF6F3EE)
    val bar = barColorsFor(resolveBarColor(s, q.dark, siteColor, private = false, darkened = false))
    val settings = if (addressStyle != null) s.copy(addressStyle = addressStyle) else s
    val pageBg = if (q.dark) Color(0xFF121212) else Color.White
    val line = if (q.dark) Color(0xFF3A3A3C) else Color(0xFFE5E5EA)
    Column(modifier.fillMaxWidth().clip(RoundedCornerShape(18.dp)).border(0.5.dp, q.separator, RoundedCornerShape(18.dp)).background(pageBg)) {
        if (!compact) Column(Modifier.fillMaxWidth().padding(horizontal = 18.dp, vertical = 14.dp)) {
            Text("Tech-vexed", color = q.text, fontSize = 20.sp, fontFamily = androidx.compose.ui.text.font.FontFamily.Serif)
            Spacer(Modifier.height(8.dp))
            Box(Modifier.fillMaxWidth().height(6.dp).clip(RoundedCornerShape(3.dp)).background(line))
            Spacer(Modifier.height(6.dp))
            Box(Modifier.fillMaxWidth(0.8f).height(6.dp).clip(RoundedCornerShape(3.dp)).background(line))
        }
        ChromeContent(sampleChromeData(), settings, toolbar, bar, interactive = false)
        Box(Modifier.fillMaxWidth().background(if (toolbar.style == ToolbarStyle.GLASS) bar.bg.copy(alpha = 0.8f) else bar.bg).padding(top = 6.dp, bottom = 8.dp), contentAlignment = Alignment.Center) {
            Box(Modifier.width(110.dp).height(4.dp).clip(RoundedCornerShape(2.dp)).background(bar.text.copy(alpha = 0.85f)))
        }
    }
}
