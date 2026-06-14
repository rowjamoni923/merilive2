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
 * Professional hardening (Chamet / Bigo parity):
 *  - **No double-bind:** each Entry remembers its currently bound
 *    VideoTrack. Re-attach calls become no-ops at the SDK level; they
 *    never call `addRenderer` twice on the same (track, renderer) pair
 *    which on some OEM EGL stacks (Mali / PowerVR) silently halts the
 *    decoded frame stream (the "viewer permanent blank" bug).
 *  - **Serial sid swap:** when an entry's sid changes we remove the
 *    renderer from the old track before adding it to the new one, so
 *    we never leave the renderer attached to two tracks (race that
 *    produced the "wrong feed for a frame, then black" flash).
 *  - **Ownership registry:** [ownsRemote] lets the plugin's legacy
 *    `attachRemoteRendererInternal` skip mounting a competing renderer
 *    for the same sid (EGL fight = permanent blank on viewer side).
 */
object BoundedSurfaceHost {
    private const val TAG = "BoundedSurfaceHost"

    private data class Entry(
        val viewId: String,
        val renderer: TextureViewRenderer,
        var kind: String,            // "local" | "remote"
        var sid: String?,            // remote video-track sid (null for local)
        var boundTrack: VideoTrack?, // currently bound — prevents double addRenderer
    )

    private val entries = ConcurrentHashMap<String, Entry>()
    /** Remote sids currently mounted via NativeVideoView. */
    private val ownedRemoteSids = java.util.Collections.newSetFromMap(ConcurrentHashMap<String, Boolean>())

    /** Plugin queries this so it doesn't mount a competing legacy renderer for the same track. */
    @JvmStatic
    fun ownsRemote(sid: String): Boolean = ownedRemoteSids.contains(sid)

    /** True when React still owns one or more bounded native video placeholders. */
    @JvmStatic
    fun hasSurfaces(): Boolean = entries.isNotEmpty()

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
                initRenderer(room, it, viewId)
                it.setEnableHardwareScaler(true)
                it.setScalingType(org.webrtc.RendererCommon.ScalingType.SCALE_ASPECT_FILL)
                it.setMirror(mirror)
            },
            kind = kind,
            sid = sid,
            boundTrack = null,
        ).also { entries[viewId] = it }

        // Detect sid swap so we can release the previous owned slot first.
        val sidChanged = entry.kind != kind || entry.sid != sid
        if (sidChanged) {
            entry.boundTrack?.let { old ->
                try { old.removeRenderer(entry.renderer) } catch (_: Exception) {}
            }
            entry.boundTrack = null
            entry.sid?.let { prevSid -> if (entry.kind == "remote") ownedRemoteSids.remove(prevSid) }
            entry.kind = kind
            entry.sid = sid
        }

        // Locate the requested track on the current Room.
        val track: VideoTrack? = resolveTrack(room, kind, sid)

        // Bind only when the target track actually differs from the bound one.
        if (track != null && track !== entry.boundTrack) {
            entry.boundTrack?.let { prev ->
                try { prev.removeRenderer(entry.renderer) } catch (e: Exception) {
                    Log.w(TAG, "prev.removeRenderer($viewId) failed: ${e.message}")
                    reportNonFatal("BoundedSurfaceHost.attach.removePrev", e)
                }
            }
            try {
                initRenderer(room, entry.renderer, viewId)
                track.addRenderer(entry.renderer)
                entry.boundTrack = track
                if (kind == "remote" && sid != null) ownedRemoteSids.add(sid)
            } catch (e: Exception) {
                Log.w(TAG, "addRenderer($viewId) failed: ${e.message}")
                reportNonFatal("BoundedSurfaceHost.attach.addRenderer", e)
            }
        } else if (track == null) {
            Log.d(TAG, "attach($viewId): no VideoTrack yet for kind=$kind sid=$sid — will mount empty")
        }

        // Mount behind WebView (index 0 of root).
        val r = entry.renderer
        val currentParent = r.parent as? ViewGroup
        if (currentParent !== root) {
            try { currentParent?.removeView(r) } catch (_: Exception) {}
            try { root.addView(r, 0, FrameLayout.LayoutParams(0, 0)) } catch (e: Exception) {
                Log.w(TAG, "addView($viewId) failed: ${e.message}")
                return false
            }
            try {
                webView.setBackgroundColor(android.graphics.Color.TRANSPARENT)
                webView.setLayerType(View.LAYER_TYPE_HARDWARE, null)
            } catch (_: Exception) {}
        }
        applyBounds(r, x, y, width, height, cssPxPerDp)
        r.visibility = View.VISIBLE
        return entry.boundTrack != null
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
        entry.boundTrack?.let { t ->
            try { t.removeRenderer(r) } catch (_: Exception) {}
        }
        entry.boundTrack = null
        entry.sid?.let { if (entry.kind == "remote") ownedRemoteSids.remove(it) }
        (r.parent as? ViewGroup)?.let {
            try { it.removeView(r) } catch (_: Exception) {}
        }
        try { r.release() } catch (_: Exception) {}
        return true
    }

    fun detachAll() {
        val keys = entries.keys.toList()
        for (k in keys) detach(k)
        ownedRemoteSids.clear()
    }

    /**
     * Re-bind any orphaned NativeVideoView entries against the current
     * Room. Called by the plugin after `TrackSubscribed` so a placeholder
     * that mounted *before* its track arrived can latch on without the JS
     * layer having to remount.
     */
    @JvmStatic
    fun rebindForRoom(room: Room) {
        for ((viewId, entry) in entries) {
            val track: VideoTrack = resolveTrack(room, entry.kind, entry.sid) ?: continue
            if (track === entry.boundTrack) continue
            try {
                entry.boundTrack?.let { prev ->
                    try { prev.removeRenderer(entry.renderer) } catch (_: Exception) {}
                }
                initRenderer(room, entry.renderer, viewId)
                track.addRenderer(entry.renderer)
                entry.boundTrack = track
                if (entry.kind == "remote" && entry.sid != null) ownedRemoteSids.add(entry.sid!!)
                Log.d(TAG, "rebindForRoom: late-bound $viewId → ${entry.kind}/${entry.sid}")
            } catch (e: Exception) {
                Log.w(TAG, "rebindForRoom($viewId) failed: ${e.message}")
            }
        }
    }

    private fun resolveTrack(room: Room?, kind: String, sid: String?): VideoTrack? {
        return when (kind) {
            "local" -> room?.localParticipant?.getTrackPublication(Track.Source.CAMERA)?.track as? VideoTrack
            "remote" -> {
                val targetSid = sid ?: return null
                room?.remoteParticipants?.values
                    ?.firstOrNull { p -> p.sid.value == targetSid || p.videoTrackPublications.any { it.first.sid == targetSid } }
                    ?.getTrackPublication(Track.Source.CAMERA)?.track as? VideoTrack
            }
            else -> null
        }
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

    private fun initRenderer(room: Room?, renderer: TextureViewRenderer, viewId: String) {
        val r = room ?: return
        try {
            r.initVideoRenderer(renderer)
        } catch (e: IllegalStateException) {
            Log.d(TAG, "initVideoRenderer($viewId): already initialized")
        } catch (t: Throwable) {
            Log.w(TAG, "initVideoRenderer($viewId) failed: ${t.message}")
            reportNonFatal("BoundedSurfaceHost.initRenderer", t)
        }
    }

    /**
     * Phase 3 (Camera Rebuild Plan, 2026-06-14) — F3 diagnostic.
     * Forward non-fatal seat-mount failures to Crashlytics so the next
     * Video Party crash/OOM gives us a real stack trace + device key.
     * Wrapped in a Throwable-catch so a missing FirebaseCrashlytics on
     * debug builds never escalates the original failure.
     */
    private fun reportNonFatal(tag: String, t: Throwable) {
        try {
            val fc = com.google.firebase.crashlytics.FirebaseCrashlytics.getInstance()
            fc.setCustomKey("seat_mount_stage", tag)
            val rt = Runtime.getRuntime()
            fc.setCustomKey("used_mem_mb", ((rt.totalMemory() - rt.freeMemory()) / 1048576L).toString())
            fc.setCustomKey("max_mem_mb", (rt.maxMemory() / 1048576L).toString())
            fc.setCustomKey("bounded_entries", entries.size.toString())
            fc.recordException(t)
        } catch (_: Throwable) { /* never let diagnostics crash the caller */ }
    }
}
