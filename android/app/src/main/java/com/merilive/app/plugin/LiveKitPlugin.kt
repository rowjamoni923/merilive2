package com.merilive.app.plugin

import android.Manifest
import android.content.Context
import android.content.Intent
import android.media.AudioDeviceInfo
import android.media.AudioManager
import android.os.Build
import android.os.PowerManager
import com.merilive.app.service.CallForegroundService
import android.util.Log
import android.view.ViewGroup
import android.view.WindowManager
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
import io.livekit.android.room.participant.ConnectionQuality
import io.livekit.android.room.participant.RemoteParticipant
import io.livekit.android.room.participant.VideoTrackPublishOptions
import io.livekit.android.room.track.CameraPosition
import io.livekit.android.room.track.LocalVideoTrack
import io.livekit.android.room.track.LocalVideoTrackOptions
import io.livekit.android.room.track.Track
import io.livekit.android.room.track.VideoCaptureParameter
import io.livekit.android.room.track.VideoEncoding
import io.livekit.android.room.track.VideoPreset169
import io.livekit.android.room.track.VideoTrackPublishDefaults
import io.livekit.android.e2ee.BaseKeyProvider
import io.livekit.android.e2ee.E2EEOptions
import io.livekit.android.room.participant.RemoteTrackPublication
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import org.webrtc.VideoFrame
import org.webrtc.VideoSink

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

    companion object {
        private const val TAG = "LiveKitPlugin"
        // Step 25 — stall watchdog tunables.
        private const val STALL_POLL_MS = 2_000L
        private const val STALL_WARN_MS = 5_000L
        private const val STALL_HARD_MS = 12_000L
        private const val STALL_RECOVERY_COOLDOWN_MS = 6_000L
    }

    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Main)
    private var eventJob: Job? = null
    private var room: Room? = null

    private var localRenderer: TextureViewRenderer? = null
    private val remoteRenderers = mutableMapOf<String, TextureViewRenderer>()

    // --- Audio routing state (Step 11) -----------------------------
    private var savedAudioMode: Int = AudioManager.MODE_NORMAL
    private var savedSpeakerphoneOn: Boolean = false
    private var audioModeApplied: Boolean = false
    private var proximityWakeLock: PowerManager.WakeLock? = null

    // --- Audio focus + interruption state (Step 15) ---------------
    private var audioFocusRequest: android.media.AudioFocusRequest? = null
    private var audioFocusListener: AudioManager.OnAudioFocusChangeListener? = null
    private var hasAudioFocus: Boolean = false
    /** True when we ducked/paused mic ourselves due to a transient loss; resume on regain. */
    private var micPausedByFocusLoss: Boolean = false
    /** Snapshot of user's mic intent before interruption, restored on focus regain. */
    private var micIntentBeforeLoss: Boolean = true

    // --- Adaptive bitrate fallback state (Step 22) -----------------
    //
    // Simulcast handles per-VIEWER adaptation server-side (SFU drops layers
    // for slow viewers). This state handles per-PUBLISHER uplink adaptation:
    // when our own ConnectionQuality drops to POOR we step the published
    // camera ladder down (1080p→720p→540p) so the broadcast keeps flowing
    // even on a 3G/EDGE / congested wifi uplink. On sustained EXCELLENT
    // we step back up. Republishes through unpublishTrack + publishVideoTrack.
    private enum class AdaptiveTier { HIGH, MEDIUM, LOW }
    private var adaptiveEnabled: Boolean = true
    private var currentTier: AdaptiveTier = AdaptiveTier.HIGH
    private var baseTier: AdaptiveTier = AdaptiveTier.HIGH
    private var baseLens: CameraPosition = CameraPosition.FRONT
    private var consecutiveExcellent: Int = 0
    private var lastTierChangeMs: Long = 0L
    private var adaptiveBusy: Boolean = false

    // --- End-to-end encryption (Step 23) -------------------------
    //
    // LiveKit Insertable-Streams E2EE — frames are AES-GCM encrypted with
    // a shared key BEFORE leaving the publisher's WebRTC encoder, and
    // decrypted only on subscriber devices that hold the same key. The
    // SFU forwards opaque ciphertext, so neither LiveKit Cloud nor any
    // network observer can decode the media. Used for 1:1 Private Calls
    // where both peers derive the key from the call session id.
    private var e2eeKeyProvider: BaseKeyProvider? = null
    private var e2eeEnabled: Boolean = false
    private var e2eeKey: String? = null

    // --- Lifecycle hardening (Step 24) ---------------------------
    //
    // When the host backgrounds the app:
    //  • Renderer surfaces are DETACHED (removed from the WebView parent)
    //    so Android stops compositing them — instant ~30-60% GPU savings
    //    on mid-tier devices. The TextureViewRenderer itself + its
    //    underlying RTCVideoTrack stay alive so re-attach is instant.
    //  • Camera capture stays ON by default (CallForegroundService keeps
    //    the broadcast alive — same as Instagram Live / Bigo).
    //  • If `pauseCameraOnBackground` is set (privacy mode for 1:1
    //    Private Calls), the camera track is also disabled and remembered
    //    so it can be re-enabled on resume.
    //  • Mic stays on always — no one wants their audio muted just because
    //    they pulled down the notification shade.
    private var pauseCameraOnBackground: Boolean = false
    private var inBackground: Boolean = false
    private var cameraOnBeforeBackground: Boolean = false

    // --- Stall & black-frame recovery (Step 25) ------------------
    //
    // Watchdog tracks "last decoded frame timestamp" per attached video
    // track via a tiny VideoSink wrapper installed alongside the renderer.
    // Every 2 s a coroutine inspects the table:
    //   • > STALL_WARN_MS (5 s) without a frame → emit "video-stall" and
    //     attempt soft recovery (remote: unsubscribe + resubscribe;
    //     local: stop+start capture).
    //   • > STALL_HARD_MS (12 s) and recovery already attempted twice →
    //     emit "video-stall-failed" so JS can show a banner / fall back.
    // Counters reset on every successful frame and on attach/detach.
    private data class StallEntry(
        var lastFrameMs: Long,
        var attempts: Int,
        var lastAttemptMs: Long,
        val isLocal: Boolean,
        val sid: String, // participant sid; "local" for our own preview
    )
    private val stallTable = mutableMapOf<String, StallEntry>()
    private val stallSinks = mutableMapOf<String, VideoSink>()
    private var stallWatchdogJob: Job? = null
    private var stallWatchdogEnabled: Boolean = true

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
        val callerName = call.getString("callerName", "") ?: ""
        val callType = call.getString("callType", if (enableVideo) "Video Call" else "Voice Call")
            ?: if (enableVideo) "Video Call" else "Voice Call"

        // Step 23 — optional E2EE for 1:1 Private Calls. Both peers must
        // pass the SAME e2eeKey (typically derived from the call session id
        // via the signalling channel). When omitted, the room is plain.
        val e2eeOn = call.getBoolean("e2eeEnabled", false) ?: false
        val e2eeSharedKey = call.getString("e2eeKey", null)

        scope.launch {
            try {
                // Tear down any previous room first.
                room?.disconnect()
                room = null

                // Step 22 — reset adaptive ladder for this fresh session.
                baseTier = if (resolution == "720p") AdaptiveTier.MEDIUM else AdaptiveTier.HIGH
                currentTier = baseTier
                baseLens = if (lens == "back") CameraPosition.BACK else CameraPosition.FRONT
                consecutiveExcellent = 0
                lastTierChangeMs = 0L
                adaptiveBusy = false

                val captureParams: VideoCaptureParameter = if (resolution == "720p") {
                    VideoPreset169.H720.capture
                } else {
                    VideoPreset169.H1080.capture
                }

                val cameraPosition =
                    if (lens == "back") CameraPosition.BACK else CameraPosition.FRONT

                // Step 20 — explicit publish encoding ladder.
                // 1080p/30fps live: 4 Mbps top layer + simulcast for viewer adaptation.
                // 720p call:        2 Mbps single layer (no simulcast — peer-to-peer).
                val publishEncoding: VideoEncoding = if (resolution == "720p") {
                    VideoEncoding(maxBitrate = 2_000_000, maxFps = 30)
                } else {
                    VideoEncoding(maxBitrate = 4_000_000, maxFps = 30)
                }
                val publishDefaults = VideoTrackPublishDefaults(
                    videoEncoding = publishEncoding,
                    simulcast = (resolution != "720p"),
                )

                // Step 23 — build the E2EE key provider once per session.
                val e2eeOptions: E2EEOptions? = if (e2eeOn && !e2eeSharedKey.isNullOrBlank()) {
                    val provider = BaseKeyProvider()
                    provider.setSharedKey(e2eeSharedKey)
                    e2eeKeyProvider = provider
                    e2eeKey = e2eeSharedKey
                    e2eeEnabled = true
                    E2EEOptions(keyProvider = provider)
                } else {
                    e2eeKeyProvider = null
                    e2eeKey = null
                    e2eeEnabled = false
                    null
                }

                val roomOptions = RoomOptions(
                    adaptiveStream = true,
                    dynacast = true,
                    videoTrackCaptureDefaults = LocalVideoTrackOptions(
                        position = cameraPosition,
                        captureParams = captureParams
                    ),
                    videoTrackPublishDefaults = publishDefaults,
                    e2eeOptions = e2eeOptions,
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

                // Keep screen on for the duration of the live/call session.
                setKeepScreenOn(true)

                // Apply communication audio mode + default routing:
                //  - video session  → speaker ON, no proximity (Live broadcast / video call)
                //  - audio-only call → speaker OFF (earpiece), proximity ON
                applyAudioMode(true)
                setSpeakerphoneInternal(enableVideo)
                setProximityMonitoringInternal(!enableVideo)
                registerAudioDeviceListener()

                // Step 15 — request VoIP audio focus so an incoming PSTN
                // call / alarm / other media auto-pauses our mic, then
                // resumes when focus comes back. Track user mic intent.
                micIntentBeforeLoss = enableAudio
                requestAudioFocusInternal()

                // Step 14 — promote process to a foreground service so Android
                // 14+ keeps mic/camera alive when the user backgrounds the app.
                startCallForegroundService(callerName, callType)

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
                setKeepScreenOn(false)
                setProximityMonitoringInternal(false)
                applyAudioMode(false)
                unregisterAudioDeviceListener()
                abandonAudioFocusInternal()
                stopCallForegroundService()
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
                // Step 15 — remember user intent so we can restore it after
                // an interruption (PSTN call, alarm) ends.
                micIntentBeforeLoss = enabled
                micPausedByFocusLoss = false
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

    // ------------------------------------------------------------
    // Step 21 — Beauty pipeline (DeepAR) ↔ LiveKit camera bridge.
    //
    // The DeepAR plugin owns its own Camera2 capture surface and runs the
    // GL beauty/AR effect pipeline. Both DeepAR and LiveKit cannot hold the
    // physical camera at the same time, so this method coordinates handoff:
    //
    //   setBeautyPipelineEnabled({ enabled: true })
    //     → LiveKit unpublishes & releases its camera track. DeepAR plugin
    //       (called separately from JS) opens the camera, processes frames,
    //       and pushes them into LiveKit via the shared external-frame
    //       channel registered by BeautyPipelineBridge.
    //
    //   setBeautyPipelineEnabled({ enabled: false })
    //     → DeepAR releases the camera (called by JS). LiveKit re-publishes
    //       its native camera track at the previously requested resolution.
    //
    // The actual GL texture / NV21 frame transport is implemented inside
    // BeautyPipelineBridge (singleton) which DeepARPlugin pushes to and
    // LiveKit's custom VideoCapturer pulls from. This method only handles
    // the ownership flip — keeping the contract small and race-safe.
    // ------------------------------------------------------------
    @PluginMethod
    fun setBeautyPipelineEnabled(call: PluginCall) {
        val enabled = call.getBoolean("enabled", false) ?: false
        val r = room
        scope.launch {
            try {
                BeautyPipelineBridge.setEnabled(enabled)
                if (r != null) {
                    // Flip LiveKit's camera ownership: when beauty is on we
                    // mute the native camera track so DeepAR can use the
                    // device; when beauty is off we re-enable it so LiveKit
                    // resumes its own capture.
                    r.localParticipant.setCameraEnabled(!enabled)
                }
                val ret = JSObject()
                ret.put("enabled", enabled)
                ret.put("hasRoom", r != null)
                call.resolve(ret)
            } catch (e: Exception) {
                call.reject("setBeautyPipelineEnabled failed: ${e.message}")
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
                installStallSink(track, key = "local", sid = "local", isLocal = true)
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
                installStallSink(track, key = sid, sid = sid, isLocal = false)
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

    // --- Audio routing API (Step 11) -------------------------------

    @PluginMethod
    fun setSpeakerphoneEnabled(call: PluginCall) {
        val enabled = call.getBoolean("enabled", true) ?: true
        try {
            setSpeakerphoneInternal(enabled)
            val ret = JSObject(); ret.put("speakerphone", enabled); call.resolve(ret)
        } catch (e: Exception) {
            call.reject("setSpeakerphoneEnabled failed: ${e.message}")
        }
    }

    @PluginMethod
    fun setProximityMonitoring(call: PluginCall) {
        val enabled = call.getBoolean("enabled", false) ?: false
        try {
            setProximityMonitoringInternal(enabled)
            val ret = JSObject(); ret.put("proximity", enabled); call.resolve(ret)
        } catch (e: Exception) {
            call.reject("setProximityMonitoring failed: ${e.message}")
        }
    }

    @PluginMethod
    fun setAudioMode(call: PluginCall) {
        // mode: "voice" → earpiece + proximity ON; "video" → speaker ON, proximity OFF; "none" → restore
        val mode = call.getString("mode", "video") ?: "video"
        try {
            when (mode) {
                "voice" -> {
                    applyAudioMode(true)
                    setSpeakerphoneInternal(false)
                    setProximityMonitoringInternal(true)
                }
                "video" -> {
                    applyAudioMode(true)
                    setSpeakerphoneInternal(true)
                    setProximityMonitoringInternal(false)
                }
                "none", "off", "restore" -> {
                    setProximityMonitoringInternal(false)
                    applyAudioMode(false)
                }
                else -> { call.reject("Unknown mode: $mode"); return }
            }
            val ret = JSObject(); ret.put("mode", mode); call.resolve(ret)
        } catch (e: Exception) {
            call.reject("setAudioMode failed: ${e.message}")
        }
    }

    // --- Audio device routing (Step 13) ----------------------------

    /**
     * Returns currently available communication audio devices and the
     * type that is actively routed. Lets the JS UI render a "speaker /
     * earpiece / Bluetooth / wired headset" picker like real phone apps.
     */
    @PluginMethod
    fun getAudioDevices(call: PluginCall) {
        try {
            val ret = JSObject()
            val list = org.json.JSONArray()
            val am = audioManager()
            if (am != null && Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                am.availableCommunicationDevices.forEach { d ->
                    val o = JSObject()
                    o.put("id", d.id)
                    o.put("type", audioDeviceTypeName(d.type))
                    o.put("name", d.productName?.toString() ?: audioDeviceTypeName(d.type))
                    list.put(o)
                }
                ret.put("active", audioDeviceTypeName(am.communicationDevice?.type ?: -1))
            } else {
                // Legacy fallback: only earpiece/speaker known.
                listOf("earpiece", "speaker").forEach { name ->
                    val o = JSObject(); o.put("id", -1); o.put("type", name); o.put("name", name); list.put(o)
                }
                @Suppress("DEPRECATION")
                ret.put("active", if (am?.isSpeakerphoneOn == true) "speaker" else "earpiece")
            }
            ret.put("devices", list)
            call.resolve(ret)
        } catch (e: Exception) {
            call.reject("getAudioDevices failed: ${e.message}")
        }
    }

    /**
     * Route audio to a specific device class. Accepted values:
     *   "bluetooth" | "wired" | "speaker" | "earpiece"
     */
    @PluginMethod
    fun setAudioDevice(call: PluginCall) {
        val type = call.getString("type") ?: return call.reject("type required")
        try {
            val ok = setAudioDeviceInternal(type)
            val ret = JSObject(); ret.put("type", type); ret.put("applied", ok)
            call.resolve(ret)
        } catch (e: Exception) {
            call.reject("setAudioDevice failed: ${e.message}")
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
                        data.put("sid", event.participant.sid.value)
                        data.put("identity", event.participant.identity?.value ?: "")
                        data.put("kind", event.track.kind.name.lowercase())
                        notifyListeners("track-subscribed", data)
                    }
                    is RoomEvent.TrackUnsubscribed -> {
                        val data = JSObject()
                        data.put("sid", event.participant.sid.value)
                        data.put("identity", event.participant.identity?.value ?: "")
                        data.put("kind", event.track.kind.name.lowercase())
                        notifyListeners("track-unsubscribed", data)
                    }
                    is RoomEvent.Disconnected -> {
                        val data = JSObject()
                        data.put("reason", event.reason.name)
                        event.error?.let { data.put("error", it.message ?: it.javaClass.simpleName) }
                        notifyListeners("disconnected", data)
                        // Server-initiated / network drop — release the screen-on flag too.
                        setKeepScreenOn(false)
                    }
                    is RoomEvent.ConnectionQualityChanged -> {
                        val data = JSObject()
                        data.put("sid", event.participant.sid.value)
                        data.put("quality", event.quality.name.lowercase())
                        notifyListeners("connection-quality", data)

                        // Step 22 — react ONLY to our own uplink quality.
                        if (event.participant == r.localParticipant) {
                            handleLocalQuality(event.quality)
                        }
                    }
                    // Step 16 — connection lifecycle so JS can show
                    // "Reconnecting…" / "Reconnected" UI like WhatsApp.
                    is RoomEvent.Reconnecting -> {
                        val data = JSObject()
                        data.put("state", "reconnecting")
                        notifyListeners("connection-state", data)
                    }
                    is RoomEvent.Reconnected -> {
                        val data = JSObject()
                        data.put("state", "reconnected")
                        notifyListeners("connection-state", data)
                        // Re-apply our communication audio mode in case
                        // the OS reset it during the network drop.
                        applyAudioMode(true)
                    }
                    else -> { /* ignore */ }
                }
            }
        }
    }

    private fun emit(name: String, p: io.livekit.android.room.participant.Participant) {
        val data = JSObject()
        data.put("sid", p.sid.value)
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

    // ------------------------------------------------------------
    // Adaptive bitrate fallback (Step 22)
    //
    // ConnectionQuality buckets from the SFU:
    //   EXCELLENT > GOOD > POOR > LOST
    // We only react to LOCAL participant quality (our uplink). Step
    // changes are debounced 8 s to avoid thrash. Republishes the camera
    // track with a smaller VideoCaptureParameter + lower VideoEncoding
    // so the encoder + uplink stop saturating. Simulcast is preserved
    // for HIGH/MEDIUM (live), disabled at LOW (single small layer).
    // ------------------------------------------------------------

    private fun tierCapture(t: AdaptiveTier): VideoCaptureParameter = when (t) {
        AdaptiveTier.HIGH   -> VideoPreset169.H1080.capture
        AdaptiveTier.MEDIUM -> VideoPreset169.H720.capture
        AdaptiveTier.LOW    -> VideoPreset169.H540.capture
    }

    private fun tierEncoding(t: AdaptiveTier): VideoEncoding = when (t) {
        AdaptiveTier.HIGH   -> VideoEncoding(maxBitrate = 4_000_000, maxFps = 30)
        AdaptiveTier.MEDIUM -> VideoEncoding(maxBitrate = 1_800_000, maxFps = 30)
        AdaptiveTier.LOW    -> VideoEncoding(maxBitrate =   700_000, maxFps = 24)
    }

    private fun handleLocalQuality(quality: ConnectionQuality) {
        if (!adaptiveEnabled) return
        val now = System.currentTimeMillis()
        // 8 s debounce — uplink probes are noisy.
        if (now - lastTierChangeMs < 8_000L) return
        when (quality) {
            ConnectionQuality.POOR, ConnectionQuality.LOST -> {
                consecutiveExcellent = 0
                val next = when (currentTier) {
                    AdaptiveTier.HIGH   -> AdaptiveTier.MEDIUM
                    AdaptiveTier.MEDIUM -> AdaptiveTier.LOW
                    AdaptiveTier.LOW    -> return // already at floor
                }
                applyAdaptiveTier(next, "downgrade")
            }
            ConnectionQuality.EXCELLENT -> {
                consecutiveExcellent++
                if (consecutiveExcellent < 2) return
                if (currentTier == baseTier) return // already at ceiling
                val next = when (currentTier) {
                    AdaptiveTier.LOW    -> AdaptiveTier.MEDIUM
                    AdaptiveTier.MEDIUM -> AdaptiveTier.HIGH
                    AdaptiveTier.HIGH   -> return
                }
                // Never climb above the session ceiling (e.g. 720p calls stay ≤ MEDIUM).
                if (next.ordinal < baseTier.ordinal) return
                applyAdaptiveTier(next, "upgrade")
            }
            else -> { consecutiveExcellent = 0 }
        }
    }

    private fun applyAdaptiveTier(target: AdaptiveTier, reason: String) {
        val r = room ?: return
        if (adaptiveBusy) return
        adaptiveBusy = true
        lastTierChangeMs = System.currentTimeMillis()
        scope.launch {
            try {
                val pub = r.localParticipant.getTrackPublication(Track.Source.CAMERA)
                val oldTrack = pub?.track as? LocalVideoTrack
                if (oldTrack == null) {
                    // Camera not currently published (mic-only call) — nothing to do.
                    currentTier = target
                    return@launch
                }
                val newCapture = tierCapture(target)
                val newEncoding = tierEncoding(target)
                val simulcast = (target != AdaptiveTier.LOW) // drop simulcast at floor
                val newOptions = LocalVideoTrackOptions(
                    position = baseLens,
                    captureParams = newCapture
                )
                // Stop + unpublish the old track, then create + publish a fresh one.
                try { oldTrack.stopCapture() } catch (_: Exception) {}
                r.localParticipant.unpublishTrack(oldTrack)

                val newTrack = r.localParticipant.createVideoTrack(options = newOptions)
                newTrack.startCapture()
                r.localParticipant.publishVideoTrack(
                    track = newTrack,
                    options = VideoTrackPublishOptions(
                        videoEncoding = newEncoding,
                        simulcast = simulcast,
                    )
                )
                currentTier = target
                Log.i(TAG, "Adaptive tier $reason → ${target.name} (simulcast=$simulcast)")

                val data = JSObject()
                data.put("tier", target.name.lowercase())
                data.put("reason", reason)
                data.put("simulcast", simulcast)
                data.put("maxBitrate", newEncoding.maxBitrate)
                notifyListeners("adaptive-tier", data)
            } catch (e: Exception) {
                Log.e(TAG, "applyAdaptiveTier failed", e)
            } finally {
                adaptiveBusy = false
            }
        }
    }

    @PluginMethod
    fun setAdaptiveBitrateEnabled(call: PluginCall) {
        val enabled = call.getBoolean("enabled", true) ?: true
        adaptiveEnabled = enabled
        if (!enabled) {
            consecutiveExcellent = 0
            // Snap back to the session ceiling immediately.
            if (currentTier != baseTier && room != null) applyAdaptiveTier(baseTier, "manual-restore")
        }
        val ret = JSObject()
        ret.put("enabled", enabled)
        ret.put("tier", currentTier.name.lowercase())
        call.resolve(ret)
    }

    @PluginMethod
    fun getAdaptiveTier(call: PluginCall) {
        val ret = JSObject()
        ret.put("enabled", adaptiveEnabled)
        ret.put("tier", currentTier.name.lowercase())
        ret.put("base", baseTier.name.lowercase())
        call.resolve(ret)
    }

    // ------------------------------------------------------------
    // End-to-end encryption (Step 23)
    //
    // Public API:
    //   isE2EESupported()              → { supported: true, algorithm }
    //   setE2EEKey({ key })            → rotate the AES-GCM shared key
    //                                    (call after both peers have agreed
    //                                    on the new key over the signalling
    //                                    channel; old frames stay decryptable
    //                                    via the previous key for ~10 s).
    //   setE2EEEnabled({ enabled })    → toggle insertable-streams crypto
    //                                    on the live room without reconnecting.
    //   getE2EEStatus()                → { enabled, hasKey }
    // ------------------------------------------------------------

    @PluginMethod
    fun isE2EESupported(call: PluginCall) {
        val ret = JSObject()
        ret.put("supported", true)
        ret.put("algorithm", "AES-GCM-128")
        call.resolve(ret)
    }

    @PluginMethod
    fun setE2EEKey(call: PluginCall) {
        val key = call.getString("key")
        if (key.isNullOrBlank()) {
            call.reject("key is required")
            return
        }
        scope.launch {
            try {
                val provider = e2eeKeyProvider ?: BaseKeyProvider().also { e2eeKeyProvider = it }
                provider.setSharedKey(key)
                e2eeKey = key
                // If the room is already live, the new key takes effect on the
                // next outgoing frame; subscribers must rotate at the same time.
                room?.e2eeManager?.keyProvider = provider
                val ret = JSObject()
                ret.put("rotated", true)
                call.resolve(ret)
            } catch (e: Exception) {
                Log.e(TAG, "setE2EEKey failed", e)
                call.reject("setE2EEKey failed: ${e.message}")
            }
        }
    }

    @PluginMethod
    fun setE2EEEnabled(call: PluginCall) {
        val enabled = call.getBoolean("enabled", true) ?: true
        val r = room
        scope.launch {
            try {
                if (enabled && e2eeKeyProvider == null) {
                    call.reject("E2EE key not set — call setE2EEKey first")
                    return@launch
                }
                // SDK exposes Room#setE2EEEnabled(boolean) on rooms created with E2EEOptions.
                try {
                    r?.javaClass?.getMethod("setE2EEEnabled", Boolean::class.javaPrimitiveType)
                        ?.invoke(r, enabled)
                } catch (_: NoSuchMethodException) {
                    // Older SDKs may expose enable() on the manager directly.
                    r?.e2eeManager?.let {
                        try {
                            it.javaClass.getMethod("enableE2EE", Boolean::class.javaPrimitiveType)
                                .invoke(it, enabled)
                        } catch (_: NoSuchMethodException) {}
                    }
                }
                e2eeEnabled = enabled
                val ret = JSObject()
                ret.put("enabled", enabled)
                call.resolve(ret)
            } catch (e: Exception) {
                Log.e(TAG, "setE2EEEnabled failed", e)
                call.reject("setE2EEEnabled failed: ${e.message}")
            }
        }
    }

    @PluginMethod
    fun getE2EEStatus(call: PluginCall) {
        val ret = JSObject()
        ret.put("enabled", e2eeEnabled)
        ret.put("hasKey", e2eeKey != null)
        ret.put("hasRoom", room != null)
        call.resolve(ret)
    }

    // ------------------------------------------------------------
    // Lifecycle hardening (Step 24)
    //
    // Capacitor delivers Activity onPause/onResume. We use them to free
    // GPU compositor work and (optionally) stop publishing camera while
    // the host is not visible — without ever tearing the room down.
    // ------------------------------------------------------------

    @PluginMethod
    fun setPauseCameraOnBackground(call: PluginCall) {
        pauseCameraOnBackground = call.getBoolean("enabled", false) ?: false
        val ret = JSObject()
        ret.put("enabled", pauseCameraOnBackground)
        call.resolve(ret)
    }

    override fun handleOnPause() {
        super.handleOnPause()
        if (room == null) return
        inBackground = true
        try {
            localRenderer?.let { (it.parent as? ViewGroup)?.removeView(it) }
            remoteRenderers.values.forEach { (it.parent as? ViewGroup)?.removeView(it) }
            bridge?.webView?.setBackgroundColor(0xFF000000.toInt())

            if (pauseCameraOnBackground) {
                val r = room ?: return
                val pub = r.localParticipant.getTrackPublication(Track.Source.CAMERA)
                cameraOnBeforeBackground = (pub?.track != null) && !(pub.muted)
                if (cameraOnBeforeBackground) {
                    scope.launch {
                        try { r.localParticipant.setCameraEnabled(false) }
                        catch (e: Exception) { Log.w(TAG, "pause camera failed: ${e.message}") }
                    }
                }
            }
        } catch (e: Exception) {
            Log.w(TAG, "handleOnPause cleanup failed", e)
        }
    }

    override fun handleOnResume() {
        super.handleOnResume()
        if (room == null) return
        if (!inBackground) return
        inBackground = false
        try {
            localRenderer?.let { mountBehindWebView(it) }
            remoteRenderers.values.forEach { mountBehindWebView(it) }

            if (pauseCameraOnBackground && cameraOnBeforeBackground) {
                val r = room ?: return
                scope.launch {
                    try { r.localParticipant.setCameraEnabled(true) }
                    catch (e: Exception) { Log.w(TAG, "resume camera failed: ${e.message}") }
                }
            }
            cameraOnBeforeBackground = false
        } catch (e: Exception) {
            Log.w(TAG, "handleOnResume restore failed", e)
        }
    }

    override fun handleOnDestroy() {
        super.handleOnDestroy()
        try {
            eventJob?.cancel()
            scope.launch { room?.disconnect() }
            setKeepScreenOn(false)
            setProximityMonitoringInternal(false)
            applyAudioMode(false)
            unregisterAudioDeviceListener()
            abandonAudioFocusInternal()
            stopCallForegroundService()
        } catch (_: Exception) {}
    }

    // ------------------------------------------------------------
    // Audio focus + interruption handling (Step 15)
    //
    // When an incoming PSTN call / alarm / other media app takes audio
    // focus mid-session, Android delivers AUDIOFOCUS_LOSS_TRANSIENT
    // (or _LOSS for permanent steal). We pause our mic immediately and
    // restore it on AUDIOFOCUS_GAIN — exact WhatsApp / Messenger parity.
    // ------------------------------------------------------------

    private fun requestAudioFocusInternal() {
        val am = audioManager() ?: return
        if (hasAudioFocus) return
        try {
            val listener = AudioManager.OnAudioFocusChangeListener { change ->
                handleAudioFocusChange(change)
            }
            audioFocusListener = listener

            val granted = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                val attrs = android.media.AudioAttributes.Builder()
                    .setUsage(android.media.AudioAttributes.USAGE_VOICE_COMMUNICATION)
                    .setContentType(android.media.AudioAttributes.CONTENT_TYPE_SPEECH)
                    .build()
                val req = android.media.AudioFocusRequest.Builder(
                        AudioManager.AUDIOFOCUS_GAIN_TRANSIENT_MAY_DUCK
                    )
                    .setAudioAttributes(attrs)
                    .setAcceptsDelayedFocusGain(true)
                    .setWillPauseWhenDucked(true)
                    .setOnAudioFocusChangeListener(listener)
                    .build()
                audioFocusRequest = req
                am.requestAudioFocus(req)
            } else {
                @Suppress("DEPRECATION")
                am.requestAudioFocus(
                    listener,
                    AudioManager.STREAM_VOICE_CALL,
                    AudioManager.AUDIOFOCUS_GAIN_TRANSIENT_MAY_DUCK
                )
            }
            hasAudioFocus = granted == AudioManager.AUDIOFOCUS_REQUEST_GRANTED
            if (!hasAudioFocus) {
                Log.w(TAG, "requestAudioFocus not granted (=$granted) — continuing anyway")
            }
        } catch (e: Exception) {
            Log.w(TAG, "requestAudioFocusInternal failed: ${e.message}")
        }
    }

    private fun abandonAudioFocusInternal() {
        val am = audioManager() ?: return
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                audioFocusRequest?.let { am.abandonAudioFocusRequest(it) }
            } else {
                @Suppress("DEPRECATION")
                audioFocusListener?.let { am.abandonAudioFocus(it) }
            }
        } catch (e: Exception) {
            Log.w(TAG, "abandonAudioFocusInternal failed: ${e.message}")
        }
        audioFocusRequest = null
        audioFocusListener = null
        hasAudioFocus = false
        micPausedByFocusLoss = false
    }

    private fun handleAudioFocusChange(change: Int) {
        val r = room ?: return
        when (change) {
            AudioManager.AUDIOFOCUS_LOSS,
            AudioManager.AUDIOFOCUS_LOSS_TRANSIENT,
            AudioManager.AUDIOFOCUS_LOSS_TRANSIENT_CAN_DUCK -> {
                // Pause our mic so the interrupting app (PSTN call,
                // alarm, voice assistant) gets clean audio. We do NOT
                // overwrite micIntentBeforeLoss here — it already reflects
                // the user's last explicit choice from connect() /
                // setMicrophoneEnabled() and is what we restore on GAIN.
                if (!micPausedByFocusLoss) {
                    micPausedByFocusLoss = true
                    scope.launch {
                        try { r.localParticipant.setMicrophoneEnabled(false) }
                        catch (_: Exception) {}
                    }
                }
                emitAudioInterruption("loss", change == AudioManager.AUDIOFOCUS_LOSS)
            }
            AudioManager.AUDIOFOCUS_GAIN -> {
                if (micPausedByFocusLoss) {
                    micPausedByFocusLoss = false
                    val restore = micIntentBeforeLoss
                    scope.launch {
                        try { r.localParticipant.setMicrophoneEnabled(restore) }
                        catch (_: Exception) {}
                    }
                }
                // Re-apply our communication audio mode in case it was reset.
                applyAudioMode(true)
                emitAudioInterruption("gain", false)
            }
        }
    }

    private fun emitAudioInterruption(state: String, permanent: Boolean) {
        try {
            val data = JSObject()
            data.put("state", state)         // "loss" | "gain"
            data.put("permanent", permanent) // true only for AUDIOFOCUS_LOSS
            notifyListeners("audio-interruption", data)
        } catch (_: Exception) {}
    }

    // ------------------------------------------------------------
    // Foreground Service lifecycle (Step 14)
    //
    // Android 14+ kills mic / camera the moment the app is backgrounded
    // unless a foreground service of type microphone|camera|phoneCall is
    // running. We start CallForegroundService on connect() and stop it on
    // disconnect()/destroy so Live + Private Call survive backgrounding,
    // exactly like WhatsApp / Messenger.
    // ------------------------------------------------------------

    private fun startCallForegroundService(callerName: String, callType: String) {
        val ctx = context ?: return
        try {
            val intent = Intent(ctx, CallForegroundService::class.java).apply {
                action = CallForegroundService.ACTION_START
                putExtra("caller_name", callerName.ifBlank { "Live session" })
                putExtra("call_type", callType.ifBlank { "Call" })
            }
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                ctx.startForegroundService(intent)
            } else {
                ctx.startService(intent)
            }
        } catch (e: Exception) {
            Log.w(TAG, "startCallForegroundService failed: ${e.message}")
        }
    }

    private fun stopCallForegroundService() {
        val ctx = context ?: return
        try {
            val intent = Intent(ctx, CallForegroundService::class.java).apply {
                action = CallForegroundService.ACTION_STOP
            }
            ctx.startService(intent)
        } catch (e: Exception) {
            Log.w(TAG, "stopCallForegroundService failed: ${e.message}")
        }
    }

    /**
     * Toggles FLAG_KEEP_SCREEN_ON on the host Activity window so Android
     * does not dim or lock the screen while a live broadcast / private
     * call session is active. Always dispatched to the UI thread.
     */
    private fun setKeepScreenOn(on: Boolean) {
        val act = activity ?: return
        act.runOnUiThread {
            try {
                if (on) {
                    act.window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
                } else {
                    act.window.clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
                }
            } catch (e: Exception) {
                Log.w(TAG, "setKeepScreenOn($on) failed: ${e.message}")
            }
        }
    }

    // ------------------------------------------------------------
    // Audio routing internals (Step 11)
    // ------------------------------------------------------------

    private fun audioManager(): AudioManager? =
        context.getSystemService(Context.AUDIO_SERVICE) as? AudioManager

    /**
     * Switch the system into MODE_IN_COMMUNICATION while a session is
     * active so volume keys control the call/voip stream and routing
     * priorities behave like a real phone call. Saves and restores the
     * pre-session mode + speaker state on tear-down.
     */
    private fun applyAudioMode(active: Boolean) {
        val am = audioManager() ?: return
        try {
            if (active) {
                if (!audioModeApplied) {
                    savedAudioMode = am.mode
                    @Suppress("DEPRECATION")
                    savedSpeakerphoneOn = am.isSpeakerphoneOn
                    audioModeApplied = true
                }
                am.mode = AudioManager.MODE_IN_COMMUNICATION
            } else if (audioModeApplied) {
                try { am.mode = savedAudioMode } catch (_: Exception) {}
                @Suppress("DEPRECATION")
                try { am.isSpeakerphoneOn = savedSpeakerphoneOn } catch (_: Exception) {}
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                    try { am.clearCommunicationDevice() } catch (_: Exception) {}
                }
                audioModeApplied = false
            }
        } catch (e: Exception) {
            Log.w(TAG, "applyAudioMode($active) failed: ${e.message}")
        }
    }

    /**
     * Route audio to speakerphone (true) or earpiece/Bluetooth (false).
     * Uses the modern setCommunicationDevice API on Android 12+ and falls
     * back to the legacy isSpeakerphoneOn flag on older devices.
     */
    private fun setSpeakerphoneInternal(on: Boolean) {
        val am = audioManager() ?: return
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                val targetType = if (on) AudioDeviceInfo.TYPE_BUILTIN_SPEAKER
                                 else AudioDeviceInfo.TYPE_BUILTIN_EARPIECE
                val device = am.availableCommunicationDevices.firstOrNull { it.type == targetType }
                if (device != null) {
                    am.setCommunicationDevice(device)
                    return
                }
                // Fall through to legacy flag if device unavailable.
            }
            @Suppress("DEPRECATION")
            am.isSpeakerphoneOn = on
        } catch (e: Exception) {
            Log.w(TAG, "setSpeakerphoneInternal($on) failed: ${e.message}")
        }
    }

    /**
     * Acquire/release a PROXIMITY_SCREEN_OFF_WAKE_LOCK so the screen
     * blanks when the user holds the phone to their ear during a voice
     * call (mirrors the behaviour of the system Phone app). Idempotent.
     */
    private fun setProximityMonitoringInternal(on: Boolean) {
        try {
            if (on) {
                if (proximityWakeLock?.isHeld == true) return
                val pm = context.getSystemService(Context.POWER_SERVICE) as? PowerManager ?: return
                if (!pm.isWakeLockLevelSupported(PowerManager.PROXIMITY_SCREEN_OFF_WAKE_LOCK)) return
                val wl = pm.newWakeLock(
                    PowerManager.PROXIMITY_SCREEN_OFF_WAKE_LOCK,
                    "$TAG:proximity"
                )
                wl.setReferenceCounted(false)
                wl.acquire(60L * 60L * 1000L) // 1h safety cap
                proximityWakeLock = wl
            } else {
                proximityWakeLock?.let { if (it.isHeld) it.release() }
                proximityWakeLock = null
            }
        } catch (e: Exception) {
            Log.w(TAG, "setProximityMonitoringInternal($on) failed: ${e.message}")
        }
    }

    // ------------------------------------------------------------
    // Audio device routing internals (Step 13)
    // ------------------------------------------------------------

    private var commDeviceListener: AudioManager.OnCommunicationDeviceChangedListener? = null

    private fun audioDeviceTypeName(type: Int): String = when (type) {
        AudioDeviceInfo.TYPE_BUILTIN_SPEAKER -> "speaker"
        AudioDeviceInfo.TYPE_BUILTIN_EARPIECE -> "earpiece"
        AudioDeviceInfo.TYPE_WIRED_HEADSET,
        AudioDeviceInfo.TYPE_WIRED_HEADPHONES,
        AudioDeviceInfo.TYPE_USB_HEADSET -> "wired"
        AudioDeviceInfo.TYPE_BLUETOOTH_SCO,
        AudioDeviceInfo.TYPE_BLE_HEADSET -> "bluetooth"
        else -> "unknown"
    }

    private fun matchesType(deviceType: Int, target: String): Boolean = when (target) {
        "speaker" -> deviceType == AudioDeviceInfo.TYPE_BUILTIN_SPEAKER
        "earpiece" -> deviceType == AudioDeviceInfo.TYPE_BUILTIN_EARPIECE
        "wired" -> deviceType == AudioDeviceInfo.TYPE_WIRED_HEADSET ||
                   deviceType == AudioDeviceInfo.TYPE_WIRED_HEADPHONES ||
                   deviceType == AudioDeviceInfo.TYPE_USB_HEADSET
        "bluetooth" -> deviceType == AudioDeviceInfo.TYPE_BLUETOOTH_SCO ||
                       deviceType == AudioDeviceInfo.TYPE_BLE_HEADSET
        else -> false
    }

    private fun setAudioDeviceInternal(type: String): Boolean {
        val am = audioManager() ?: return false
        return try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                val device = am.availableCommunicationDevices.firstOrNull { matchesType(it.type, type) }
                if (device != null) {
                    am.setCommunicationDevice(device); true
                } else false
            } else {
                @Suppress("DEPRECATION")
                when (type) {
                    "speaker" -> { am.isSpeakerphoneOn = true; true }
                    "earpiece" -> { am.isSpeakerphoneOn = false; true }
                    "bluetooth" -> {
                        @Suppress("DEPRECATION")
                        try { am.startBluetoothSco(); am.isBluetoothScoOn = true; true } catch (_: Exception) { false }
                    }
                    "wired" -> { am.isSpeakerphoneOn = false; true }
                    else -> false
                }
            }
        } catch (e: Exception) {
            Log.w(TAG, "setAudioDeviceInternal($type) failed: ${e.message}")
            false
        }
    }

    /**
     * Subscribe to system communication-device changes (BT headset
     * connect/disconnect, wired plug/unplug) and emit "audio-device-changed"
     * to JS so call UIs can re-render the active route. API 31+ only;
     * older devices receive the initial state once on connect.
     */
    private fun registerAudioDeviceListener() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.S) {
            emitAudioDeviceState(); return
        }
        val am = audioManager() ?: return
        if (commDeviceListener != null) return
        try {
            val listener = AudioManager.OnCommunicationDeviceChangedListener { _ -> emitAudioDeviceState() }
            am.addOnCommunicationDeviceChangedListener(
                { r -> activity?.runOnUiThread(r) ?: r.run() },
                listener
            )
            commDeviceListener = listener
            emitAudioDeviceState()
        } catch (e: Exception) {
            Log.w(TAG, "registerAudioDeviceListener failed: ${e.message}")
        }
    }

    private fun unregisterAudioDeviceListener() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.S) return
        val am = audioManager() ?: return
        try {
            commDeviceListener?.let { am.removeOnCommunicationDeviceChangedListener(it) }
        } catch (_: Exception) {}
        commDeviceListener = null
    }

    private fun emitAudioDeviceState() {
        try {
            val am = audioManager() ?: return
            val list = org.json.JSONArray()
            var active = "unknown"
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                am.availableCommunicationDevices.forEach { d ->
                    val o = JSObject()
                    o.put("id", d.id)
                    o.put("type", audioDeviceTypeName(d.type))
                    o.put("name", d.productName?.toString() ?: audioDeviceTypeName(d.type))
                    list.put(o)
                }
                active = audioDeviceTypeName(am.communicationDevice?.type ?: -1)
            } else {
                @Suppress("DEPRECATION")
                active = if (am.isSpeakerphoneOn) "speaker" else "earpiece"
            }
            val data = JSObject()
            data.put("active", active)
            data.put("devices", list)
            notifyListeners("audio-device-changed", data)
        } catch (e: Exception) {
            Log.w(TAG, "emitAudioDeviceState failed: ${e.message}")
        }
    }
}
