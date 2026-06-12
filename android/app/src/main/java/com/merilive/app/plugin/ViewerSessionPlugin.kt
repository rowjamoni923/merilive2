package com.merilive.app.plugin

import android.content.Context
import android.content.Intent
import android.os.Build
import android.util.Log
import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin
import com.merilive.app.service.MediaPlaybackForegroundService

/**
 * Pkg-bgcontinuity — ViewerSession bridge.
 *
 * Starts / stops MediaPlaybackForegroundService from JS so a viewer
 * (live audience, party room listener, non-publishing party member)
 * keeps audio + LiveKit subscriber connection running when the app
 * is minimized or the screen turns off.
 *
 * Hosts MUST NOT call this — CallForegroundService (camera + mic FGS)
 * already covers the publisher path.
 *
 * API:
 *   ViewerSession.start({ kind: 'live' | 'party', title?, subtitle? })
 *   ViewerSession.stop()
 */
@CapacitorPlugin(name = "ViewerSession")
class ViewerSessionPlugin : Plugin() {

    companion object {
        private const val TAG = "ViewerSessionPlugin"

        @JvmStatic
        fun stopFromContext(ctx: Context) {
            try {
                val intent = Intent(ctx, MediaPlaybackForegroundService::class.java).apply {
                    action = MediaPlaybackForegroundService.ACTION_STOP
                }
                ctx.startService(intent)
            } catch (t: Throwable) {
                Log.w(TAG, "stopFromContext failed: ${t.message}")
            }
        }
    }

    @PluginMethod
    fun start(call: PluginCall) {
        val kind = call.getString("kind", "live") ?: "live"
        val title = call.getString("title")
        val subtitle = call.getString("subtitle")
        try {
            val ctx = context ?: return call.reject("no-context")
            val intent = Intent(ctx, MediaPlaybackForegroundService::class.java).apply {
                action = MediaPlaybackForegroundService.ACTION_START
                putExtra(MediaPlaybackForegroundService.EXTRA_KIND, kind)
                if (!title.isNullOrEmpty()) putExtra(MediaPlaybackForegroundService.EXTRA_TITLE, title)
                if (!subtitle.isNullOrEmpty()) putExtra(MediaPlaybackForegroundService.EXTRA_SUBTITLE, subtitle)
            }
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                ctx.startForegroundService(intent)
            } else {
                ctx.startService(intent)
            }
            val ret = JSObject().apply { put("ok", true) }
            call.resolve(ret)
        } catch (t: Throwable) {
            Log.w(TAG, "start failed: ${t.message}")
            call.reject(t.message ?: "start-failed")
        }
    }

    @PluginMethod
    fun stop(call: PluginCall) {
        try {
            stopFromContext(context)
            val ret = JSObject().apply { put("ok", true) }
            call.resolve(ret)
        } catch (t: Throwable) {
            Log.w(TAG, "stop failed: ${t.message}")
            call.reject(t.message ?: "stop-failed")
        }
    }
}
