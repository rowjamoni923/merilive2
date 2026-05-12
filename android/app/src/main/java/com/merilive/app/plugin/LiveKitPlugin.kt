package com.merilive.app.plugin

import android.Manifest
import android.util.Log
import android.view.ViewGroup
import android.widget.FrameLayout
import com.getcapacitor.JSObject
import com.getcapacitor.PermissionState
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin
import com.getcapacitor.annotation.Permission
import com.getcapacitor.annotation.PermissionCallback
import io.livekit.android.ConnectOptions
import io.livekit.android.LiveKit
import io.livekit.android.LiveKitOverrides
import io.livekit.android.RoomOptions
import io.livekit.android.events.RoomEvent
import io.livekit.android.events.collect
import io.livekit.android.renderer.TextureViewRenderer
import io.livekit.android.room.Room
import io.livekit.android.room.participant.RemoteParticipant
import io.livekit.android.room.track.CameraPosition
import io.livekit.android.room.track.LocalVideoTrackOptions
import io.livekit.android.room.track.Track
import io.livekit.android.room.track.VideoCaptureParameter
import io.livekit.android.room.track.VideoPreset169
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch

/**
 * LiveKitPlugin — Step 2.
 *
 * Capacitor bridge around LiveKit Android SDK 2.x. Publishes camera + mic
 * as native WebRTC tracks (replaces browser getUserMedia inside Live and
 * Private Call). Renders local + remote video into native TextureViews
 * mounted behind the Capacitor WebView so JS chat / gift overlays stay
 * on top.
 *
 * JS API (see src/plugins/NativeLiveKit.ts):
 *   isAvailable()
 *   connect({ url, token, video?, audio?, lens?, resolution? })
 *   disconnect()
 *   setMicrophoneEnabled({ enabled })
 *   setCameraEnabled({ enabled })
 *   switchCamera()
 *   attachLocal()         // mount local preview behind WebView
 *   attachRemote({ sid }) // mount remote video behind WebView
 *   detachAll()
 *
 * Events emitted to JS:
 *   "participant-connected"      { sid, identity }
 *   "participant-disconnected"   { sid, identity }
 *   "track-subscribed"           { sid, identity, kind }
 *   "track-unsubscribed"         { sid, identity, kind }
 *   "disconnected"               { reason }
 *   "connection-quality"         { sid, quality }
 */
@CapacitorPlugin(
    name = "NativeLiveKit",
    permissions = [
        Permission(strings = [Manifest.permission.CAMERA], alias = "camera"),
        Permission(strings = [Manifest.permission.RECORD_AUDIO], alias = "microphone")
    ]
)
class LiveKitPlugin : Plugin() {

    companion object { private const val TAG = "LiveKitPlugin" }

    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Main)
    private var eventJob: Job? = null
    private var room: Room? = null

    private var localRenderer: TextureViewRenderer? = null
    private val remoteRenderers = mutableMapOf<String, TextureViewRenderer>()

    // ------------------------------------------------------------
    // Public API
    // ------------------------------------------------------------

    @PluginMethod
    fun isAvailable(call: PluginCall) {
        val ret = JSObject()
        ret.put("available", true)
        ret.put("backend", "livekit-native")
        ret.put("version", "2.7.0")
        call.resolve(ret)
    }

    @PluginMethod
    fun connect(call: PluginCall) {
        if (getPermissionState("camera") != PermissionState.GRANTED ||
            getPermissionState("microphone") != PermissionState.GRANTED
        ) {
            requestPermissionForAliases(arrayOf("camera", "microphone"), call, "permsCallback")
            return
        }

        val url = call.getString("url")
        val token = call.getString("token")
        if (url.isNullOrBlank() || token.isNullOrBlank()) {
            call.reject("url and token are required")
            return
        }

        val enableVideo = call.getBoolean("video", true) ?: true
        val enableAudio = call.getBoolean("audio", true) ?: true
        val lens = call.getString("lens", "front") ?: "front"
        val resolution = call.getString("resolution", "1080p") ?: "1080p"

        scope.launch {
            try {
                // Tear down any previous room first.
                room?.disconnect()
                room = null

                val captureParams: VideoCaptureParameter = if (resolution == "720p") {
                    VideoPreset169.H720.capture
                } else {
                    VideoPreset169.H1080.capture
                }

                val cameraPosition =
                    if (lens == "back") CameraPosition.BACK else CameraPosition.FRONT

                val roomOptions = RoomOptions(
                    adaptiveStream = true,
                    dynacast = true,
                    videoTrackCaptureDefaults = LocalVideoTrackOptions(
                        position = cameraPosition,
                        captureParams = captureParams
                    )
                )

                val newRoom = LiveKit.create(
                    appContext = context.applicationContext,
                    options = roomOptions,
                    overrides = LiveKitOverrides()
                )
                room = newRoom

                attachEventListeners(newRoom)

                newRoom.connect(url, token, ConnectOptions(autoSubscribe = true))

                // Publish local tracks.
                newRoom.localParticipant.setMicrophoneEnabled(enableAudio)
                newRoom.localParticipant.setCameraEnabled(enableVideo)

                val ret = JSObject()
                ret.put("connected", true)
                ret.put("sid", newRoom.localParticipant.sid.value)
                ret.put("identity", newRoom.localParticipant.identity?.value ?: "")
                call.resolve(ret)
            } catch (e: Exception) {
                Log.e(TAG, "connect failed", e)
                call.reject("LiveKit connect failed: ${e.message}")
            }
        }
    }

    @PluginMethod
    fun disconnect(call: PluginCall) {
        scope.launch {
            try {
                eventJob?.cancel()
                eventJob = null
                room?.disconnect()
                room = null
                activity?.runOnUiThread { detachAllRenderersInternal() }
                call.resolve()
            } catch (e: Exception) {
                call.reject("disconnect failed: ${e.message}")
            }
        }
    }

    @PluginMethod
    fun setMicrophoneEnabled(call: PluginCall) {
        val enabled = call.getBoolean("enabled", true) ?: true
        val r = room ?: return call.reject("Not connected")
        scope.launch {
            try {
                r.localParticipant.setMicrophoneEnabled(enabled)
                call.resolve()
            } catch (e: Exception) {
                call.reject("setMicrophoneEnabled failed: ${e.message}")
            }
        }
    }

    @PluginMethod
    fun setCameraEnabled(call: PluginCall) {
        val enabled = call.getBoolean("enabled", true) ?: true
        val r = room ?: return call.reject("Not connected")
        scope.launch {
            try {
                r.localParticipant.setCameraEnabled(enabled)
                call.resolve()
            } catch (e: Exception) {
                call.reject("setCameraEnabled failed: ${e.message}")
            }
        }
    }

    @PluginMethod
    fun switchCamera(call: PluginCall) {
        val r = room ?: return call.reject("Not connected")
        scope.launch {
            try {
                val videoTrack = r.localParticipant.getTrackPublication(Track.Source.CAMERA)
                    ?.track as? io.livekit.android.room.track.LocalVideoTrack
                videoTrack?.switchCamera()
                call.resolve()
            } catch (e: Exception) {
                call.reject("switchCamera failed: ${e.message}")
            }
        }
    }

    @PluginMethod
    fun attachLocal(call: PluginCall) {
        val r = room ?: return call.reject("Not connected")
        activity?.runOnUiThread {
            try {
                val track = r.localParticipant.getTrackPublication(Track.Source.CAMERA)
                    ?.track as? io.livekit.android.room.track.VideoTrack
                if (track == null) { call.reject("No local camera track yet"); return@runOnUiThread }

                if (localRenderer == null) localRenderer = createRenderer()
                r.initVideoRenderer(localRenderer!!)
                track.addRenderer(localRenderer!!)
                mountBehindWebView(localRenderer!!)
                call.resolve()
            } catch (e: Exception) {
                call.reject("attachLocal failed: ${e.message}")
            }
        }
    }

    @PluginMethod
    fun attachRemote(call: PluginCall) {
        val sid = call.getString("sid") ?: return call.reject("sid required")
        val r = room ?: return call.reject("Not connected")
        activity?.runOnUiThread {
            try {
                val participant = r.remoteParticipants.values.firstOrNull {
                    it.sid.value == sid
                } ?: return@runOnUiThread call.reject("Participant not found")
                val track = participant.getTrackPublication(Track.Source.CAMERA)
                    ?.track as? io.livekit.android.room.track.VideoTrack
                    ?: return@runOnUiThread call.reject("No remote camera track")

                val renderer = remoteRenderers.getOrPut(sid) { createRenderer() }
                r.initVideoRenderer(renderer)
                track.addRenderer(renderer)
                mountBehindWebView(renderer)
                call.resolve()
            } catch (e: Exception) {
                call.reject("attachRemote failed: ${e.message}")
            }
        }
    }

    @PluginMethod
    fun detachAll(call: PluginCall) {
        activity?.runOnUiThread {
            detachAllRenderersInternal()
            call.resolve()
        }
    }

    // ------------------------------------------------------------
    // Internals
    // ------------------------------------------------------------

    @PermissionCallback
    private fun permsCallback(call: PluginCall) {
        if (getPermissionState("camera") == PermissionState.GRANTED &&
            getPermissionState("microphone") == PermissionState.GRANTED
        ) connect(call) else call.reject("Camera/Microphone permission denied")
    }

    private fun attachEventListeners(r: Room) {
        eventJob?.cancel()
        eventJob = scope.launch {
            r.events.collect { event ->
                when (event) {
                    is RoomEvent.ParticipantConnected ->
                        emit("participant-connected", event.participant)
                    is RoomEvent.ParticipantDisconnected ->
                        emit("participant-disconnected", event.participant)
                    is RoomEvent.TrackSubscribed -> {
                        val data = JSObject()
                        data.put("sid", event.participant.sid?.value ?: "")
                        data.put("identity", event.participant.identity?.value ?: "")
                        data.put("kind", event.track.kind.name.lowercase())
                        notifyListeners("track-subscribed", data)
                    }
                    is RoomEvent.TrackUnsubscribed -> {
                        val data = JSObject()
                        data.put("sid", event.participant.sid?.value ?: "")
                        data.put("identity", event.participant.identity?.value ?: "")
                        data.put("kind", event.track.kind.name.lowercase())
                        notifyListeners("track-unsubscribed", data)
                    }
                    is RoomEvent.Disconnected -> {
                        val data = JSObject()
                        data.put("reason", event.reason?.name ?: "UNKNOWN")
                        notifyListeners("disconnected", data)
                    }
                    is RoomEvent.ConnectionQualityChanged -> {
                        val data = JSObject()
                        data.put("sid", event.participant.sid?.value ?: "")
                        data.put("quality", event.quality.name.lowercase())
                        notifyListeners("connection-quality", data)
                    }
                    else -> { /* ignore */ }
                }
            }
        }
    }

    private fun emit(name: String, p: io.livekit.android.room.participant.Participant) {
        val data = JSObject()
        data.put("sid", p.sid?.value ?: "")
        data.put("identity", p.identity?.value ?: "")
        data.put("isRemote", p is RemoteParticipant)
        notifyListeners(name, data)
    }

    private fun createRenderer(): TextureViewRenderer {
        val renderer = TextureViewRenderer(context)
        renderer.setEnableHardwareScaler(true)
        return renderer
    }

    private fun mountBehindWebView(renderer: TextureViewRenderer) {
        val webView = bridge?.webView ?: return
        val root = webView.parent as? ViewGroup ?: return
        if (renderer.parent == null) {
            val lp = FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.MATCH_PARENT
            )
            root.addView(renderer, 0, lp)
            webView.setBackgroundColor(0x00000000)
        }
    }

    private fun detachAllRenderersInternal() {
        val webView = bridge?.webView
        localRenderer?.let { (it.parent as? ViewGroup)?.removeView(it); it.release() }
        localRenderer = null
        remoteRenderers.values.forEach {
            (it.parent as? ViewGroup)?.removeView(it); it.release()
        }
        remoteRenderers.clear()
        webView?.setBackgroundColor(0xFF000000.toInt())
    }

    override fun handleOnDestroy() {
        super.handleOnDestroy()
        try {
            eventJob?.cancel()
            scope.launch { room?.disconnect() }
        } catch (_: Exception) {}
    }
}
