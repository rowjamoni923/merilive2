package com.merilive.app.plugin

import android.app.Activity
import android.os.Build
import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin

/**
 * Pkg210 — Android 14+ screen-capture detection.
 * Registers Activity.ScreenCaptureCallback so the system tells us when a
 * screenshot is taken (recording is already blocked by FLAG_SECURE).
 * Emits "screenshot-detected" event to JS; UI shows a warning + logs to DB.
 */
@CapacitorPlugin(name = "ScreenCaptureDetector")
class ScreenCaptureDetectorPlugin : Plugin() {

    private var callback: Activity.ScreenCaptureCallback? = null
    private var registered = false

    @PluginMethod
    fun start(call: PluginCall) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
            val ret = JSObject(); ret.put("supported", false); call.resolve(ret); return
        }
        val act = activity ?: run { call.reject("no_activity"); return }
        act.runOnUiThread {
            try {
                if (!registered) {
                    val cb = Activity.ScreenCaptureCallback {
                        val ev = JSObject()
                        ev.put("at", System.currentTimeMillis())
                        notifyListeners("screenshot-detected", ev)
                    }
                    callback = cb
                    act.registerScreenCaptureCallback(act.mainExecutor, cb)
                    registered = true
                }
                val ret = JSObject(); ret.put("supported", true); ret.put("active", true); call.resolve(ret)
            } catch (e: Exception) {
                call.reject("register_failed", e)
            }
        }
    }

    @PluginMethod
    fun stop(call: PluginCall) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
            call.resolve(); return
        }
        val act = activity ?: run { call.resolve(); return }
        act.runOnUiThread {
            try {
                if (registered && callback != null) {
                    act.unregisterScreenCaptureCallback(callback!!)
                    registered = false
                    callback = null
                }
            } catch (_: Exception) {}
            call.resolve()
        }
    }

    override fun handleOnDestroy() {
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE
                && registered && callback != null) {
                activity?.unregisterScreenCaptureCallback(callback!!)
            }
        } catch (_: Exception) {}
        registered = false
        callback = null
    }
}
