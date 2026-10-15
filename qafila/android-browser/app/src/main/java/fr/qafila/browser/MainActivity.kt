package fr.qafila.browser

import android.content.Intent
import android.graphics.Color
import android.os.Build
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.SystemBarStyle
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.activity.viewModels
import fr.qafila.browser.data.BrowserStore
import fr.qafila.browser.ui.BrowserScreen
import fr.qafila.browser.ui.QafilaTheme

class MainActivity : ComponentActivity() {
    private val store: BrowserStore by viewModels()

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        // Barres système transparentes : la barre Qafila (ou la couleur du site) se prolonge dessous.
        enableEdgeToEdge(
            statusBarStyle = SystemBarStyle.auto(Color.TRANSPARENT, Color.TRANSPARENT),
            navigationBarStyle = SystemBarStyle.auto(Color.TRANSPARENT, Color.TRANSPARENT),
        )
        if (Build.VERSION.SDK_INT >= 29) window.isNavigationBarContrastEnforced = false
        if (savedInstanceState == null) {
            intent?.getStringExtra("demo")?.let { store.applyDemo(it) } ?: store.handleIntent(intent)
        }
        setContent { QafilaTheme(store) { BrowserScreen(store) } }
    }

    override fun onNewIntent(intent: Intent) { super.onNewIntent(intent); store.handleIntent(intent) }
}
