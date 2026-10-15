package fr.qafila.browser

import android.content.Intent
import android.os.Bundle
import androidx.activity.ComponentActivity
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
        enableEdgeToEdge()
        if (savedInstanceState == null) {
            intent?.getStringExtra("demo")?.let { store.applyDemo(it) } ?: store.handleIntent(intent)
        }
        setContent { QafilaTheme(store) { BrowserScreen(store) } }
    }

    override fun onNewIntent(intent: Intent) { super.onNewIntent(intent); store.handleIntent(intent) }
}
