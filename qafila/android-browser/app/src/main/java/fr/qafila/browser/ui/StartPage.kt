package fr.qafila.browser.ui

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.ExperimentalLayoutApi
import androidx.compose.foundation.layout.FlowRow
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import fr.qafila.browser.data.BrowserStore
import fr.qafila.browser.data.BrowserTab

/** Page de démarrage (DESIGN.md §5) : « Qafila » en serif, « قافلة » dessous en gris, puis les favoris en tuiles. */
@OptIn(ExperimentalLayoutApi::class)
@Composable
fun StartPage(store: BrowserStore, tab: BrowserTab, modifier: Modifier = Modifier) {
    val state by store.state.collectAsState()
    val icons by store.tabManager.favicons.icons.collectAsState()
    val q = LocalQ.current
    val bookmarks = state.bookmarks.take(12)
    LaunchedEffect(bookmarks.size) { bookmarks.forEach { store.tabManager.favicons.request(it.url, persist = true) } }
    BoxWithConstraints(modifier.fillMaxSize().background(q.page)) {
        Column(Modifier.fillMaxWidth().verticalScroll(rememberScrollState()).heightIn(min = maxHeight).padding(horizontal = 24.dp), horizontalAlignment = Alignment.CenterHorizontally, verticalArrangement = Arrangement.Center) {
            Spacer(Modifier.height(48.dp))
            Text("Qafila", color = q.text, fontSize = 46.sp, fontFamily = FontFamily.Serif, letterSpacing = (-1).sp)
            Text("قافلة", color = q.secondary, fontSize = 24.sp, fontFamily = FontFamily.Serif, fontWeight = FontWeight.Medium)
            if (tab.isPrivate) {
                Spacer(Modifier.height(18.dp))
                Text("Navigation privée : ni historique, ni cache, ni onglet conservé.", color = q.secondary, fontSize = 13.sp, textAlign = TextAlign.Center)
            }
            Spacer(Modifier.height(36.dp))
            if (bookmarks.isEmpty()) Text("Touchez l'adresse pour commencer.", color = q.secondary, fontSize = 13.sp)
            else FlowRow(Modifier.fillMaxWidth(), horizontalArrangement = Arrangement.Center, verticalArrangement = Arrangement.spacedBy(18.dp), maxItemsInEachRow = 4) {
                bookmarks.forEach { b ->
                    Column(Modifier.width(76.dp).pressFade { store.navigate(b.url) }, horizontalAlignment = Alignment.CenterHorizontally) {
                        Box(Modifier.background(q.groupedBg, androidx.compose.foundation.shape.RoundedCornerShape(14.dp)).padding(12.dp)) {
                            Favicon(icons[store.tabManager.favicons.keyOf(b.url)], store.hostOf(b.url), 28.dp, corner = 7.dp)
                        }
                        Spacer(Modifier.height(6.dp))
                        Text(b.title, color = q.text, fontSize = 11.sp, maxLines = 1, overflow = TextOverflow.Ellipsis, textAlign = TextAlign.Center)
                    }
                }
            }
            Spacer(Modifier.height(48.dp))
        }
    }
}
