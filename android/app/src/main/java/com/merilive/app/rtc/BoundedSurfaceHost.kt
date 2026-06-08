package com.merilive.app.rtc

import android.content.Context
import android.util.Log
import android.view.View
import android.view.ViewGroup
import android.webkit.WebView
import android.widget.FrameLayout
import io.livekit.android.renderer.TextureViewRenderer
import io.livekit.android.room.Room
import io.livekit.android.room.track.Track
import io.livekit.android.room.track.VideoTrack
import org.webrtc.EglBase
import java.util.concurrent.ConcurrentHashMap
import kotlin.math.roundToInt

/**
 * Phase 1C — Bounded surface host for `<NativeVideoView />` React
 * components.
 *
 * Mounts [TextureViewRenderer]s at JS-reported CSS-pixel bounds inside
 * the same FrameLayout that hosts the WebView, **behind** the WebView
 * (so the existing transparent-WebView z-stack still works). Each
 * surface is addressed by a JS-allocated string viewId.
 *
 * This host owns NO Room / Camera2 / mic state. It defers the actual
 * track ↔ renderer wiring to [SurfaceLifecycleManager]. The plugin is
 * expected to ensure the host runs on the main thread and to pass in
 * the current [Room] for track lookup.
 */
object BoundedSurfaceHost {
    private const val TAG = "BoundedSurfaceHost"

    private data class Entry(
        val viewId: String,
        val renderer: TextureViewRenderer,
        var kind: String,            // "local" | "remote"
        var sid: String?,            // remote video-track sid (null for local)
    )

    private val entries = ConcurrentHashMap<String, Entry>()

    /**
     * Ensure a renderer exists for [viewId], position it at the given
     * CSS-pixel bounds, bind it to the appropriate VideoTrack, and mount
     * it behind the WebView. Idempotent.
     *
     * @return true when the renderer is mounted and bound to a track.
     */
    fun attach(
        context: Context,
        webView: WebView,
        eglBase: EglBase,
        room: Room?,
        viewId: String,
        kind: String,
        sid: String?,
        x: Float, y: Float, width: Float, height: Float,
        mirror: Boolean = false,
        cssPxPerDp: Float = context.resources.displayMetrics.density,
    ): Boolean {
        val root = (webView.parent as? ViewGroup) ?: run {
            Log.w(TAG, "attach($viewId): no WebView parent — host not ready")
            return false
        }

        val entry = entries[viewId] ?: Entry(
            viewId = viewId,
            renderer = TextureViewRenderer(context).also {
                try { it.init(eglBase.eglBaseContext, null) } catch (_: Exception) {}
                it.setEnableHardwareScaler(true)
                it.setScalingType(org.webrtc.RendererCommon.ScalingType.SCALE_ASPECT_FILL)
                it.setMirror(mirror)
            },
            kind = kind,
            sid = sid,
        ).also { entries[viewId] = it }

        // Locate the requested track on the current Room.
        val track: VideoTrack? = when (kind) {
            "local" -> room?.localParticipant?.getTrackPublication(Track.Source.CAMERA)?.track as? VideoTrack
            "remote" -> {
                val targetSid = sid
                if (targetSid == null) null
                else room?.remoteParticipants?.values
                    ?.firstOrNull { p -> p.sid.value == targetSid || p.videoTrackPublications.any { it.first.sid == targetSid } }
                    ?.getTrackPublication(Track.Source.CAMERA)?.track as? VideoTrack
            }
            else -> null
        }

        // Rebind track only if it changed.
        if (track != null) {
            try { track.addRenderer(entry.renderer) } catch (e: Exception) {
                Log.w(TAG, "addRenderer($viewId) failed: ${e.message}")
            }
        } else {
            Log.w(TAG, "attach($viewId): no VideoTrack for kind=$kind sid=$sid yet — will mount empty")
        }
        entry.kind = kind
        entry.sid = sid

        // Mount behind WebView (index 0 of root).
        val r = entry.renderer
        val currentParent = r.parent as? ViewGroup
        if (currentParent !== root) {
            try { currentParent?.removeView(r) } catch (_: Exception) {}
            try { root.addView(r, 0, FrameLayout.LayoutParams(0, 0)) } catch (e: Exception) {
                Log.w(TAG, "addView($viewId) failed: ${e.message}")
                return false
            }
            // Make sure WebView itself is transparent so the renderer shows through.
            try {
                webView.setBackgroundColor(android.graphics.Color.TRANSPARENT)
                webView.setLayerType(View.LAYER_TYPE_HARDWARE, null)
            } catch (_: Exception) {}
        }
        applyBounds(r, x, y, width, height, cssPxPerDp)
        r.visibility = View.VISIBLE
        return track != null
    }

    fun updateBounds(
        viewId: String,
        x: Float, y: Float, width: Float, height: Float,
        cssPxPerDp: Float,
    ): Boolean {
        val r = entries[viewId]?.renderer ?: return false
        applyBounds(r, x, y, width, height, cssPxPerDp)
        return true
    }

    fun detach(viewId: String): Boolean {
        val entry = entries.remove(viewId) ?: return false
        val r = entry.renderer
        (r.parent as? ViewGroup)?.let {
            try { it.removeView(r) } catch (_: Exception) {}
        }
        try { r.release() } catch (_: Exception) {}
        return true
    }

    fun detachAll() {
        val keys = entries.keys.toList()
        for (k in keys) detach(k)
    }

    private fun applyBounds(
        r: TextureViewRenderer,
        x: Float, y: Float, width: Float, height: Float,
        cssPxPerDp: Float,
    ) {
        val lp = (r.layoutParams as? FrameLayout.LayoutParams) ?: FrameLayout.LayoutParams(0, 0)
        lp.width = (width * cssPxPerDp).roundToInt().coerceAtLeast(1)
        lp.height = (height * cssPxPerDp).roundToInt().coerceAtLeast(1)
        lp.leftMargin = (x * cssPxPerDp).roundToInt()
        lp.topMargin = (y * cssPxPerDp).roundToInt()
        r.layoutParams = lp
    }
}
