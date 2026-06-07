package com.merilive.app.plugin

import android.app.PictureInPictureParams
import android.content.pm.PackageManager
import android.content.res.Configuration
import android.os.Build
import android.util.Rational
import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin

/**
 * Pkg442 — General-purpose Picture-in-Picture plugin.
 *
 * Use cases beyond live-stream host (LiveKitPlugin already handles host PiP):
 *   • Viewer watching a stream → home button → keeps watching in floating window
 *   • Private video call → minimize while replying to message
 *   • Reels playback continuity
 *
 * Methods:
 *   • isSupported() → { supported }
 *   • enter({aspectX, aspectY}) → { entered }
 *   • setParams({aspectX, aspectY}) → updates aspect for active PiP
 *
 * Events:
 *   • pipModeChanged → { isInPip }
 */
@CapacitorPlugin(name = "PictureInPicture")
class PictureInPicturePlugin : Plugin() {

    companion object {
        private var INSTANCE: PictureInPicturePlugin? = null
        @JvmStatic
        fun notifyModeChanged(isInPip: Boolean) {
            INSTANCE?.let {
                val data = JSObject()
                data.put("isInPip", isInPip)
                it.notifyListeners("pipModeChanged", data)
            }
        }
    }

    override fun load() {
        super.load()
        INSTANCE = this
    }

    override fun handleOnDestroy() {
        if (INSTANCE === this) INSTANCE = null
        super.handleOnDestroy()
    }

    @PluginMethod
    fun isSupported(call: PluginCall) {
        val ret = JSObject()
        ret.put("supported", isPipAvailable())
        call.resolve(ret)
    }

    @PluginMethod
    fun enter(call: PluginCall) {
        if (!isPipAvailable()) {
            val ret = JSObject(); ret.put("entered", false); ret.put("reason", "unsupported")
            call.resolve(ret); return
        }
        val act = activity
        if (act == null) { call.reject("no_activity"); return }
        // Pkg-audit Tier-13: enterPictureInPictureMode throws IllegalStateException
        // if the activity is finishing or already destroyed (rapid rotation /
        // back-press race). Guard explicitly so the call returns a clean
        // {entered:false} instead of rejecting with a confusing stack.
        if (act.isFinishing || act.isDestroyed) {
            val ret = JSObject(); ret.put("entered", false); ret.put("reason", "activity_unavailable")
            call.resolve(ret); return
        }
        val ax = clampRatio(call.getInt("aspectX", 16) ?: 16)
        val ay = clampRatio(call.getInt("aspectY", 9) ?: 9)
        try {
            val ok = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                val params = PictureInPictureParams.Builder()
                    .setAspectRatio(Rational(ax, ay))
                    .build()
                act.enterPictureInPictureMode(params)
            } else {
                @Suppress("DEPRECATION")
                act.enterPictureInPictureMode(); true
            }
            val ret = JSObject(); ret.put("entered", ok)
            call.resolve(ret)
        } catch (t: Throwable) {
            call.reject("enter_failed: ${t.message}", t)
        }
    }

    @PluginMethod
    fun setParams(call: PluginCall) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) { call.resolve(); return }
        val act = activity ?: run { call.reject("no_activity"); return }
        val ax = clampRatio(call.getInt("aspectX", 16) ?: 16)
        val ay = clampRatio(call.getInt("aspectY", 9) ?: 9)
        try {
            act.setPictureInPictureParams(
                PictureInPictureParams.Builder().setAspectRatio(Rational(ax, ay)).build()
            )
            call.resolve()
        } catch (t: Throwable) {
            call.reject("setParams_failed: ${t.message}", t)
        }
    }

    private fun isPipAvailable(): Boolean {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.N) return false
        return try {
            context.packageManager.hasSystemFeature(PackageManager.FEATURE_PICTURE_IN_PICTURE)
        } catch (_: Throwable) { false }
    }

    // PiP aspect ratio must be between ~2.39:1 and 1:2.39 per Android docs.
    private fun clampRatio(v: Int): Int = v.coerceIn(1, 239)
}
