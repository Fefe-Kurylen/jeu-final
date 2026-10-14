package fr.furtif.browser

import android.content.Intent
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.activity.viewModels
import fr.furtif.browser.data.BrowserStore
import fr.furtif.browser.ui.BrowserScreen
import fr.furtif.browser.ui.FurtifTheme

class MainActivity : ComponentActivity() {
    private val store: BrowserStore by viewModels()

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        if (savedInstanceState == null) store.handleIntent(intent)
        setContent { FurtifTheme(store) { BrowserScreen(store) } }
    }

    override fun onNewIntent(intent: Intent) { super.onNewIntent(intent); store.handleIntent(intent) }
}
