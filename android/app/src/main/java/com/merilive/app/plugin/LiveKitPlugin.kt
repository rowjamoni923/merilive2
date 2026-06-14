package com.merilive.app.plugin

import android.app.Activity
import android.util.Log
import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin
import io.livekit.android.ConnectOptions
import io.livekit.android.LiveKit
import io.livekit.android.RoomOptions
import io.livekit.android.events.RoomEvent
import io.livekit.android.events.collect
import io.livekit.android.room.Room
import io.livekit.android.room.participant.LocalParticipant
import io.livekit.android.room.participant.Participant
import io.livekit.android.room.participant.RemoteParticipant
import io.livekit.android.room.track.CameraPosition
import io.livekit.android.room.track.LocalVideoTrack
import io.livekit.android.room.track.Track
import io.livekit.android.room.track.VideoTrack
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

/**
 * LiveKitPlugin — minimal, single-camera rebuild (2026-06-14).
 *
 * Replaces the previous 6252-line plugin + CameraOwnership / CameraAuthority
 * / CameraResilience stack. Strategy follows the proven pattern from the old
 * production project + LiveKit Android SDK best practices:
 *
 *   • ONE Room instance per session (Live / Private Call / Video Party / Game Party)
 *   • Camera publish goes through LiveKit's built-in Camera2 capturer
 *     (`setCameraEnabled(true)`) — no manual Camera2 handle juggling
 *   • Mic publish via `setMicrophoneEnabled(true)`
 *   • No ownership lock — only one publisher path exists, so there is
 *     nothing to arbitrate against
 *   • Remote video rendering is delegated to the React side (Step 3 will
 *     add SurfaceViewRenderer overlays if/when we need them; for now the
 *     LiveKit web client handles render in the WebView fallback path)
 *
 * Face Verification continues to use `NativeCameraPlugin` (CameraX) on a
 * completely separate code path; the two cannot overlap because the JS
 * gates ensure only one feature runs at a time.
 *
 * Static helpers `notifyUserLeaveHint` / `notifyPipModeChanged` exist so
 * `MainActivity` keeps compiling; they are placeholders for a future PiP
 * pass and are safe no-ops today.
 */
@CapacitorPlugin(name = "NativeLiveKit")
class LiveKitPlugin : Plugin() {

    companion object {
        private const val TAG = "LiveKitPlugin"

        /** Invoked by MainActivity.onUserLeaveHint — placeholder. */
        @JvmStatic
        fun notifyUserLeaveHint(activity: Activity) {
            Log.d(TAG, "notifyUserLeaveHint (no-op in minimal plugin)")
        }

        /** Invoked by MainActivity.onPictureInPictureModeChanged — placeholder. */
        @JvmStatic
        fun notifyPipModeChanged(isInPip: Boolean) {
            Log.d(TAG, "notifyPipModeChanged=$isInPip (no-op in minimal plugin)")
        }
    }

    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Main)
    private var room: Room? = null
    private var eventsJob: Job? = null

    override fun load() {
        super.load()
        Log.i(TAG, "minimal LiveKitPlugin loaded — SDK ${LiveKit::class.java.`package`?.implementationVersion ?: "?"}")
    }

    override fun handleOnDestroy() {
        try { teardownRoom() } catch (_: Throwable) {}
        scope.cancel()
        super.handleOnDestroy()
    }

    // ─────────────────────────────────────────────────────────────
    // Capability probe — JS calls this in `isNativeLiveKitAvailable`
    // ─────────────────────────────────────────────────────────────
    @PluginMethod
    fun isAvailable(call: PluginCall) {
        val res = JSObject()
        res.put("available", true)
        res.put("backend", "livekit-android-2.x")
        call.resolve(res)
    }

    // ─────────────────────────────────────────────────────────────
    // Connection lifecycle
    // ─────────────────────────────────────────────────────────────
    @PluginMethod
    fun connect(call: PluginCall) {
        val url = call.getString("url")
        val token = call.getString("token")
        if (url.isNullOrBlank() || token.isNullOrBlank()) {
            call.reject("url and token are required")
            return
        }
        val publishVideo = call.getBoolean("video", false) ?: false
        val publishAudio = call.getBoolean("audio", false) ?: false

        scope.launch {
            try {
                teardownRoom()
                val r = withContext(Dispatchers.IO) {
                    LiveKit.create(
                        appContext = context.applicationContext,
                        options = RoomOptions(adaptiveStream = true, dynacast = true),
                    )
                }
                room = r
                observeRoomEvents(r)
                r.connect(url, token, ConnectOptions())
                if (publishAudio) r.localParticipant.setMicrophoneEnabled(true)
                if (publishVideo) r.localParticipant.setCameraEnabled(true)
                val res = JSObject()
                res.put("connected", true)
                res.put("sid", r.localParticipant.sid?.value ?: "")
                call.resolve(res)
            } catch (t: Throwable) {
                Log.e(TAG, "connect failed", t)
                teardownRoom()
                call.reject("connect failed: ${t.message}", t)
            }
        }
    }

    @PluginMethod
    fun disconnect(call: PluginCall) {
        scope.launch {
            try { teardownRoom() } catch (t: Throwable) { Log.w(TAG, "disconnect", t) }
            call.resolve()
        }
    }

    // ─────────────────────────────────────────────────────────────
    // Media controls
    // ─────────────────────────────────────────────────────────────
    @PluginMethod
    fun setCameraEnabled(call: PluginCall) {
        val enabled = call.getBoolean("enabled", false) ?: false
        val lp = room?.localParticipant ?: run { call.reject("not connected"); return }
        scope.launch {
            try {
                lp.setCameraEnabled(enabled)
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
        val lp = room?.localParticipant ?: run { call.reject("not connected"); return }
        scope.launch {
            try {
                val cameraTrack = lp.getTrackPublication(Track.Source.CAMERA)?.track as? LocalVideoTrack
                if (cameraTrack == null) {
                    call.reject("camera track not published")
                    return@launch
                }
                val nextPos = if (cameraTrack.options.position == CameraPosition.FRONT) {
                    CameraPosition.BACK
                } else {
                    CameraPosition.FRONT
                }
                cameraTrack.switchCamera(nextPos)
                call.resolve(JSObject().put("position", nextPos.name.lowercase()))
            } catch (t: Throwable) { call.reject("switchCamera: ${t.message}", t) }
        }
    }

    // ─────────────────────────────────────────────────────────────
    // Camera-owner query — kept for JS arbiter shim compatibility.
    // No more ownership tracking; always reports null.
    // ─────────────────────────────────────────────────────────────
    @PluginMethod
    fun getCameraOwner(call: PluginCall) {
        call.resolve(JSObject().put("owner", JSObject.NULL))
    }

    // ─────────────────────────────────────────────────────────────
    // WebView camera handoff shims — minimal plugin owns camera via
    // LiveKit SDK only, so these are no-ops kept for JS compatibility.
    // ─────────────────────────────────────────────────────────────
    @PluginMethod fun claimCameraForWebView(call: PluginCall) { call.resolve() }
    @PluginMethod fun releaseCameraForWebView(call: PluginCall) { call.resolve() }

    // ─────────────────────────────────────────────────────────────
    // Internals
    // ─────────────────────────────────────────────────────────────
    private fun observeRoomEvents(r: Room) {
        eventsJob?.cancel()
        eventsJob = scope.launch {
            r.events.collect { ev ->
                try {
                    when (ev) {
                        is RoomEvent.ParticipantConnected -> emit("participant-connected", participantJs(ev.participant))
                        is RoomEvent.ParticipantDisconnected -> emit("participant-disconnected", participantJs(ev.participant))
                        is RoomEvent.TrackSubscribed -> emit("track-subscribed", trackJs(ev.track, ev.participant))
                        is RoomEvent.TrackUnsubscribed -> emit("track-unsubscribed", trackJs(ev.track, ev.participant))
                        is RoomEvent.Disconnected -> emit("disconnected", JSObject().put("reason", ev.reason?.name ?: ""))
                        is RoomEvent.Reconnecting -> emit("reconnecting", JSObject())
                        is RoomEvent.Reconnected -> emit("reconnected", JSObject())
                        else -> { /* ignore the rest for v1 */ }
                    }
                } catch (t: Throwable) {
                    Log.w(TAG, "event emit failed", t)
                }
            }
        }
    }

    private fun emit(event: String, data: JSObject) {
        try { notifyListeners(event, data) } catch (t: Throwable) { Log.w(TAG, "notifyListeners($event)", t) }
    }

    private fun participantJs(p: Participant): JSObject {
        return JSObject()
            .put("sid", p.sid?.value ?: "")
            .put("identity", p.identity?.value ?: "")
    }

    private fun trackJs(track: Track, p: Participant): JSObject {
        return JSObject()
            .put("sid", p.sid?.value ?: "")
            .put("identity", p.identity?.value ?: "")
            .put("kind", if (track is VideoTrack) "video" else "audio")
            .put("source", track.name)
    }

    private fun teardownRoom() {
        eventsJob?.cancel()
        eventsJob = null
        try { room?.disconnect() } catch (_: Throwable) {}
        room = null
    }
}
