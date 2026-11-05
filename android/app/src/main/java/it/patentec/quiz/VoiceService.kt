package it.patentec.quiz

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.media.AudioManager
import android.os.Bundle
import android.os.Handler
import android.os.IBinder
import android.os.Looper
import android.os.PowerManager
import android.speech.RecognitionListener
import android.speech.RecognizerIntent
import android.speech.SpeechRecognizer
import android.speech.tts.TextToSpeech
import android.speech.tts.UtteranceProgressListener
import org.json.JSONObject
import java.util.Locale

/** Service au premier plan (notification permanente) : garde le micro et la voix actifs écran verrouillé.
 *  L'appli web décide de tout (questions, réponses) ; ici on ne fait qu'écouter et parler. */
class VoiceService : Service(), RecognitionListener, TextToSpeech.OnInitListener {
    companion object {
        @Volatile var inst: VoiceService? = null

        /** what = listen | speak | stop */
        fun cmd(ctx: Context, what: String, lang: String?, text: String?) {
            val s = inst
            if (s != null) { s.h.post { s.handle(what, lang, text) }; return }
            if (what == "stop") return
            try {
                ctx.startForegroundService(Intent(ctx, VoiceService::class.java)
                    .putExtra("w", what).putExtra("l", lang).putExtra("t", text))
            } catch (e: Exception) {
                js("window.__nv&&window.__nv.heard&&window.__nv.heard(null,'service')")
            }
        }

        fun js(code: String) {
            val w = MainActivity.web ?: return
            w.post { try { w.evaluateJavascript(code, null) } catch (_: Exception) {} }
        }
    }

    val h = Handler(Looper.getMainLooper())
    private var sr: SpeechRecognizer? = null
    private var tts: TextToSpeech? = null
    private var ttsReady = false
    private var pending: Pair<String, String>? = null
    private var wake: PowerManager.WakeLock? = null
    private var muted = false

    override fun onBind(i: Intent?): IBinder? = null

    override fun onCreate() {
        super.onCreate()
        inst = this
        try {
            val pm = getSystemService(Context.POWER_SERVICE) as PowerManager
            wake = pm.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "patente:voice").also { it.acquire() }
        } catch (_: Exception) {}
        tts = TextToSpeech(this, this)
    }

    override fun onInit(status: Int) {
        ttsReady = status == TextToSpeech.SUCCESS
        tts?.setOnUtteranceProgressListener(object : UtteranceProgressListener() {
            override fun onStart(id: String?) {}
            override fun onDone(id: String?) { js("window.__nv&&window.__nv.spoken&&window.__nv.spoken()") }
            @Deprecated("Deprecated in Java")
            override fun onError(id: String?) { js("window.__nv&&window.__nv.spoken&&window.__nv.spoken()") }
        })
        val p = pending
        if (ttsReady && p != null) { pending = null; speak(p.first, p.second) }
    }

    override fun onStartCommand(i: Intent?, f: Int, id: Int): Int {
        if (i?.action == "STOP") {
            js("window.__nv&&window.__nv.stopped&&window.__nv.stopped()")
            shutdown(); return START_NOT_STICKY
        }
        val nm = getSystemService(NotificationManager::class.java)
        nm.createNotificationChannel(NotificationChannel("v", "Écoute", NotificationManager.IMPORTANCE_LOW))
        val open = PendingIntent.getActivity(this, 0, Intent(this, MainActivity::class.java), PendingIntent.FLAG_IMMUTABLE)
        val stop = PendingIntent.getService(this, 1, Intent(this, VoiceService::class.java).setAction("STOP"), PendingIntent.FLAG_IMMUTABLE)
        @Suppress("DEPRECATION")
        val n = Notification.Builder(this, "v").setSmallIcon(android.R.drawable.ic_btn_speak_now)
            .setContentTitle("Patente C : écoute active").setContentText("Touche pour ouvrir. « stop » ou le bouton arrête.")
            .setContentIntent(open).addAction(0, "Arrêter", stop).setOngoing(true).build()
        try { startForeground(1, n, ServiceInfo.FOREGROUND_SERVICE_TYPE_MICROPHONE) } catch (e: Exception) {
            js("window.__nv&&window.__nv.heard&&window.__nv.heard(null,'not-allowed')")
            stopSelf(); return START_NOT_STICKY
        }
        val w = i?.getStringExtra("w")
        val l = i?.getStringExtra("l")
        val t = i?.getStringExtra("t")
        if (w != null) h.post { handle(w, l, t) }
        return START_NOT_STICKY
    }

    fun handle(what: String, lang: String?, text: String?) {
        when (what) {
            "listen" -> listen(lang ?: "it-IT")
            "speak" -> speak(text ?: "", lang ?: "it-IT")
            "stop" -> shutdown()
        }
    }

    // Le bip de début d'écoute est coupé pendant l'écoute et rétabli avant de parler.
    private fun muteBeep(on: Boolean) {
        if (muted == on) return
        muted = on
        val am = getSystemService(AudioManager::class.java)
        val d = if (on) AudioManager.ADJUST_MUTE else AudioManager.ADJUST_UNMUTE
        for (st in intArrayOf(AudioManager.STREAM_MUSIC, AudioManager.STREAM_NOTIFICATION, AudioManager.STREAM_SYSTEM))
            try { am.adjustStreamVolume(st, d, 0) } catch (_: Exception) {}
    }

    private fun listen(lang: String) {
        try { tts?.stop() } catch (_: Exception) {}
        muteBeep(true)
        if (sr == null) {
            if (!SpeechRecognizer.isRecognitionAvailable(this)) {
                js("window.__nv&&window.__nv.heard&&window.__nv.heard(null,'service-not-allowed')"); return
            }
            sr = SpeechRecognizer.createSpeechRecognizer(this).also { it.setRecognitionListener(this) }
        }
        try {
            sr!!.startListening(Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH)
                .putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM)
                .putExtra(RecognizerIntent.EXTRA_LANGUAGE, lang)
                .putExtra(RecognizerIntent.EXTRA_MAX_RESULTS, 1)
                .putExtra(RecognizerIntent.EXTRA_SPEECH_INPUT_COMPLETE_SILENCE_LENGTH_MILLIS, 1800L)
                .putExtra(RecognizerIntent.EXTRA_SPEECH_INPUT_POSSIBLY_COMPLETE_SILENCE_LENGTH_MILLIS, 1500L))
        } catch (e: Exception) {
            js("window.__nv&&window.__nv.heard&&window.__nv.heard(null,'start')")
        }
    }

    private fun speak(text: String, lang: String) {
        try { sr?.cancel() } catch (_: Exception) {}
        muteBeep(false)
        val t = tts
        if (t == null || !ttsReady) { pending = Pair(text, lang); return }
        if (text.isBlank()) { js("window.__nv&&window.__nv.spoken&&window.__nv.spoken()"); return }
        try { t.language = Locale.forLanguageTag(lang) } catch (_: Exception) {}
        t.speak(text.take(3500), TextToSpeech.QUEUE_FLUSH, null, "u" + System.nanoTime())
    }

    private fun send(text: String?, err: String) {
        val t = if (text == null) "null" else JSONObject.quote(text)
        js("window.__nv&&window.__nv.heard&&window.__nv.heard($t,'$err')")
    }

    override fun onResults(b: Bundle?) {
        val s = b?.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION)?.firstOrNull()
        send(if (s.isNullOrBlank()) null else s, "")
    }

    override fun onError(e: Int) {
        val code = when (e) {
            SpeechRecognizer.ERROR_INSUFFICIENT_PERMISSIONS -> "not-allowed"
            SpeechRecognizer.ERROR_NO_MATCH, SpeechRecognizer.ERROR_SPEECH_TIMEOUT -> "no-speech"
            SpeechRecognizer.ERROR_NETWORK, SpeechRecognizer.ERROR_NETWORK_TIMEOUT, SpeechRecognizer.ERROR_SERVER -> "network"
            SpeechRecognizer.ERROR_RECOGNIZER_BUSY -> "aborted"
            SpeechRecognizer.ERROR_AUDIO -> "audio-capture"
            else -> "error"
        }
        if (e == SpeechRecognizer.ERROR_RECOGNIZER_BUSY) try { sr?.cancel() } catch (_: Exception) {}
        send(null, code)
    }

    override fun onReadyForSpeech(p: Bundle?) {}
    override fun onBeginningOfSpeech() {}
    override fun onRmsChanged(r: Float) {}
    override fun onBufferReceived(b: ByteArray?) {}
    override fun onEndOfSpeech() {}
    override fun onPartialResults(b: Bundle?) {}
    override fun onEvent(t: Int, b: Bundle?) {}

    private fun shutdown() {
        muteBeep(false)
        try { sr?.cancel() } catch (_: Exception) {}
        try { tts?.stop() } catch (_: Exception) {}
        stopForeground(STOP_FOREGROUND_REMOVE)
        stopSelf()
    }

    override fun onDestroy() {
        muteBeep(false)
        inst = null
        try { sr?.destroy() } catch (_: Exception) {}
        try { tts?.shutdown() } catch (_: Exception) {}
        try { wake?.let { if (it.isHeld) it.release() } } catch (_: Exception) {}
        super.onDestroy()
    }
}
