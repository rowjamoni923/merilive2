package com.merilive.app.plugin

import android.app.Activity
import android.graphics.Color
import android.util.Log
import android.view.View
import android.view.ViewGroup
import android.webkit.WebView
import android.widget.FrameLayout
import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin
import androidx.lifecycle.ProcessLifecycleOwner
import io.livekit.android.ConnectOptions
import io.livekit.android.LiveKit
import io.livekit.android.RoomOptions
import io.livekit.android.events.RoomEvent
import io.livekit.android.events.collect
import io.livekit.android.room.Room
import io.livekit.android.room.participant.LocalParticipant
import io.livekit.android.room.participant.Participant
import io.livekit.android.room.track.CameraPosition
import io.livekit.android.room.track.LocalVideoTrack
import io.livekit.android.room.track.LocalVideoTrackOptions
import io.livekit.android.room.track.Track
import io.livekit.android.room.track.VideoTrack
import io.livekit.android.room.track.VideoTrackPublishOptions
import io.livekit.android.room.track.video.CameraCapturerUtils
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import io.livekit.android.renderer.TextureViewRenderer
import livekit.org.webrtc.CameraXHelper
import org.webrtc.RendererCommon
import org.webrtc.SurfaceViewRenderer
import java.util.concurrent.ConcurrentHashMap

/**
 * LiveKitPlugin — minimal, single-camera rebuild (2026-06-14, +preview 2026-06-14b).
 *
 * Bigo/Chamet-style continuous camera flow:
 *
 *   startLocalPreview()           → opens CameraX ONCE, renders behind WebView
 *   connect({ video:true })       → republishes the SAME LocalVideoTrack
 *                                    (no second openCamera, no flicker)
 *   disconnect() / teardownRoom() → unpublish + stop track + release CameraX
 *
 * Single owner by construction: the only `LocalVideoTrack` instance lives in
 * `previewTrack`. Whether we're in "preview only" or "connected + publishing",
 * it's the same track object.
 *
 * Renderer is a SurfaceViewRenderer inserted at index 0 in the WebView's
 * parent ViewGroup. WebView is made transparent during preview so the camera
 * shows through; original background is restored on stopLocalPreview().
 */
@CapacitorPlugin(name = "NativeLiveKit")
class LiveKitPlugin : Plugin() {

    companion object {
        private const val TAG = "LiveKitPlugin"

        @JvmStatic
        fun notifyUserLeaveHint(activity: Activity) {
            Log.d(TAG, "notifyUserLeaveHint (no-op)")
        }

        @JvmStatic
        fun notifyPipModeChanged(isInPip: Boolean) {
            Log.d(TAG, "notifyPipModeChanged=$isInPip (no-op)")
        }
    }

    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Main)

    // The ONE room. Created lazily either by startLocalPreview() (preview-only,
    // never connected) or by connect() (connected session). On preview→publish
    // handoff the same Room instance is connected — no track migration needed.
    private var room: Room? = null
    private var eventsJob: Job? = null

    // The ONE camera track. Survives preview → publish → close.
    private var previewTrack: LocalVideoTrack? = null
    private var previewRenderer: SurfaceViewRenderer? = null
    private var webViewOriginalBg: Int? = null
    private var isConnected: Boolean = false
    /** Phase 1: when true, startLocalPreview does NOT mount a fullscreen
     *  SurfaceViewRenderer or make the WebView transparent. The camera track
     *  is still alive, but rendering is delegated to seat-bound TextureViews
     *  via {@link bindSeatRenderer}. Used by Video/Game Party rooms. */
    private var boundedMode: Boolean = false

    /** Phase 1: per-viewId TextureViewRenderers placed ABOVE the WebView at
     *  exact CSS-pixel rects (converted via display density). The React seat
     *  tile underneath remains visible for empty-seat UI, gradient overlays,
     *  badges, etc — only the inner video region is covered by the native
     *  TextureView. Keyed by `viewId` (matches `NativeVideoView` placeholder
     *  IDs) or `seat:<index>` (legacy bindSeatRenderer path). */
    private data class RendererSlot(
        val key: String,
        val renderer: TextureViewRenderer,
        var identity: String? = null,
        var isLocal: Boolean = false,
        var attachedTrack: VideoTrack? = null,
        var mirror: Boolean = false,
    )
    private val slots = ConcurrentHashMap<String, RendererSlot>()

    override fun load() {
        super.load()
        // CameraX is the ONLY camera pipeline this plugin uses. We register
        // it globally with the LiveKit SDK so every createVideoTrack() /
        // setCameraEnabled() / startLocalPreview() call goes through CameraX.
        // CameraX is Google's official 2025 recommendation — it internally
        // handles OEM HAL quirks (Samsung/Xiaomi/Vivo/Oppo) giving ~99%
        // device coverage. Only ONE camera pipeline is ever active.
        try {
            val app = context.applicationContext as android.app.Application
            val provider = CameraXHelper.createCameraProvider(ProcessLifecycleOwner.get())
            if (provider.isSupported(app)) {
                CameraCapturerUtils.registerCameraProvider(provider)
                Log.i(TAG, "CameraX provider registered — CameraX is the active capturer")
            } else {
                // Extremely rare (pre-API 21 / no CameraX HAL). SDK default kicks in.
                Log.w(TAG, "CameraX not supported on this device — SDK default capturer will be used")
            }
        } catch (t: Throwable) {
            Log.w(TAG, "CameraX registration failed; SDK default capturer will be used", t)
        }
        Log.i(TAG, "LiveKitPlugin loaded — SDK ${LiveKit::class.java.`package`?.implementationVersion ?: "?"}")
    }

    override fun handleOnDestroy() {
        try { runOnMain { teardownAll() } } catch (_: Throwable) {}
        scope.cancel()
        super.handleOnDestroy()
    }

    // ─────────────────────────────────────────────
    // Capability probe
    // ─────────────────────────────────────────────
    @PluginMethod
    fun isAvailable(call: PluginCall) {
        call.resolve(
            JSObject()
                .put("available", true)
                .put("backend", "livekit-android-2.x")
                .put("supportsPreview", true)
        )
    }

    // ─────────────────────────────────────────────
    // Preview lifecycle
    // ─────────────────────────────────────────────
    @PluginMethod
    fun startLocalPreview(call: PluginCall) {
        val lens = call.getString("lens", "front") ?: "front"
        val mirror = call.getBoolean("mirror", lens == "front") ?: (lens == "front")
        val boundedOnly = call.getBoolean("boundedOnly", false) ?: false
        scope.launch {
            try {
                boundedMode = boundedOnly
                if (previewTrack != null) {
                    Log.i(TAG, "startLocalPreview: already running, reusing track (boundedOnly=$boundedOnly)")
                    if (!boundedOnly) ensureRendererAttached(mirror)
                    call.resolve(JSObject().put("started", true).put("reused", true))
                    return@launch
                }
                val r = room ?: withContext(Dispatchers.IO) {
                    LiveKit.create(
                        appContext = context.applicationContext,
                        options = RoomOptions(adaptiveStream = true, dynacast = true),
                    )
                }
                room = r

                val opts = LocalVideoTrackOptions(
                    position = if (lens == "back") CameraPosition.BACK else CameraPosition.FRONT,
                )
                val track = r.localParticipant.createVideoTrack(name = "camera", options = opts)
                track.startCapture()
                previewTrack = track

                if (!boundedOnly) {
                    ensureRendererAttached(mirror)
                    track.addRenderer(previewRenderer!!)
                } else {
                    // Bounded mode — push to any already-registered seat slots
                    // that match the local identity once we know it.
                    Log.i(TAG, "startLocalPreview: bounded mode — no fullscreen renderer")
                }
                rebindSeatSlotsForLocalTrack(track)

                call.resolve(JSObject().put("started", true).put("reused", false))
            } catch (t: Throwable) {
                Log.e(TAG, "startLocalPreview failed", t)
                safeStopPreviewInternals()
                call.reject("startLocalPreview: ${t.message}", t)
            }
        }
    }

    @PluginMethod
    fun stopLocalPreview(call: PluginCall) {
        scope.launch {
            try {
                if (isConnected) {
                    Log.i(TAG, "stopLocalPreview: ignored while connected")
                    call.resolve(JSObject().put("stopped", false).put("reason", "connected"))
                    return@launch
                }
                safeStopPreviewInternals()
                call.resolve(JSObject().put("stopped", true))
            } catch (t: Throwable) {
                Log.w(TAG, "stopLocalPreview", t)
                call.resolve(JSObject().put("stopped", true))
            }
        }
    }

    // ─────────────────────────────────────────────
    // Connection lifecycle
    // ─────────────────────────────────────────────
    /** Args bundle for the preview→session promotion path. */
    private data class ConnectArgs(
        val url: String,
        val token: String,
        val publishVideo: Boolean,
        val publishAudio: Boolean,
    )

    @PluginMethod
    fun connect(call: PluginCall) {
        val url = call.getString("url")
        val token = call.getString("token")
        if (url.isNullOrBlank() || token.isNullOrBlank()) {
            call.reject("url and token are required")
            return
        }
        val args = ConnectArgs(
            url = url,
            token = token,
            publishVideo = call.getBoolean("video", false) ?: false,
            publishAudio = call.getBoolean("audio", false) ?: false,
        )

        scope.launch {
            try {
                promotePreviewToSession(args)
                val r = room!!
                call.resolve(
                    JSObject()
                        .put("connected", true)
                        .put("sid", r.localParticipant.sid?.value ?: "")
                )
            } catch (t: Throwable) {
                Log.e(TAG, "connect failed", t)
                isConnected = false
                teardownAll()
                call.reject("connect failed: ${t.message}", t)
            }
        }
    }

    /**
     * Preview → session handoff. If `previewTrack` is non-null we republish
     * that exact LocalVideoTrack to the new session room — CameraX is NOT
     * reopened, so the user sees an uninterrupted feed from the preview
     * surface into the live / party / call room.
     */
    private suspend fun promotePreviewToSession(args: ConnectArgs) {
        val r = room ?: withContext(Dispatchers.IO) {
            LiveKit.create(
                appContext = context.applicationContext,
                options = RoomOptions(adaptiveStream = true, dynacast = true),
            )
        }
        room = r
        observeRoomEvents(r)
        r.connect(args.url, args.token, ConnectOptions())
        isConnected = true

        if (args.publishAudio) {
            r.localParticipant.setMicrophoneEnabled(true)
        }
        if (args.publishVideo) {
            val ptrack = previewTrack
            if (ptrack != null) {
                val videoPublishOptions = VideoTrackPublishOptions(source = Track.Source.CAMERA)
                r.localParticipant.publishVideoTrack(ptrack, videoPublishOptions)
                Log.i(TAG, "promotePreviewToSession: republished preview track (no reopen)")
            } else {
                r.localParticipant.setCameraEnabled(true)
                previewTrack = r.localParticipant.getTrackPublication(Track.Source.CAMERA)?.track as? LocalVideoTrack
            }
        }
    }


    @PluginMethod
    fun disconnect(call: PluginCall) {
        scope.launch {
            try { teardownAll() } catch (t: Throwable) { Log.w(TAG, "disconnect", t) }
            call.resolve()
        }
    }

    // ─────────────────────────────────────────────
    // Media controls
    // ─────────────────────────────────────────────
    @PluginMethod
    fun setCameraEnabled(call: PluginCall) {
        val enabled = call.getBoolean("enabled", false) ?: false
        val lp = room?.localParticipant ?: run { call.reject("not connected"); return }
        scope.launch {
            try {
                lp.setCameraEnabled(enabled)
                if (enabled && previewTrack == null) {
                    previewTrack = lp.getTrackPublication(Track.Source.CAMERA)?.track as? LocalVideoTrack
                }
                call.resolve(JSObject().put("enabled", enabled))
            } catch (t: Throwable) { call.reject("setCameraEnabled: ${t.message}", t) }
        }
    }

    @PluginMethod
    fun setMicrophoneEnabled(call: PluginCall) {
        val enabled = call.getBoolean("enabled", false) ?: false
        val lp = room?.localParticipant ?: run { call.reject("not connected"); return }
        scope.launch {
            try {
                lp.setMicrophoneEnabled(enabled)
                call.resolve(JSObject().put("enabled", enabled))
            } catch (t: Throwable) { call.reject("setMicrophoneEnabled: ${t.message}", t) }
        }
    }

    @PluginMethod
    fun switchCamera(call: PluginCall) {
        val track = previewTrack ?: run { call.reject("camera track not active"); return }
        scope.launch {
            try {
                val nextPos = if (track.options.position == CameraPosition.FRONT) CameraPosition.BACK else CameraPosition.FRONT
                track.switchCamera(nextPos)
                runOnMain { previewRenderer?.setMirror(nextPos == CameraPosition.FRONT) }
                call.resolve(JSObject().put("position", nextPos.name.lowercase()))
            } catch (t: Throwable) { call.reject("switchCamera: ${t.message}", t) }
        }
    }

    // Legacy shims kept for JS arbiter compatibility.
    @PluginMethod fun getCameraOwner(call: PluginCall) { call.resolve(JSObject().put("owner", JSObject.NULL)) }
    @PluginMethod fun claimCameraForWebView(call: PluginCall) { call.resolve() }
    @PluginMethod fun releaseCameraForWebView(call: PluginCall) { call.resolve() }

    // ─────────────────────────────────────────────
    // Phase 1 — Seat-bound renderer overlays
    // (Bigo/Chamet pattern: per-seat TextureView pinned over each tile;
    //  React tile remains visible for badges/avatar fallback/empty seats.)
    //
    // Public API mirrors the one consumed by `NativeVideoView.tsx`:
    //   attachLocalSurface  / attachRemoteSurface
    //   updateSurfaceBounds / detachSurface
    //   getRemoteParticipants
    // ─────────────────────────────────────────────

    @PluginMethod
    fun attachLocalSurface(call: PluginCall) {
        val viewId = call.getString("viewId") ?: run { call.reject("viewId required"); return }
        val x = call.getDouble("x") ?: 0.0
        val y = call.getDouble("y") ?: 0.0
        val w = call.getDouble("width") ?: 0.0
        val h = call.getDouble("height") ?: 0.0
        val mirror = call.getBoolean("mirror", true) ?: true
        runOnMain {
            try {
                val slot = ensureSlot(viewId, mirror) ?: run { call.reject("renderer attach failed"); return@runOnMain }
                applyRect(slot.renderer, x, y, w, h)
                val localId = room?.localParticipant?.identity?.value
                slot.identity = localId
                val track = previewTrack
                    ?: (room?.localParticipant?.getTrackPublication(Track.Source.CAMERA)?.track as? LocalVideoTrack)
                if (track != null) attachTrackToSlot(slot, track)
                call.resolve(JSObject().put("attached", true))
            } catch (t: Throwable) {
                Log.w(TAG, "attachLocalSurface", t)
                call.reject("attachLocalSurface: ${t.message}", t)
            }
        }
    }

    @PluginMethod
    fun attachRemoteSurface(call: PluginCall) {
        val viewId = call.getString("viewId") ?: run { call.reject("viewId required"); return }
        val sid = call.getString("sid") ?: run { call.reject("sid required"); return }
        val x = call.getDouble("x") ?: 0.0
        val y = call.getDouble("y") ?: 0.0
        val w = call.getDouble("width") ?: 0.0
        val h = call.getDouble("height") ?: 0.0
        runOnMain {
            try {
                val slot = ensureSlot(viewId, mirror = false) ?: run { call.reject("renderer attach failed"); return@runOnMain }
                applyRect(slot.renderer, x, y, w, h)
                val remote = room?.remoteParticipants?.values?.firstOrNull { it.sid?.value == sid }
                slot.identity = remote?.identity?.value
                val track = remote?.getTrackPublication(Track.Source.CAMERA)?.track as? VideoTrack
                if (track != null) attachTrackToSlot(slot, track)
                call.resolve(JSObject().put("attached", true))
            } catch (t: Throwable) {
                Log.w(TAG, "attachRemoteSurface", t)
                call.reject("attachRemoteSurface: ${t.message}", t)
            }
        }
    }

    @PluginMethod
    fun updateSurfaceBounds(call: PluginCall) {
        val viewId = call.getString("viewId") ?: run { call.resolve(); return }
        val x = call.getDouble("x") ?: 0.0
        val y = call.getDouble("y") ?: 0.0
        val w = call.getDouble("width") ?: 0.0
        val h = call.getDouble("height") ?: 0.0
        runOnMain {
            try {
                val slot = slots[viewId] ?: run { call.resolve(); return@runOnMain }
                applyRect(slot.renderer, x, y, w, h)
                call.resolve()
            } catch (t: Throwable) {
                Log.w(TAG, "updateSurfaceBounds", t)
                call.resolve()
            }
        }
    }

    @PluginMethod
    fun detachSurface(call: PluginCall) {
        val viewId = call.getString("viewId") ?: run { call.resolve(); return }
        runOnMain {
            try {
                val slot = slots.remove(viewId)
                if (slot != null) {
                    slot.attachedTrack?.let { try { it.removeRenderer(slot.renderer) } catch (_: Throwable) {} }
                    (slot.renderer.parent as? ViewGroup)?.removeView(slot.renderer)
                    try { slot.renderer.release() } catch (_: Throwable) {}
                }
                call.resolve()
            } catch (t: Throwable) {
                Log.w(TAG, "detachSurface", t)
                call.resolve()
            }
        }
    }

    @PluginMethod
    fun detachAll(call: PluginCall) {
        runOnMain {
            try { clearAllSlots() } catch (_: Throwable) {}
            call.resolve()
        }
    }

    @PluginMethod
    fun getRemoteParticipants(call: PluginCall) {
        val arr = com.getcapacitor.JSArray()
        try {
            room?.remoteParticipants?.values?.forEach { p ->
                arr.put(
                    JSObject()
                        .put("sid", p.sid?.value ?: "")
                        .put("identity", p.identity?.value ?: "")
                )
            }
        } catch (_: Throwable) {}
        call.resolve(JSObject().put("participants", arr))
    }

    @PluginMethod
    fun attachAllRemotes(call: PluginCall) {
        runOnMain {
            try { rebindAllSlotsFromCurrentTracks() } catch (_: Throwable) {}
            call.resolve()
        }
    }

    private fun ensureSlot(viewId: String, mirror: Boolean): RendererSlot? {
        val act = activity ?: return null
        val wv = bridge?.webView ?: return null
        val parent = (wv.parent as? ViewGroup) ?: return null
        val existing = slots[viewId]
        if (existing != null) {
            existing.mirror = mirror
            existing.renderer.setMirror(mirror)
            return existing
        }
        val renderer = TextureViewRenderer(act).apply {
            setEnableHardwareScaler(true)
            setScalingType(RendererCommon.ScalingType.SCALE_ASPECT_FILL)
            setMirror(mirror)
        }
        try { room?.initVideoRenderer(renderer) } catch (t: Throwable) { Log.w(TAG, "initVideoRenderer", t) }
        // Mount ABOVE the WebView so the camera tile is visible on top of the
        // (opaque) React seat tile. React layer still renders empty-seat UI,
        // gradients, badges, etc — only the inner video region is covered.
        val lp = FrameLayout.LayoutParams(1, 1)
        parent.addView(renderer, lp)
        val slot = RendererSlot(viewId, renderer, mirror = mirror)
        slots[viewId] = slot
        return slot
    }

    private fun attachTrackToSlot(slot: RendererSlot, track: VideoTrack) {
        if (slot.attachedTrack === track) return
        slot.attachedTrack?.let { prev ->
            try { prev.removeRenderer(slot.renderer) } catch (_: Throwable) {}
        }
        try {
            track.addRenderer(slot.renderer)
            slot.attachedTrack = track
        } catch (t: Throwable) {
            Log.w(TAG, "attachTrackToSlot", t)
        }
    }

    private fun applyRect(view: View, cssX: Double, cssY: Double, cssW: Double, cssH: Double) {
        val density = context.resources.displayMetrics.density
        val w = (cssW * density).toInt().coerceAtLeast(1)
        val h = (cssH * density).toInt().coerceAtLeast(1)
        val left = (cssX * density).toInt().coerceAtLeast(0)
        val top = (cssY * density).toInt().coerceAtLeast(0)
        val lp = (view.layoutParams as? FrameLayout.LayoutParams)
            ?: FrameLayout.LayoutParams(w, h)
        lp.width = w
        lp.height = h
        lp.leftMargin = left
        lp.topMargin = top
        view.layoutParams = lp
    }

    private fun clearAllSlots() {
        slots.values.forEach { slot ->
            slot.attachedTrack?.let { try { it.removeRenderer(slot.renderer) } catch (_: Throwable) {} }
            (slot.renderer.parent as? ViewGroup)?.removeView(slot.renderer)
            try { slot.renderer.release() } catch (_: Throwable) {}
        }
        slots.clear()
    }

    /** Fired from RoomEvent handlers — attach any pending slot waiting on this identity. */
    private fun onIdentityTrackAvailable(identity: String, track: VideoTrack) {
        runOnMain {
            slots.values
                .filter { it.identity == identity && it.attachedTrack !== track }
                .forEach { attachTrackToSlot(it, track) }
        }
    }

    private fun onIdentityTrackGone(identity: String) {
        runOnMain {
            slots.values.filter { it.identity == identity }.forEach { s ->
                s.attachedTrack?.let { try { it.removeRenderer(s.renderer) } catch (_: Throwable) {} }
                s.attachedTrack = null
            }
        }
    }

    /** Sweep all slots and re-attach from current local / remote tracks. */
    private fun rebindAllSlotsFromCurrentTracks() {
        val r = room ?: return
        val localId = r.localParticipant.identity?.value
        val localTrack = previewTrack
            ?: (r.localParticipant.getTrackPublication(Track.Source.CAMERA)?.track as? LocalVideoTrack)
        slots.values.forEach { slot ->
            val id = slot.identity ?: return@forEach
            if (id == localId && localTrack != null) {
                attachTrackToSlot(slot, localTrack)
            } else {
                val remote = r.remoteParticipants.values.firstOrNull { it.identity?.value == id }
                val track = remote?.getTrackPublication(Track.Source.CAMERA)?.track as? VideoTrack
                if (track != null) attachTrackToSlot(slot, track)
            }
        }
    }

    /** Push local preview track into any slot already bound to local identity. */
    private fun rebindSeatSlotsForLocalTrack(track: LocalVideoTrack) {
        val id = room?.localParticipant?.identity?.value ?: return
        onIdentityTrackAvailable(id, track)
    }

    // ─────────────────────────────────────────────
    // Internals
    // ─────────────────────────────────────────────
    private fun observeRoomEvents(r: Room) {
        eventsJob?.cancel()
        eventsJob = scope.launch {
            r.events.collect { ev ->
                try {
                    when (ev) {
                        is RoomEvent.ParticipantConnected -> emit("participant-connected", participantJs(ev.participant))
                        is RoomEvent.ParticipantDisconnected -> {
                            ev.participant.identity?.value?.let { id -> onIdentityTrackGone(id) }
                            emit("participant-disconnected", participantJs(ev.participant))
                        }
                        is RoomEvent.TrackSubscribed -> {
                            (ev.track as? VideoTrack)?.let { vt ->
                                ev.participant.identity?.value?.let { id ->
                                    onIdentityTrackAvailable(id, vt)
                                }
                            }
                            emit("track-subscribed", trackJs(ev.track, ev.participant))
                        }
                        is RoomEvent.TrackUnsubscribed -> {
                            ev.participant.identity?.value?.let { id -> onIdentityTrackGone(id) }
                            emit("track-unsubscribed", trackJs(ev.track, ev.participant))
                        }
                        is RoomEvent.LocalTrackPublished -> {
                            (ev.publication.track as? VideoTrack)?.let { vt ->
                                r.localParticipant.identity?.value?.let { id ->
                                    onIdentityTrackAvailable(id, vt)
                                }
                            }
                        }
                        is RoomEvent.LocalTrackUnpublished -> {
                            r.localParticipant.identity?.value?.let { id -> onIdentityTrackGone(id) }
                        }
                        is RoomEvent.Disconnected -> emit("disconnected", JSObject().put("reason", ev.reason?.name ?: ""))
                        is RoomEvent.Reconnecting -> emit("reconnecting", JSObject())
                        is RoomEvent.Reconnected -> emit("reconnected", JSObject())
                        is RoomEvent.ActiveSpeakersChanged -> {
                            val arr = com.getcapacitor.JSArray()
                            ev.speakers.forEach { arr.put(it.identity?.value ?: "") }
                            notifyListeners("active-speakers-changed", JSObject().put("speakers", arr))
                        }
                        is RoomEvent.ParticipantMetadataChanged -> {
                            notifyListeners(
                                "participant-metadata-changed",
                                JSObject()
                                    .put("identity", ev.participant.identity?.value ?: "")
                                    .put("metadata", ev.participant.metadata ?: "")
                            )
                        }
                        is RoomEvent.RoomMetadataChanged -> {
                            notifyListeners("room-metadata-changed", JSObject())
                        }
                        is RoomEvent.TranscriptionReceived -> {
                            notifyListeners("transcription-received", JSObject())
                        }
                        else -> {}
                    }
                } catch (t: Throwable) { Log.w(TAG, "event emit failed", t) }
            }
        }
    }

    private fun emit(event: String, data: JSObject) {
        try { notifyListeners(event, data) } catch (t: Throwable) { Log.w(TAG, "notifyListeners($event)", t) }
    }

    private fun participantJs(p: Participant) = JSObject()
        .put("sid", p.sid?.value ?: "")
        .put("identity", p.identity?.value ?: "")

    private fun trackJs(track: Track, p: Participant) = JSObject()
        .put("sid", p.sid?.value ?: "")
        .put("identity", p.identity?.value ?: "")
        .put("kind", if (track is VideoTrack) "video" else "audio")
        .put("source", track.name)

    private fun ensureRendererAttached(mirror: Boolean) {
        val act = activity ?: return
        val wv = bridge?.webView ?: return
        val parent = (wv.parent as? ViewGroup) ?: return

        act.runOnUiThread {
            try {
                if (previewRenderer == null) {
                    val renderer = SurfaceViewRenderer(act).apply {
                        setEnableHardwareScaler(true)
                        setScalingType(RendererCommon.ScalingType.SCALE_ASPECT_FILL)
                        setMirror(mirror)
                    }
                    room?.initVideoRenderer(renderer)
                    val lp = FrameLayout.LayoutParams(
                        ViewGroup.LayoutParams.MATCH_PARENT,
                        ViewGroup.LayoutParams.MATCH_PARENT,
                    )
                    parent.addView(renderer, 0, lp)
                    previewRenderer = renderer

                    // Make WebView transparent so renderer behind it is visible.
                    if (webViewOriginalBg == null) {
                        webViewOriginalBg = (wv.background as? android.graphics.drawable.ColorDrawable)?.color ?: Color.WHITE
                    }
                    wv.setBackgroundColor(Color.TRANSPARENT)
                } else {
                    previewRenderer?.setMirror(mirror)
                }
            } catch (t: Throwable) {
                Log.w(TAG, "ensureRendererAttached failed", t)
            }
        }
    }

    private fun detachRenderer() {
        val act = activity ?: return
        act.runOnUiThread {
            try {
                val r = previewRenderer
                if (r != null) {
                    (r.parent as? ViewGroup)?.removeView(r)
                    try { r.release() } catch (_: Throwable) {}
                }
                previewRenderer = null
                val wv = bridge?.webView
                if (wv != null) {
                    wv.setBackgroundColor(webViewOriginalBg ?: Color.WHITE)
                }
                webViewOriginalBg = null
            } catch (t: Throwable) {
                Log.w(TAG, "detachRenderer failed", t)
            }
        }
    }

    private fun safeStopPreviewInternals() {
        try {
            val track = previewTrack
            if (track != null) {
                try { previewRenderer?.let { track.removeRenderer(it) } } catch (_: Throwable) {}
                try { track.stop() } catch (_: Throwable) {}
                try { track.dispose() } catch (_: Throwable) {}
            }
            previewTrack = null
        } catch (_: Throwable) {}
        detachRenderer()

        // If we created a preview-only Room (never connected) just to host the
        // capturer, release it too. A connected room is kept by teardownAll().
        if (!isConnected) {
            try { room?.disconnect() } catch (_: Throwable) {}
            room = null
        }
    }

    private fun teardownAll() {
        eventsJob?.cancel()
        eventsJob = null
        try { clearAllSlots() } catch (_: Throwable) {}
        // Releases publish + stops CameraX via the SDK.
        try {
            val track = previewTrack
            if (track != null) {
                try { previewRenderer?.let { track.removeRenderer(it) } } catch (_: Throwable) {}
                try { track.stop() } catch (_: Throwable) {}
                try { track.dispose() } catch (_: Throwable) {}
            }
        } catch (_: Throwable) {}
        previewTrack = null
        detachRenderer()
        try { room?.disconnect() } catch (_: Throwable) {}
        room = null
        isConnected = false
        boundedMode = false
    }

    private fun runOnMain(block: () -> Unit) {
        val act = activity
        if (act != null) act.runOnUiThread { block() } else block()
    }
}
