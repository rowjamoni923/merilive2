package com.merilive.app.rtc

import android.content.Context
import android.util.Log
import android.view.View
import android.view.ViewGroup
import io.livekit.android.renderer.TextureViewRenderer
import io.livekit.android.room.Room
import io.livekit.android.room.participant.RemoteParticipant
import io.livekit.android.room.track.VideoTrack
import org.webrtc.EglBase
import org.webrtc.RendererCommon
import java.util.concurrent.ConcurrentHashMap

/**
 * Phase 1B — Surface lifecycle manager.
 *
 * Centralizes attach / detach of [TextureViewRenderer] instances against
 * LiveKit [VideoTrack]s so that surface churn (screen rotation,
 * SurfaceView visibility flips, navigation to a sibling screen) never
 * forces the RTC engine to restart. The Room / capture session stays up;
 * only the View on the WebView z-stack is rebuilt.
 *
 * Contract:
 *   - One renderer per logical slot key. Slots are addressed by
 *     [SlotKey] = `local` or `remote:<sid>`.
 *   - [attachOrReuse] is idempotent: calling it twice with the same key +
 *     track is cheap (the existing renderer is mounted into the new
 *     parent, no re-init, no new EGL surface).
 *   - [detach] unmounts the View from its parent but keeps the renderer
 *     reference. Pass `release = true` only on hard teardown.
 *   - All View mutations MUST happen on the main thread; the manager
 *     does NOT context-switch for you. The plugin is expected to call
 *     into it from `runOnUiThread { ... }` / `withContext(Dispatchers.Main)`.
 *
 * This module owns NO camera / mic / network state. It is purely a
 * View-lifecycle helper that complements [RtcEngineManager] (which owns
 * the Room) and [com.merilive.app.plugin.CameraOwnership] (which owns
 * the hardware arbiter).
 */
object SurfaceLifecycleManager {
    private const val TAG = "SurfaceLifecycle"
    const val LOCAL_KEY = "local"
    fun remoteKey(sid: String): String = "remote:$sid"

    private data class Slot(
        val renderer: TextureViewRenderer,
        var track: VideoTrack?,
        var attachedAtMs: Long,
    )

    private val slots = ConcurrentHashMap<String, Slot>()

    /**
     * Ensure a renderer exists for [key], is initialized with [eglBase]
     * (idempotent on the LiveKit renderer), is wired to [track], and is
     * mounted into [parent] (added if absent, moved if mounted elsewhere).
     *
     * Returns the renderer so the caller can apply scaling / mirror / z-order
     * tweaks once at creation time.
     */
    @JvmStatic
    fun attachOrReuse(
        context: Context,
        eglBase: EglBase,
        key: String,
        track: VideoTrack,
        parent: ViewGroup,
        mirror: Boolean = false,
        scalingType: RendererCommon.ScalingType = RendererCommon.ScalingType.SCALE_ASPECT_FILL,
    ): TextureViewRenderer {
        val existing = slots[key]
        val renderer = existing?.renderer ?: createRenderer(context, scalingType, mirror).also {
            slots[key] = Slot(renderer = it, track = null, attachedAtMs = 0L)
        }

        // initVideoRenderer is idempotent on LiveKit's TextureViewRenderer
        // (no-ops when already initialized with the same EglBase context).
        try { renderer.init(eglBase.eglBaseContext, null) } catch (e: Exception) {
            Log.d(TAG, "init: already initialised for $key (${e.message})")
        }

        // Rebind track only if it actually changed — removeRenderer/addRenderer
        // on the same track triggers a frame-drop hiccup we want to avoid.
        val slot = slots[key]!!
        val oldTrack = slot.track
        if (oldTrack !== track) {
            if (oldTrack != null) {
                try { oldTrack.removeRenderer(renderer) } catch (_: Exception) {}
            }
            try { track.addRenderer(renderer) } catch (e: Exception) {
                Log.w(TAG, "addRenderer($key) failed: ${e.message}")
            }
            slot.track = track
        }

        // Mount in target parent if not already there (or move it).
        val currentParent = renderer.parent as? ViewGroup
        if (currentParent !== parent) {
            try { currentParent?.removeView(renderer) } catch (_: Exception) {}
            try { parent.addView(renderer, ViewGroup.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.MATCH_PARENT,
            )) } catch (e: Exception) {
                Log.w(TAG, "addView($key) failed: ${e.message}")
            }
        }
        slot.attachedAtMs = System.currentTimeMillis()
        return renderer
    }

    /**
     * Unmount the renderer for [key] from its parent. When [release] is
     * true the WebRTC surface + EGL resources are torn down and the slot
     * is forgotten (use on disconnect / final cleanup). Otherwise the
     * renderer is kept warm for a subsequent re-attach.
     */
    @JvmStatic
    fun detach(key: String, release: Boolean = false): Boolean {
        val slot = if (release) slots.remove(key) else slots[key] ?: return false
        val renderer = slot?.renderer ?: return false

        val parent = renderer.parent as? ViewGroup
        try { parent?.removeView(renderer) } catch (_: Exception) {}

        if (release) {
            slot.track?.let {
                try { it.removeRenderer(renderer) } catch (_: Exception) {}
            }
            slot.track = null
            try { renderer.release() } catch (_: Exception) {}
        }
        return true
    }

    /** Detach (and optionally release) every tracked slot. */
    @JvmStatic
    fun detachAll(release: Boolean = false) {
        val keys = slots.keys.toList()
        for (k in keys) detach(k, release)
        if (release) slots.clear()
    }

    /**
     * Drop renderers whose remote sid is no longer present among the
     * [room]'s remote participants. Local slot is never pruned here.
     */
    @JvmStatic
    fun pruneStaleRemotes(room: Room) {
        val liveSids = HashSet<String>()
        for (participant in room.remoteParticipants.values) {
            for (pub in participant.videoTrackPublications) {
                val sid = pub.first.sid
                if (sid != null) liveSids.add(sid)
            }
        }
        val toDrop = slots.keys.filter { it.startsWith("remote:") && it.removePrefix("remote:") !in liveSids }
        for (k in toDrop) detach(k, release = true)
    }

    /** Diagnostics — for debug overlay / log dumps. */
    @JvmStatic
    fun snapshot(): Map<String, Long> = slots.mapValues { it.value.attachedAtMs }

    private fun createRenderer(
        context: Context,
        scalingType: RendererCommon.ScalingType,
        mirror: Boolean,
    ): TextureViewRenderer {
        val r = TextureViewRenderer(context)
        r.setEnableHardwareScaler(true)
        r.setScalingType(scalingType)
        r.setMirror(mirror)
        return r
    }

    /** Unused [RemoteParticipant] reference suppression — keeps the import contract explicit. */
    @Suppress("unused")
    private val keepImport: Class<RemoteParticipant> = RemoteParticipant::class.java
}
