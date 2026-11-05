package it.patentec.quiz

import android.Manifest
import android.annotation.SuppressLint
import android.app.Activity
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Bundle
import android.os.PowerManager
import android.provider.Settings
import android.webkit.JavascriptInterface
import android.webkit.WebChromeClient
import android.webkit.WebResourceRequest
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient

/** Enveloppe native de l'appli web : même appli, mais le micro et la voix passent par un service au premier plan,
 *  ce qui permet d'écouter écran verrouillé. */
class MainActivity : Activity() {
    companion object {
        const val URL = "https://maxmcneil.github.io/Patente-C-app/"
        @Volatile var web: WebView? = null
    }

    @SuppressLint("SetJavaScriptEnabled")
    override fun onCreate(b: Bundle?) {
        super.onCreate(b)
        val w = WebView(this)
        web = w
        setContentView(w)
        w.settings.javaScriptEnabled = true
        w.settings.domStorageEnabled = true
        w.settings.databaseEnabled = true
        w.settings.mediaPlaybackRequiresUserGesture = false
        w.settings.cacheMode = WebSettings.LOAD_DEFAULT
        w.addJavascriptInterface(Bridge(applicationContext), "NativeVoice")
        w.webChromeClient = WebChromeClient()
        w.webViewClient = object : WebViewClient() {
            override fun shouldOverrideUrlLoading(v: WebView, r: WebResourceRequest): Boolean {
                if (r.url.host == "maxmcneil.github.io") return false
                try { startActivity(Intent(Intent.ACTION_VIEW, r.url)) } catch (_: Exception) {}
                return true
            }
        }
        askPermissions()
        if (b == null) w.loadUrl(URL) else w.restoreState(b)
    }

    override fun onSaveInstanceState(o: Bundle) {
        super.onSaveInstanceState(o)
        web?.saveState(o)
    }

    private fun askPermissions() {
        requestPermissions(arrayOf(Manifest.permission.RECORD_AUDIO, "android.permission.POST_NOTIFICATIONS"), 1)
        // Sans cette exemption, Android peut couper l'écoute quand l'écran est éteint (économie de batterie).
        try {
            val pm = getSystemService(Context.POWER_SERVICE) as PowerManager
            val p = getSharedPreferences("p", 0)
            if (!pm.isIgnoringBatteryOptimizations(packageName) && !p.getBoolean("batAsked", false)) {
                p.edit().putBoolean("batAsked", true).apply()
                startActivity(Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS, Uri.parse("package:$packageName")))
            }
        } catch (_: Exception) {}
    }

    @Deprecated("Deprecated in Java")
    override fun onBackPressed() {
        val w = web
        if (w != null && w.canGoBack()) w.goBack() else moveTaskToBack(true)   // on ne quitte pas : l'écoute continue
    }

    override fun onDestroy() {
        if (isFinishing) { VoiceService.cmd(applicationContext, "stop", null, null); web = null }
        super.onDestroy()
    }
}

/** Pont JavaScript : window.NativeVoice dans l'appli web. */
class Bridge(private val ctx: Context) {
    @JavascriptInterface fun listen(lang: String) { VoiceService.cmd(ctx, "listen", lang, null) }
    @JavascriptInterface fun listenGrace(lang: String, graceMs: Int) { VoiceService.cmd(ctx, "listen", lang, graceMs.toString()) }
    @JavascriptInterface fun speak(text: String, lang: String) { VoiceService.cmd(ctx, "speak", lang, text) }
    @JavascriptInterface fun stop() { VoiceService.cmd(ctx, "stop", null, null) }
    @JavascriptInterface fun version(): String = "1"
}
