package com.merilive.app.plugin

import android.content.Context
import android.media.AudioAttributes
import android.media.AudioFocusRequest
import android.media.AudioManager
import android.media.MediaPlayer
import android.net.Uri
import android.os.Build
import android.util.Log
import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin
import java.io.File

/**
 * Pkg-BGM — In-app background music mixer for hosts of Live / Party / Video-Party.
 *
 * Chamet/Bigo-parity behaviour:
 *   - Uses USAGE_MEDIA + CONTENT_TYPE_MUSIC so other apps (Spotify, YouTube)
 *     can KEEP PLAYING (ducked) instead of being killed.
 *   - Uses AUDIOFOCUS_GAIN_TRANSIENT_MAY_DUCK — coexists with other apps.
 *   - Does NOT touch AudioManager.mode (LiveKit owns MODE_IN_COMMUNICATION).
 *   - Playback goes through the speaker/headset directly. Because the host's
 *     mic (LiveKit) picks up room ambient audio via acoustic feedback loop
 *     on speaker mode, viewers hear the music too — same trick Chamet uses
 *     ("phone speaker → phone mic" bridge, no software mixing required).
 *
 * API:
 *   play({ path | url, loop, volume })    → { playing:true, durationMs }
 *   pause() / resume() / stop()
 *   setVolume({ volume: 0..1 })
 *   isPlaying() → { playing }
 *
 * Events:
 *   completed  — non-looping playback finished
 *   error      — playback error, includes { message }
 */
@CapacitorPlugin(name = "NativeBgmMixer")
class NativeBgmMixerPlugin : Plugin() {

    private var player: MediaPlayer? = null
    private var focusReq: AudioFocusRequest? = null
    private var am: AudioManager? = null
    private var looping = false
    private var currentVolume = 0.8f

    override fun load() {
        super.load()
        am = context.getSystemService(Context.AUDIO_SERVICE) as? AudioManager
    }

    private fun requestFocus(): Boolean {
        val mgr = am ?: return false
        return try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                val attrs = AudioAttributes.Builder()
                    .setUsage(AudioAttributes.USAGE_MEDIA)
                    .setContentType(AudioAttributes.CONTENT_TYPE_MUSIC)
                    .build()
                val req = AudioFocusRequest.Builder(AudioManager.AUDIOFOCUS_GAIN_TRANSIENT_MAY_DUCK)
                    .setAudioAttributes(attrs)
                    .setWillPauseWhenDucked(false)
                    .setOnAudioFocusChangeListener { /* coexist — do not pause */ }
                    .build()
                focusReq = req
                mgr.requestAudioFocus(req) == AudioManager.AUDIOFOCUS_REQUEST_GRANTED
            } else {
                @Suppress("DEPRECATION")
                mgr.requestAudioFocus(
                    null,
                    AudioManager.STREAM_MUSIC,
                    AudioManager.AUDIOFOCUS_GAIN_TRANSIENT_MAY_DUCK
                ) == AudioManager.AUDIOFOCUS_REQUEST_GRANTED
            }
        } catch (t: Throwable) {
            Log.w(TAG, "requestFocus: ${t.message}")
            false
        }
    }

    private fun abandonFocus() {
        val mgr = am ?: return
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                focusReq?.let { mgr.abandonAudioFocusRequest(it) }
                focusReq = null
            }
        } catch (_: Throwable) {}
    }

    private fun releasePlayer() {
        try { player?.stop() } catch (_: Throwable) {}
        try { player?.release() } catch (_: Throwable) {}
        player = null
    }

    @PluginMethod
    fun play(call: PluginCall) {
        val url = call.getString("url")
        val path = call.getString("path")
        looping = call.getBoolean("loop", true) == true
        currentVolume = (call.getFloat("volume") ?: 0.8f).coerceIn(0f, 1f)

        if (url.isNullOrBlank() && path.isNullOrBlank()) {
            call.reject("path or url required"); return
        }

        activity.runOnUiThread {
            try {
                releasePlayer()
                val mp = MediaPlayer()
                mp.setAudioAttributes(
                    AudioAttributes.Builder()
                        .setUsage(AudioAttributes.USAGE_MEDIA)
                        .setContentType(AudioAttributes.CONTENT_TYPE_MUSIC)
                        .build()
                )
                when {
                    !url.isNullOrBlank() -> mp.setDataSource(context, Uri.parse(url))
                    !path.isNullOrBlank() -> {
                        val f = File(path!!)
                        if (f.exists()) mp.setDataSource(f.absolutePath)
                        else mp.setDataSource(context, Uri.parse(path))
                    }
                }
                mp.isLooping = looping
                mp.setVolume(currentVolume, currentVolume)
                mp.setOnPreparedListener {
                    requestFocus()
                    try { it.start() } catch (_: Throwable) {}
                    val ret = JSObject()
                    ret.put("playing", true)
                    ret.put("durationMs", it.duration)
                    call.resolve(ret)
                }
                mp.setOnCompletionListener {
                    if (!looping) {
                        abandonFocus()
                        notifyListeners("completed", JSObject())
                    }
                }
                mp.setOnErrorListener { _, what, extra ->
                    val err = JSObject()
                    err.put("message", "MediaPlayer error what=$what extra=$extra")
                    notifyListeners("error", err)
                    abandonFocus()
                    releasePlayer()
                    true
                }
                mp.prepareAsync()
                player = mp
            } catch (t: Throwable) {
                Log.e(TAG, "play failed", t)
                abandonFocus()
                releasePlayer()
                call.reject("play failed: ${t.message}", t)
            }
        }
    }

    @PluginMethod
    fun pause(call: PluginCall) {
        try { player?.pause() } catch (_: Throwable) {}
        call.resolve()
    }

    @PluginMethod
    fun resume(call: PluginCall) {
        try {
            requestFocus()
            player?.start()
        } catch (_: Throwable) {}
        call.resolve()
    }

    @PluginMethod
    fun stop(call: PluginCall) {
        activity.runOnUiThread {
            releasePlayer()
            abandonFocus()
            call.resolve()
        }
    }

    @PluginMethod
    fun setVolume(call: PluginCall) {
        val v = (call.getFloat("volume") ?: currentVolume).coerceIn(0f, 1f)
        currentVolume = v
        try { player?.setVolume(v, v) } catch (_: Throwable) {}
        call.resolve()
    }

    @PluginMethod
    fun isPlaying(call: PluginCall) {
        val ret = JSObject()
        ret.put("playing", try { player?.isPlaying == true } catch (_: Throwable) { false })
        call.resolve(ret)
    }

    override fun handleOnDestroy() {
        releasePlayer()
        abandonFocus()
        super.handleOnDestroy()
    }

    companion object { private const val TAG = "NativeBgmMixer" }
}
