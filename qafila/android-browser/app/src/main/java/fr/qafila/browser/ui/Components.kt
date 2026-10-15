package fr.qafila.browser.ui

import android.graphics.Bitmap
import androidx.compose.animation.animateColorAsState
import androidx.compose.animation.core.animateDpAsState
import androidx.compose.animation.core.tween
import androidx.compose.foundation.ExperimentalFoundationApi
import androidx.compose.foundation.Image
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.combinedClickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.interaction.collectIsPressedAsState
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ColumnScope
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.RowScope
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.asPaddingValues
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.navigationBars
import androidx.compose.foundation.layout.offset
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyListScope
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.BasicTextField
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.SolidColor
import androidx.compose.ui.graphics.asImageBitmap
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.text.TextStyle
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.IntOffset
import androidx.compose.foundation.layout.imePadding
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp

/** Clic « à la iOS » : pas d'onde, l'élément pâlit pendant l'appui. */
@OptIn(ExperimentalFoundationApi::class)
@Composable
fun Modifier.pressFade(enabled: Boolean = true, onLongClick: (() -> Unit)? = null, onClick: () -> Unit): Modifier {
    val source = remember { MutableInteractionSource() }
    val pressed by source.collectIsPressedAsState()
    return this
        .alpha(if (pressed) 0.35f else 1f)
        .combinedClickable(interactionSource = source, indication = null, enabled = enabled, onLongClick = onLongClick, onClick = onClick)
}

/** Clic avec léger surlignage gris (lignes de listes). */
@OptIn(ExperimentalFoundationApi::class)
@Composable
fun Modifier.rowClick(enabled: Boolean = true, onLongClick: (() -> Unit)? = null, onClick: () -> Unit): Modifier {
    val q = LocalQ.current
    val source = remember { MutableInteractionSource() }
    val pressed by source.collectIsPressedAsState()
    return this
        .background(if (pressed) q.text.copy(alpha = 0.08f) else Color.Transparent)
        .combinedClickable(interactionSource = source, indication = null, enabled = enabled, onLongClick = onLongClick, onClick = onClick)
}

/** Bloque les touches vers ce qui est dessous (WebView). */
fun Modifier.blockTouches(): Modifier = this.pointerInput(Unit) { awaitPointerEventScope { while (true) { awaitPointerEvent() } } }

@Composable
fun Hairline(modifier: Modifier = Modifier, color: Color = LocalQ.current.separator) = Box(modifier.fillMaxWidth().height(0.5.dp).background(color))

/** Écran plein (réglages, favoris…) : fond gris groupé, en-tête « ‹ Retour   Titre   OK ». */
@Composable
fun QPage(
    title: String,
    onBack: (() -> Unit)?,
    backLabel: String = "Retour",
    trailing: (@Composable RowScope.() -> Unit)? = null,
    header: (@Composable ColumnScope.() -> Unit)? = null,
    content: LazyListScope.() -> Unit,
) {
    val q = LocalQ.current
    Column(Modifier.fillMaxSize().background(q.groupedBg).blockTouches().statusBarsPadding().imePadding()) {
        Box(Modifier.fillMaxWidth().height(48.dp).padding(horizontal = 8.dp)) {
            if (onBack != null) Row(Modifier.align(Alignment.CenterStart).pressFade(onClick = onBack).padding(horizontal = 4.dp, vertical = 10.dp), verticalAlignment = Alignment.CenterVertically) {
                QIconView(QIcon.BACK, null, q.text, 20.dp)
                Text(backLabel, color = q.text, fontSize = 16.sp, maxLines = 1)
            }
            Text(title, Modifier.align(Alignment.Center).padding(horizontal = 96.dp), color = q.text, fontSize = 16.sp, fontWeight = FontWeight.SemiBold, maxLines = 1, overflow = TextOverflow.Ellipsis)
            if (trailing != null) Row(Modifier.align(Alignment.CenterEnd), verticalAlignment = Alignment.CenterVertically, content = trailing)
        }
        header?.invoke(this)
        LazyColumn(Modifier.fillMaxSize(), contentPadding = PaddingValues(bottom = 24.dp + WindowInsets.navigationBars.asPaddingValues().calculateBottomPadding()), content = content)
    }
}

@Composable
fun TextAction(text: String, color: Color = LocalQ.current.text, bold: Boolean = true, enabled: Boolean = true, onClick: () -> Unit) =
    Text(text, Modifier.pressFade(enabled = enabled, onClick = onClick).padding(horizontal = 10.dp, vertical = 10.dp), color = if (enabled) color else color.copy(alpha = 0.3f), fontSize = 16.sp, fontWeight = if (bold) FontWeight.SemiBold else FontWeight.Normal)

@Composable
fun SectionHeader(text: String) = Text(text.uppercase(), Modifier.padding(start = 32.dp, end = 32.dp, top = 22.dp, bottom = 7.dp), color = LocalQ.current.secondary, fontSize = 12.sp, letterSpacing = 0.4.sp)

@Composable
fun SectionFooter(text: String) = Text(text, Modifier.padding(start = 32.dp, end = 32.dp, top = 7.dp), color = LocalQ.current.secondary, fontSize = 12.5.sp, lineHeight = 16.sp)

/** Carte blanche arrondie regroupant des lignes. */
@Composable
fun GroupCard(modifier: Modifier = Modifier, content: @Composable ColumnScope.() -> Unit) =
    Column(modifier.padding(horizontal = 16.dp).fillMaxWidth().clip(RoundedCornerShape(12.dp)).background(LocalQ.current.card), content = content)

@Composable
fun RowDivider(start: Dp = 16.dp) = Box(Modifier.padding(start = start).fillMaxWidth().height(0.5.dp).background(LocalQ.current.separator))

@Composable
private fun RowShell(icon: QIcon?, onClick: (() -> Unit)?, minHeight: Dp = 46.dp, content: @Composable RowScope.() -> Unit) {
    val q = LocalQ.current
    Row(
        Modifier.fillMaxWidth().heightIn(min = minHeight).then(if (onClick != null) Modifier.rowClick(onClick = onClick) else Modifier).padding(horizontal = 16.dp, vertical = 8.dp),
        verticalAlignment = Alignment.CenterVertically,
    ) {
        if (icon != null) { QIconView(icon, null, q.text, 20.dp); Spacer(Modifier.width(14.dp)) }
        content()
    }
}

@Composable
fun NavRow(title: String, value: String? = null, icon: QIcon? = null, onClick: () -> Unit) = RowShell(icon, onClick) {
    val q = LocalQ.current
    Text(title, Modifier.weight(1f), color = q.text, fontSize = 15.sp, maxLines = 1, overflow = TextOverflow.Ellipsis)
    if (value != null) Text(value, Modifier.padding(start = 8.dp), color = q.secondary, fontSize = 15.sp, maxLines = 1)
    Spacer(Modifier.width(6.dp))
    QIconView(QIcon.CHEVRON_RIGHT, null, q.tertiary, 14.dp)
}

@Composable
fun ValueRow(title: String, value: String) = RowShell(null, null) {
    val q = LocalQ.current
    Text(title, Modifier.weight(1f), color = q.text, fontSize = 15.sp)
    Text(value, color = q.secondary, fontSize = 15.sp, textAlign = TextAlign.End)
}

@Composable
fun ActionRow(title: String, color: Color = LocalQ.current.text, icon: QIcon? = null, onClick: () -> Unit) = RowShell(null, onClick) {
    Text(title, Modifier.weight(1f), color = color, fontSize = 15.sp)
    if (icon != null) QIconView(icon, null, color, 18.dp)
}

@Composable
fun ToggleRow(title: String, checked: Boolean, subtitle: String? = null, enabled: Boolean = true, icon: QIcon? = null, onChange: (Boolean) -> Unit) = RowShell(icon, if (enabled) ({ onChange(!checked) }) else null) {
    val q = LocalQ.current
    Column(Modifier.weight(1f).alpha(if (enabled) 1f else 0.4f)) {
        Text(title, color = q.text, fontSize = 15.sp)
        if (subtitle != null) Text(subtitle, color = q.secondary, fontSize = 12.5.sp, lineHeight = 16.sp)
    }
    Spacer(Modifier.width(12.dp))
    QToggle(checked, enabled) { onChange(it) }
}

@Composable
fun CheckRow(title: String, selected: Boolean, subtitle: String? = null, leading: (@Composable () -> Unit)? = null, onClick: () -> Unit) = RowShell(null, onClick) {
    val q = LocalQ.current
    if (leading != null) { leading(); Spacer(Modifier.width(12.dp)) }
    Column(Modifier.weight(1f)) {
        Text(title, color = q.text, fontSize = 15.sp)
        if (subtitle != null) Text(subtitle, color = q.secondary, fontSize = 12.5.sp, lineHeight = 16.sp)
    }
    if (selected) QIconView(QIcon.CHECK, "Sélectionné", q.accent, 18.dp)
}

/** Liste de choix à coche (style réglages iOS). */
@Composable
fun <T> ChoiceCard(values: List<T>, selected: T, label: (T) -> String, subtitle: ((T) -> String?)? = null, onSelect: (T) -> Unit) = GroupCard {
    values.forEachIndexed { i, v ->
        CheckRow(label(v), v == selected, subtitle?.invoke(v)) { onSelect(v) }
        if (i < values.lastIndex) RowDivider()
    }
}

/** Interrupteur sobre (capsule 46×28, pastille blanche). */
@Composable
fun QToggle(checked: Boolean, enabled: Boolean = true, onChange: (Boolean) -> Unit) {
    val q = LocalQ.current
    val track by animateColorAsState(if (checked) q.accent else (if (q.dark) Color(0xFF39393D) else Color(0xFFE3E3E8)), tween(180), label = "track")
    val x by animateDpAsState(if (checked) 20.dp else 2.dp, tween(180), label = "thumb")
    val thumb = if (checked && q.dark && q.accent.red > 0.9f && q.accent.green > 0.9f) Color(0xFF1C1C1E) else Color.White
    Box(Modifier.size(46.dp, 28.dp).alpha(if (enabled) 1f else 0.5f).clip(CircleShape).background(track).clickable(enabled = enabled, interactionSource = remember { MutableInteractionSource() }, indication = null) { onChange(!checked) }) {
        Box(Modifier.offset { IntOffset(x.roundToPx(), 2.dp.roundToPx()) }.size(24.dp).shadow(1.5.dp, CircleShape).background(thumb, CircleShape))
    }
}

/** Contrôle segmenté (fond gris, segment choisi en carte blanche). */
@Composable
fun Segmented(options: List<String>, selected: Int, modifier: Modifier = Modifier, onSelect: (Int) -> Unit) {
    val q = LocalQ.current
    Row(modifier.fillMaxWidth().height(34.dp).clip(RoundedCornerShape(9.dp)).background(if (q.dark) Color(0xFF2C2C2E) else Color(0xFFE6E6EB)).padding(2.dp)) {
        options.forEachIndexed { i, o ->
            val sel = i == selected
            Box(
                Modifier.weight(1f).fillMaxSize().then(if (sel) Modifier.shadow(1.dp, RoundedCornerShape(7.dp)).clip(RoundedCornerShape(7.dp)).background(if (q.dark) Color(0xFF636366) else Color.White) else Modifier)
                    .clickable(interactionSource = remember { MutableInteractionSource() }, indication = null) { onSelect(i) },
                contentAlignment = Alignment.Center,
            ) { Text(o, color = q.text, fontSize = 13.sp, fontWeight = if (sel) FontWeight.SemiBold else FontWeight.Normal, maxLines = 1) }
        }
    }
}

/** Ligne de saisie texte (adresse d'instance, modèle de recherche…). */
@Composable
fun TextFieldRow(placeholder: String, value: String, keyboard: KeyboardType = KeyboardType.Uri, onChange: (String) -> Unit) {
    val q = LocalQ.current
    Box(Modifier.fillMaxWidth().heightIn(min = 46.dp).padding(horizontal = 16.dp, vertical = 12.dp), contentAlignment = Alignment.CenterStart) {
        BasicTextField(
            value = value, onValueChange = onChange, singleLine = true, modifier = Modifier.fillMaxWidth(),
            textStyle = TextStyle(color = q.text, fontSize = 15.sp), cursorBrush = SolidColor(q.accent),
            keyboardOptions = KeyboardOptions(keyboardType = keyboard, autoCorrectEnabled = false),
            decorationBox = { inner -> if (value.isEmpty()) Text(placeholder, color = q.secondary, fontSize = 15.sp, maxLines = 1); inner() },
        )
    }
}

/** Liste de domaines avec bouton Retirer (exceptions). */
@Composable
fun HostListCard(hosts: Set<String>, empty: String, onRemove: (String) -> Unit) = GroupCard {
    val q = LocalQ.current
    if (hosts.isEmpty()) Text(empty, Modifier.padding(16.dp), color = q.secondary, fontSize = 14.sp)
    hosts.sorted().forEachIndexed { i, h ->
        Row(Modifier.fillMaxWidth().heightIn(min = 44.dp).padding(start = 16.dp, end = 8.dp), verticalAlignment = Alignment.CenterVertically) {
            Text(h, Modifier.weight(1f), color = q.text, fontSize = 15.sp, maxLines = 1, overflow = TextOverflow.Ellipsis)
            Text("Retirer", Modifier.pressFade { onRemove(h) }.padding(10.dp), color = q.destructive, fontSize = 14.sp)
        }
        if (i < hosts.size - 1) RowDivider()
    }
}

/** Pastille (temps de lecture « 19 min »). */
@Composable
fun Pill(text: String, bg: Color, fg: Color, fontSize: Float = 10.5f) =
    Text(text, Modifier.clip(RoundedCornerShape(50)).background(bg).padding(horizontal = 7.dp, vertical = 2.dp), color = fg, fontSize = fontSize.sp, fontWeight = FontWeight.SemiBold, maxLines = 1)

/** Favicon du site, ou monogramme (initiale du domaine) en attendant. */
@Composable
fun Favicon(bitmap: Bitmap?, host: String?, size: Dp, corner: Dp = size / 4.5f, private: Boolean = false, bg: Color = LocalQ.current.fill, fg: Color = LocalQ.current.secondary) {
    Box(Modifier.size(size).clip(RoundedCornerShape(corner)).background(if (bitmap != null) Color.Transparent else bg), contentAlignment = Alignment.Center) {
        when {
            private -> QIconView(QIcon.PRIVATE, null, fg, size * 0.66f)
            bitmap != null -> Image(bitmap.asImageBitmap(), null, Modifier.fillMaxSize(), contentScale = ContentScale.Fit)
            host != null -> Text(host.removePrefix("m.").take(1).uppercase(), color = fg, fontSize = (size.value * 0.5f).sp, fontWeight = FontWeight.SemiBold)
            else -> QIconView(QIcon.GLOBE, null, fg, size * 0.7f)
        }
    }
}

/** Carré arrondi au trait avec le nombre d'onglets (bouton Onglets). */
@Composable
fun TabsSquare(count: Int, size: Dp, tint: Color, stroke: Float) {
    val label = if (count > 99) "∞" else "$count"
    Box(Modifier.size(size).border((stroke * size.value / 24f).dp, tint, RoundedCornerShape(size * 0.24f)), contentAlignment = Alignment.Center) {
        Text(label, color = tint, fontSize = (if (label.length > 1) size.value * 0.42f else size.value * 0.5f).sp, fontWeight = FontWeight.Medium, maxLines = 1, lineHeight = size.value.sp)
    }
}

/** Petite carte flottante (menus contextuels de l'écran Onglets…). */
@Composable
fun FloatingCard(modifier: Modifier = Modifier, width: Dp = 250.dp, content: @Composable ColumnScope.() -> Unit) {
    val q = LocalQ.current
    Column(
        modifier.width(width).shadow(18.dp, RoundedCornerShape(18.dp), ambientColor = Color.Black.copy(alpha = 0.15f), spotColor = Color.Black.copy(alpha = 0.15f))
            .clip(RoundedCornerShape(18.dp)).background(q.menuBg).blockTouches(),
        verticalArrangement = Arrangement.Top, content = content,
    )
}

@Composable
fun MenuLine(title: String, icon: QIcon?, color: Color = LocalQ.current.text, checked: Boolean = false, onClick: () -> Unit) {
    Row(Modifier.fillMaxWidth().height(42.dp).rowClick(onClick = onClick).padding(horizontal = 16.dp), verticalAlignment = Alignment.CenterVertically) {
        if (checked) { QIconView(QIcon.CHECK, null, color, 14.dp); Spacer(Modifier.width(8.dp)) }
        Text(title, Modifier.weight(1f), color = color, fontSize = 15.sp, maxLines = 1, overflow = TextOverflow.Ellipsis)
        if (icon != null) QIconView(icon, null, color, 17.dp)
    }
}
