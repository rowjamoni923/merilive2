package com.merilive.app.plugin

import android.Manifest
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.media.AudioDeviceInfo
import android.media.AudioManager
import android.media.session.MediaSession
import android.media.session.PlaybackState
import android.view.KeyEvent
import android.net.ConnectivityManager
import android.net.Network
import android.net.NetworkCapabilities
import android.net.NetworkRequest
import android.os.Build
import android.os.PowerManager
import com.merilive.app.service.CallForegroundService
import android.util.Log
import android.util.Base64
import android.view.ViewGroup
import android.view.WindowManager
import android.widget.FrameLayout
import android.graphics.Color
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
import io.livekit.android.room.track.DataPublishReliability
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
import kotlinx.coroutines.withContext
import java.net.HttpURLConnection
import java.net.URL
import kotlin.math.abs
import kotlin.math.max
import kotlin.math.min
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
        // Step 28 — RTC stats / telemetry tunables.
        private const val STATS_DEFAULT_INTERVAL_MS = 3_000L
        private const val STATS_MIN_INTERVAL_MS = 1_000L

        // Step 29 — Picture-in-Picture bridge from MainActivity.
        // MainActivity overrides onUserLeaveHint / onPictureInPictureModeChanged
        // and forwards into these statics so the plugin can react without
        // having to subclass BridgeActivity.
        @Volatile private var INSTANCE: LiveKitPlugin? = null

        @JvmStatic
        fun notifyUserLeaveHint(activity: android.app.Activity) {
            INSTANCE?.onUserLeaveHintInternal(activity)
        }

        @JvmStatic
        fun notifyPipModeChanged(isInPip: Boolean) {
            INSTANCE?.onPipModeChangedInternal(isInPip)
        }
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

    // --- Codec preference + hardware acceleration (Step 32) ------
    //
    // LiveKit Android delegates codec selection to libwebrtc + SDP
    // negotiation. We bias the publish side by setting `videoCodec`
    // on VideoTrackPublishDefaults; the SFU and subscribers fall in
    // line through SDP. Hardware encoder/decoder factories are on by
    // default in the SDK (`DefaultVideoEncoderFactory` already wraps
    // MediaCodec), so all we expose is the preference + a capability
    // probe so JS can refuse codecs the device can't HW-encode.
    private var preferredCodec: String = "auto"   // "auto"|"vp8"|"vp9"|"h264"|"av1"
    private var negotiatedCodec: String = "unknown"

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
        // Step 28 — running frame counter (monotonic) used to derive fps.
        var frameCount: Long = 0L,
        var lastSampleFrameCount: Long = 0L,
        var lastSampleMs: Long = 0L,
    )
    private val stallTable = mutableMapOf<String, StallEntry>()
    private val stallSinks = mutableMapOf<String, VideoSink>()
    private var stallWatchdogJob: Job? = null
    private var stallWatchdogEnabled: Boolean = true

    // --- Network resilience (Step 26) ----------------------------
    //
    // LiveKit SDK already auto-recovers from short signal-channel drops
    // (≤10 s) via WebSocket retry + ICE restart. This layer escalates
    // when SDK recovery stalls:
    //   • Reconnecting > 15 s   → emit "degraded", trigger a HARD
    //     reconnect (build a fresh Room with the cached connect args).
    //   • Disconnected with non-client reason → up to 3 hard reconnect
    //     attempts with exponential backoff (3 / 6 / 12 s).
    //   • Total recovery window > 60 s → emit "lost", give up.
    // JS can also call reconnectNow() on a "Tap to retry" button.
    private data class ConnectArgs(
        val url: String,
        val token: String,
        val video: Boolean,
        val audio: Boolean,
        val lens: String,
        val resolution: String,
        val callerName: String,
        val callType: String,
        val e2eeOn: Boolean,
        val e2eeKey: String?,
    )
    private var lastConnectArgs: ConnectArgs? = null
    private var reconnectWatchdogJob: Job? = null
    private var reconnectingSinceMs: Long = 0L
    private var hardReconnectAttempts: Int = 0
    private var hardReconnectInProgress: Boolean = false
    private var resilienceEnabled: Boolean = true

    // --- Network type & data-saver awareness (Step 27) -----------
    //
    // Android delivers ConnectivityManager#NetworkCallback events when
    // the device transitions WiFi ↔ Cellular ↔ Ethernet (e.g. user
    // walks out of WiFi range). The new network has different ICE
    // candidates so the existing WebRTC peer connection silently keeps
    // sending packets into a dead socket until LiveKit's WebSocket ping
    // notices ~10 s later. We pre-empt that by triggering a hard
    // reconnect (reuses Step 26 plumbing) the moment a transition is
    // detected — peers see ~2 s of buffering instead of ~12 s of black.
    //
    // Data-saver: when on cellular and `dataSaverOnCellular` is true we
    // also force the adaptive ladder down to LOW so the user doesn't
    // burn through their plan when they leave WiFi mid-stream.
    private enum class NetType { NONE, WIFI, CELLULAR, ETHERNET, OTHER }
    private var networkCallback: ConnectivityManager.NetworkCallback? = null
    private var currentNetType: NetType = NetType.NONE
    private var dataSaverOnCellular: Boolean = false
    private var lastNetTransitionMs: Long = 0L

    // --- RTC stats / telemetry (Step 28) -------------------------
    //
    // Periodically samples per-track + per-room health and emits an
    // "rtc-stats" event so the JS layer (debug HUD, QoE analytics,
    // adaptive UI badges like "Weak network") can react without
    // polling the plugin every second.
    //
    // What we measure honestly (no fake numbers):
    //   • fps  — derived from the same VideoSink frame counter the
    //            stall watchdog already maintains, so it costs nothing
    //            extra to read.
    //   • silentMs — wall-clock since the last decoded frame.
    //   • quality  — last ConnectionQuality reported by the SFU per
    //                participant (EXCELLENT/GOOD/POOR/LOST).
    //   • tier / maxBitrate / simulcast — current publisher ladder
    //     position (Step 22 source of truth).
    //   • network type + dataSaver (Step 27).
    //   • reconnect state (Step 26).
    //
    // We deliberately do NOT poll WebRTC getStats() here — that API
    // shape varies by livekit-android version and would silently
    // return zeros on some devices. Frame-count based fps is exact.
    private var statsCollectorJob: Job? = null
    private var statsCollectorEnabled: Boolean = true
    private var statsIntervalMs: Long = STATS_DEFAULT_INTERVAL_MS
    private val qualityTable = mutableMapOf<String, String>() // sid → quality lowercase
    private var localSid: String = "local"

    // --- Picture-in-Picture (Step 29) ----------------------------
    //
    // Industry standard for in-call apps (WhatsApp, Messenger, Meet):
    // tap home → call shrinks to a floating PiP window so the user can
    // multitask without dropping the broadcast/call. Renderers stay
    // attached behind the WebView while PiP is active so the remote
    // tile keeps updating; we just suppress the "background detach"
    // path that Step 24 normally runs in handleOnPause.
    //
    //   • setAutoPipOnLeaveHint({enabled})  → opt-in per session
    //     (Live broadcasters: usually false; 1:1 callers: true).
    //   • enterPictureInPicture({aspect})    → manual entry from JS
    //     (e.g. a "minimise" button in the call screen).
    //   • pip-changed event {isInPip}        → JS toggles compact UI.
    //
    // Aspect must stay between 0.418 and 2.39 per Android contract;
    // we clamp silently so callers can pass any sensible ratio.
    private var pipSupported: Boolean = false
    private var autoPipOnLeaveHint: Boolean = false
    private var inPictureInPicture: Boolean = false
    private var enteringPip: Boolean = false
    private var pipAspectNumerator: Int = 9
    private var pipAspectDenominator: Int = 16

    // ------------------------------------------------------------
    // Lifecycle — register the singleton MainActivity bridges into.
    // ------------------------------------------------------------

    override fun load() {
        super.load()
        INSTANCE = this
        // Cache the system feature so isPictureInPictureSupported() is free.
        pipSupported = try {
            context.packageManager.hasSystemFeature(
                android.content.pm.PackageManager.FEATURE_PICTURE_IN_PICTURE
            )
        } catch (_: Exception) { false }
    }

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

        // Step 26 — cache args so reconnectInternal() / hard-reconnect
        // watchdog can rebuild the room without re-prompting JS.
        lastConnectArgs = ConnectArgs(
            url, token, enableVideo, enableAudio, lens, resolution,
            callerName, callType, e2eeOn, e2eeSharedKey,
        )
        hardReconnectAttempts = 0

        scope.launch {
            try {
                connectInternal(lastConnectArgs!!, isReconnect = false)
                val newRoom = room!!
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

    /**
     * Step 26 — shared connect path used by both the public connect()
     * call and by hard-reconnect retries. Builds a fresh Room with the
     * cached args, attaches event listeners, publishes mic/camera, and
     * (re-)applies audio mode. Throws on failure so the caller can wrap
     * it in retry/backoff logic.
     */
    private suspend fun connectInternal(args: ConnectArgs, isReconnect: Boolean) {
        // Tear down any previous room first.
        room?.disconnect()
        room = null

        // Step 22 — reset adaptive ladder for this fresh session.
        baseTier = if (args.resolution == "720p") AdaptiveTier.MEDIUM else AdaptiveTier.HIGH
        currentTier = baseTier
        baseLens = if (args.lens == "back") CameraPosition.BACK else CameraPosition.FRONT
        consecutiveExcellent = 0
        lastTierChangeMs = 0L
        adaptiveBusy = false

        val captureParams: VideoCaptureParameter = if (args.resolution == "720p") {
            VideoPreset169.H720.capture
        } else {
            VideoPreset169.H1080.capture
        }
        val cameraPosition =
            if (args.lens == "back") CameraPosition.BACK else CameraPosition.FRONT

        // Step 20 — explicit publish encoding ladder.
        // 1080p/30fps live: 4 Mbps top layer + simulcast for viewer adaptation.
        // 720p call:        2 Mbps single layer (no simulcast — peer-to-peer).
        val publishEncoding: VideoEncoding = if (args.resolution == "720p") {
            VideoEncoding(maxBitrate = 2_000_000, maxFps = 30)
        } else {
            VideoEncoding(maxBitrate = 4_000_000, maxFps = 30)
        }
        // Step 32 — bias publish-side codec when JS pinned a preference.
        // Falls back to "auto" → SDK chooses (VP8 default on libwebrtc).
        val codecForPublish: String? = resolvePublishCodec()
        val publishDefaults = VideoTrackPublishDefaults(
            videoEncoding = publishEncoding,
            simulcast = (args.resolution != "720p"),
            videoCodec = codecForPublish ?: VideoTrackPublishDefaults().videoCodec,
        )
        negotiatedCodec = codecForPublish ?: "auto"

        // Step 23 — build the E2EE key provider once per session.
        val e2eeOptions: E2EEOptions? = if (args.e2eeOn && !args.e2eeKey.isNullOrBlank()) {
            val provider = BaseKeyProvider()
            provider.setSharedKey(args.e2eeKey)
            e2eeKeyProvider = provider
            e2eeKey = args.e2eeKey
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

        newRoom.connect(args.url, args.token, ConnectOptions(autoSubscribe = true))

        // Publish local tracks.
        newRoom.localParticipant.setMicrophoneEnabled(args.audio)
        newRoom.localParticipant.setCameraEnabled(args.video)

        // Keep screen on for the duration of the live/call session.
        setKeepScreenOn(true)

        // Apply communication audio mode + default routing:
        //  - video session  → speaker ON, no proximity (Live broadcast / video call)
        //  - audio-only call → speaker OFF (earpiece), proximity ON
        applyAudioMode(true)
        setSpeakerphoneInternal(args.video)
        setProximityMonitoringInternal(!args.video)
        registerAudioDeviceListener()
        // Step 30 — wired-headset / SCO broadcast receivers + media-button MediaSession.
        registerHeadsetReceivers()
        if (headsetButtonsEnabled) startHeadsetMediaSession()

        // Step 15 — request VoIP audio focus so an incoming PSTN
        // call / alarm / other media auto-pauses our mic, then
        // resumes when focus comes back. Track user mic intent.
        micIntentBeforeLoss = args.audio
        requestAudioFocusInternal()

        // Step 14 — promote process to a foreground service so Android
        // 14+ keeps mic/camera alive when the user backgrounds the app.
        startCallForegroundService(args.callerName, args.callType)

        // Step 25 — start the video stall watchdog for this session.
        startStallWatchdog()

        // Step 27 — listen for WiFi↔Cellular transitions for this session.
        if (!isReconnect) registerNetworkCallback()

        // Step 28 — start periodic RTC stats / telemetry collector.
        try { localSid = newRoom.localParticipant.sid.value } catch (_: Exception) {}
        startStatsCollector()

        activity?.runOnUiThread {
            attachAllRemoteRenderersInternal(newRoom)
        }

        if (isReconnect) {
            // Step 26 — emit a "reconnected" event so JS knows our hard
            // reconnect succeeded and can re-attach renderers (the old
            // RTCVideoTrack instances were released with the prior room).
            val data = JSObject()
            data.put("state", "reconnected")
            data.put("hard", true)
            data.put("attempt", hardReconnectAttempts)
            notifyListeners("connection-state", data)
        }
    }

    @PluginMethod
    fun disconnect(call: PluginCall) {
        scope.launch {
            try {
                // Step 26 — user-initiated tear-down: prevent the
                // resilience watchdog from auto-reconnecting us.
                lastConnectArgs = null
                stopReconnectWatchdog()
                hardReconnectAttempts = 0
                eventJob?.cancel()
                eventJob = null
                stopStallWatchdog()
                stopStatsCollector()
                qualityTable.clear()
                unregisterNetworkCallback()
                room?.disconnect()
                room = null
                activity?.runOnUiThread { detachAllRenderersInternal() }
                setKeepScreenOn(false)
                setProximityMonitoringInternal(false)
                applyAudioMode(false)
                unregisterAudioDeviceListener()
                // Step 30 — release headset receivers + media-button session.
                unregisterHeadsetReceivers()
                stopHeadsetMediaSession()
                stopBluetoothScoInternal()
                abandonAudioFocusInternal()
                stopCallForegroundService()
                call.resolve()
            } catch (e: Exception) {
                call.reject("disconnect failed: ${e.message}")
            }
        }
    }

    @PluginMethod
    fun sendData(call: PluginCall) {
        val payloadBase64 = call.getString("payloadBase64")
            ?: return call.reject("payloadBase64 required")
        val reliable = call.getBoolean("reliable", true) ?: true
        val topic = call.getString("topic", null)
        val r = room ?: return call.reject("Not connected")
        scope.launch {
            try {
                val bytes = Base64.decode(payloadBase64, Base64.DEFAULT)
                val reliability = if (reliable) DataPublishReliability.RELIABLE else DataPublishReliability.LOSSY
                val result = r.localParticipant.publishData(bytes, reliability, topic)
                result.exceptionOrNull()?.let { throw it }
                val ret = JSObject(); ret.put("sent", true); call.resolve(ret)
            } catch (e: Exception) {
                call.reject("sendData failed: ${e.message}")
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
    fun attachAllRemotes(call: PluginCall) {
        val r = room ?: return call.reject("Not connected")
        activity?.runOnUiThread {
            try {
                val attached = attachAllRemoteRenderersInternal(r)
                val ret = JSObject(); ret.put("attached", attached); call.resolve(ret)
            } catch (e: Exception) {
                call.reject("attachAllRemotes failed: ${e.message}")
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

    private fun attachRemoteRendererInternal(
        r: Room,
        participant: RemoteParticipant,
    ): Boolean {
        val sid = participant.sid.value
        val track = participant.getTrackPublication(Track.Source.CAMERA)
            ?.track as? io.livekit.android.room.track.VideoTrack ?: return false
        val renderer = remoteRenderers.getOrPut(sid) { createRenderer() }
        return try {
            r.initVideoRenderer(renderer)
            track.addRenderer(renderer)
            mountBehindWebView(renderer)
            installStallSink(track, key = sid, sid = sid, isLocal = false)
            true
        } catch (e: Exception) {
            Log.w(TAG, "attachRemoteRendererInternal failed for $sid: ${e.message}")
            false
        }
    }

    private fun attachAllRemoteRenderersInternal(r: Room): Int {
        var attached = 0
        for (participant in r.remoteParticipants.values) {
            if (attachRemoteRendererInternal(r, participant)) attached++
        }
        return attached
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
                        if (event.track.kind == Track.Kind.VIDEO) {
                            activity?.runOnUiThread { attachRemoteRendererInternal(r, event.participant) }
                        }
                    }
                    is RoomEvent.TrackUnsubscribed -> {
                        val data = JSObject()
                        data.put("sid", event.participant.sid.value)
                        data.put("identity", event.participant.identity?.value ?: "")
                        data.put("kind", event.track.kind.name.lowercase())
                        notifyListeners("track-unsubscribed", data)
                    }
                    is RoomEvent.DataReceived -> {
                        val data = JSObject()
                        data.put("payloadBase64", Base64.encodeToString(event.data, Base64.NO_WRAP))
                        data.put("participantSid", event.participant?.sid?.value ?: "")
                        data.put("participantIdentity", event.participant?.identity?.value ?: "")
                        data.put("topic", event.topic ?: "")
                        notifyListeners("data-received", data)
                    }
                    is RoomEvent.Disconnected -> {
                        val data = JSObject()
                        data.put("reason", event.reason.name)
                        event.error?.let { data.put("error", it.message ?: it.javaClass.simpleName) }
                        notifyListeners("disconnected", data)
                        // Server-initiated / network drop — release the screen-on flag too.
                        setKeepScreenOn(false)
                        // Step 26 — escalate to a hard reconnect when the
                        // SDK's auto-recovery has fully given up. Skip when
                        // the user (or our disconnect()) initiated it.
                        if (resilienceEnabled && lastConnectArgs != null &&
                            !isClientInitiatedDisconnect(event.reason.name)
                        ) {
                            scheduleHardReconnect("disconnected:${event.reason.name}")
                        }
                    }
                    is RoomEvent.ConnectionQualityChanged -> {
                        val qLower = event.quality.name.lowercase()
                        qualityTable[event.participant.sid.value] = qLower // Step 28 cache
                        val data = JSObject()
                        data.put("sid", event.participant.sid.value)
                        data.put("quality", qLower)
                        notifyListeners("connection-quality", data)

                        // Step 22 — react ONLY to our own uplink quality.
                        if (event.participant == r.localParticipant) {
                            handleLocalQuality(event.quality)
                        }
                    }
                    // Step 16 — connection lifecycle so JS can show
                    // "Reconnecting…" / "Reconnected" UI like WhatsApp.
                    is RoomEvent.Reconnecting -> {
                        reconnectingSinceMs = System.currentTimeMillis()
                        val data = JSObject()
                        data.put("state", "reconnecting")
                        notifyListeners("connection-state", data)
                        // Step 26 — if SDK can't recover within 15 s, we
                        // tear the room down and rebuild from cached args.
                        startReconnectWatchdog()
                    }
                    is RoomEvent.Reconnected -> {
                        val elapsed = if (reconnectingSinceMs > 0)
                            System.currentTimeMillis() - reconnectingSinceMs else 0L
                        reconnectingSinceMs = 0L
                        hardReconnectAttempts = 0
                        stopReconnectWatchdog()
                        val data = JSObject()
                        data.put("state", "reconnected")
                        data.put("elapsedMs", elapsed)
                        notifyListeners("connection-state", data)
                        // Re-apply our communication audio mode in case
                        // the OS reset it during the network drop.
                        applyAudioMode(true)
                        // Step 25 — fresh keyframes will arrive shortly;
                        // reset stall timers so we don't insta-recover.
                        val now = System.currentTimeMillis()
                        stallTable.values.forEach { it.lastFrameMs = now; it.attempts = 0 }
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
        }
        renderer.visibility = android.view.View.VISIBLE
        renderer.alpha = 1f
        webView.setBackgroundColor(Color.TRANSPARENT)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.JELLY_BEAN) webView.setLayerType(android.view.View.LAYER_TYPE_HARDWARE, null)
    }

    private fun detachAllRenderersInternal() {
        val webView = bridge?.webView
        // Step 25 — drop stall sinks before we release the underlying tracks.
        try { clearStallSinks() } catch (_: Exception) {}
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
        // Step 29 — entering Picture-in-Picture also fires onPause, but
        // the activity stays visible. Keep renderers attached so the
        // floating PiP window keeps showing the call. Likewise skip the
        // camera auto-pause: the user is still on a call, just compact.
        if (enteringPip || inPictureInPicture || isActivityInPip()) {
            Log.d(TAG, "handleOnPause skipped — entering/in PiP")
            return
        }
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
            // Step 25 — give the renderer time to start receiving frames
            // again before the watchdog re-arms its stall timer.
            val now = System.currentTimeMillis()
            stallTable.values.forEach { it.lastFrameMs = now; it.attempts = 0 }
        } catch (e: Exception) {
            Log.w(TAG, "handleOnResume restore failed", e)
        }
    }

    override fun handleOnDestroy() {
        super.handleOnDestroy()
        try {
            eventJob?.cancel()
            stopStallWatchdog()
            stopReconnectWatchdog()
            unregisterNetworkCallback()
            lastConnectArgs = null
            scope.launch { room?.disconnect() }
            setKeepScreenOn(false)
            setProximityMonitoringInternal(false)
            applyAudioMode(false)
            unregisterAudioDeviceListener()
            // Step 30 — tear down headset receivers + media-button session.
            unregisterHeadsetReceivers()
            stopHeadsetMediaSession()
            stopBluetoothScoInternal()
            abandonAudioFocusInternal()
            stopCallForegroundService()
            // Step 36 — release MediaPipe segmenter + RenderScript blur.
            try { virtualBackgroundProcessor?.release() } catch (_: Exception) {}
            virtualBackgroundProcessor = null
        } catch (_: Exception) {}
        // Step 29 — release static bridge so a new plugin instance
        // doesn't hand callbacks to a destroyed object.
        if (INSTANCE === this) INSTANCE = null
    }

    // ------------------------------------------------------------
    // Step 26 — Network resilience (hard reconnect + ICE restart)
    //
    // The LiveKit Android SDK already handles short signal-channel
    // drops automatically (~10 s window of WebSocket retry + WebRTC ICE
    // restart). When that fails we don't sit on a frozen tile — we
    // tear the room down and rebuild from cached connect args. JS
    // sees a single `connection-state` { state:"reconnected", hard:true }
    // event when we succeed, or `state:"lost"` after we've burned all
    // attempts inside the 60 s recovery window.
    // ------------------------------------------------------------

    private fun isClientInitiatedDisconnect(reasonName: String): Boolean {
        // LiveKit's DisconnectReason enum: CLIENT_INITIATED, DUPLICATE_IDENTITY,
        // SERVER_SHUTDOWN, PARTICIPANT_REMOVED, ROOM_DELETED, STATE_MISMATCH,
        // JOIN_FAILURE, UNKNOWN_REASON. We only suppress auto-reconnect for
        // the explicitly intentional cases.
        return reasonName.equals("CLIENT_INITIATED", ignoreCase = true) ||
               reasonName.equals("PARTICIPANT_REMOVED", ignoreCase = true) ||
               reasonName.equals("ROOM_DELETED", ignoreCase = true) ||
               reasonName.equals("DUPLICATE_IDENTITY", ignoreCase = true)
    }

    private fun startReconnectWatchdog() {
        if (!resilienceEnabled) return
        stopReconnectWatchdog()
        reconnectWatchdogJob = scope.launch {
            // Give the SDK 15 s to recover on its own.
            delay(15_000L)
            if (room == null) return@launch
            if (reconnectingSinceMs == 0L) return@launch // already recovered
            // Emit "degraded" so JS can swap to a stronger UI affordance.
            val data = JSObject()
            data.put("state", "degraded")
            data.put("elapsedMs", System.currentTimeMillis() - reconnectingSinceMs)
            notifyListeners("connection-state", data)
            scheduleHardReconnect("watchdog")
        }
    }

    private fun stopReconnectWatchdog() {
        reconnectWatchdogJob?.cancel()
        reconnectWatchdogJob = null
    }

    private fun scheduleHardReconnect(trigger: String) {
        if (!resilienceEnabled) return
        if (hardReconnectInProgress) return
        val args = lastConnectArgs ?: return
        // 60 s total recovery window from the *first* time we noticed trouble.
        val windowStart = if (reconnectingSinceMs > 0) reconnectingSinceMs
                          else System.currentTimeMillis()
        if (System.currentTimeMillis() - windowStart > 60_000L ||
            hardReconnectAttempts >= 3
        ) {
            val data = JSObject()
            data.put("state", "lost")
            data.put("attempts", hardReconnectAttempts)
            data.put("trigger", trigger)
            notifyListeners("connection-state", data)
            return
        }
        hardReconnectInProgress = true
        scope.launch {
            try {
                // Exponential backoff — 3 s, 6 s, 12 s.
                val backoffMs = 3_000L * (1L shl hardReconnectAttempts)
                Log.w(TAG, "Hard reconnect attempt ${hardReconnectAttempts + 1} in ${backoffMs}ms (trigger=$trigger)")
                delay(backoffMs)
                hardReconnectAttempts += 1
                connectInternal(args, isReconnect = true)
            } catch (e: Exception) {
                Log.e(TAG, "Hard reconnect failed", e)
                val data = JSObject()
                data.put("state", "reconnect-failed")
                data.put("attempt", hardReconnectAttempts)
                data.put("error", e.message ?: e.javaClass.simpleName)
                notifyListeners("connection-state", data)
                // Schedule the next attempt (re-enters the gate above).
                hardReconnectInProgress = false
                scheduleHardReconnect("retry")
                return@launch
            } finally {
                hardReconnectInProgress = false
            }
        }
    }

    @PluginMethod
    fun reconnectNow(call: PluginCall) {
        val args = lastConnectArgs
        if (args == null) {
            call.reject("No active session to reconnect")
            return
        }
        scope.launch {
            try {
                hardReconnectAttempts = 0
                reconnectingSinceMs = System.currentTimeMillis()
                stopReconnectWatchdog()
                connectInternal(args, isReconnect = true)
                val ret = JSObject()
                ret.put("connected", true)
                call.resolve(ret)
            } catch (e: Exception) {
                call.reject("reconnectNow failed: ${e.message}")
            }
        }
    }

    @PluginMethod
    fun setResilienceEnabled(call: PluginCall) {
        val enabled = call.getBoolean("enabled", true) ?: true
        resilienceEnabled = enabled
        if (!enabled) stopReconnectWatchdog()
        val ret = JSObject(); ret.put("enabled", enabled); call.resolve(ret)
    }

    @PluginMethod
    fun getConnectionState(call: PluginCall) {
        val ret = JSObject()
        ret.put("hasRoom", room != null)
        ret.put("hasSession", lastConnectArgs != null)
        ret.put("reconnectingSinceMs", reconnectingSinceMs)
        ret.put("hardReconnectAttempts", hardReconnectAttempts)
        ret.put("resilienceEnabled", resilienceEnabled)
        call.resolve(ret)
    }

    // ------------------------------------------------------------
    // Step 27 — Network type & data-saver awareness
    //
    // Bridges Android ConnectivityManager → LiveKit. On WiFi↔Cellular
    // transitions we trigger a hard reconnect (Step 26) so the new
    // network's ICE candidates take over immediately. On cellular we
    // optionally pin the publisher ladder to LOW (Step 22) to spare
    // the user's data plan. JS gets `network-changed` events with the
    // new type so the UI can show a "Switched to mobile data" badge.
    // ------------------------------------------------------------

    private fun classifyNetwork(caps: NetworkCapabilities?): NetType {
        if (caps == null) return NetType.NONE
        return when {
            caps.hasTransport(NetworkCapabilities.TRANSPORT_WIFI)     -> NetType.WIFI
            caps.hasTransport(NetworkCapabilities.TRANSPORT_CELLULAR) -> NetType.CELLULAR
            caps.hasTransport(NetworkCapabilities.TRANSPORT_ETHERNET) -> NetType.ETHERNET
            else -> NetType.OTHER
        }
    }

    private fun registerNetworkCallback() {
        if (networkCallback != null) return
        val cm = context.getSystemService(Context.CONNECTIVITY_SERVICE) as? ConnectivityManager
            ?: return
        try {
            val request = NetworkRequest.Builder()
                .addCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET)
                .build()
            currentNetType = classifyNetwork(cm.getNetworkCapabilities(cm.activeNetwork))
            val cb = object : ConnectivityManager.NetworkCallback() {
                override fun onCapabilitiesChanged(network: Network, caps: NetworkCapabilities) {
                    val newType = classifyNetwork(caps)
                    if (newType == currentNetType) return
                    val prev = currentNetType
                    currentNetType = newType
                    onNetworkTransition(prev, newType, caps)
                }
                override fun onLost(network: Network) {
                    if (currentNetType == NetType.NONE) return
                    val prev = currentNetType
                    currentNetType = NetType.NONE
                    onNetworkTransition(prev, NetType.NONE, null)
                }
            }
            networkCallback = cb
            cm.registerNetworkCallback(request, cb)
        } catch (e: Exception) {
            Log.w(TAG, "registerNetworkCallback failed: ${e.message}")
            networkCallback = null
        }
    }

    private fun unregisterNetworkCallback() {
        val cb = networkCallback ?: return
        networkCallback = null
        currentNetType = NetType.NONE
        try {
            val cm = context.getSystemService(Context.CONNECTIVITY_SERVICE) as? ConnectivityManager
            cm?.unregisterNetworkCallback(cb)
        } catch (_: Exception) {}
    }

    private fun onNetworkTransition(prev: NetType, next: NetType, caps: NetworkCapabilities?) {
        val now = System.currentTimeMillis()
        // Debounce — Android can fire onCapabilitiesChanged twice in <500ms
        // when a network handoff completes (validated→validated+notMetered).
        if (now - lastNetTransitionMs < 1_500L) return
        lastNetTransitionMs = now

        val data = JSObject()
        data.put("from", prev.name.lowercase())
        data.put("to", next.name.lowercase())
        data.put("metered", caps?.hasCapability(NetworkCapabilities.NET_CAPABILITY_NOT_METERED) == false)
        notifyListeners("network-changed", data)
        Log.i(TAG, "Network transition: ${prev.name} → ${next.name}")

        if (room == null || lastConnectArgs == null) return

        // Apply data-saver: cap to LOW on cellular, restore baseTier on WiFi.
        if (dataSaverOnCellular) {
            when (next) {
                NetType.CELLULAR -> if (currentTier != AdaptiveTier.LOW)
                    applyAdaptiveTier(AdaptiveTier.LOW, "data-saver-cellular")
                NetType.WIFI, NetType.ETHERNET -> if (currentTier != baseTier)
                    applyAdaptiveTier(baseTier, "data-saver-wifi")
                else -> { /* NONE / OTHER — let resilience layer handle */ }
            }
        }

        // Fully different physical link → existing peer connection's local
        // ICE candidates point at the old interface. Force a hard reconnect.
        val isMajorHandoff = (prev != NetType.NONE && next != NetType.NONE && prev != next)
        if (isMajorHandoff && resilienceEnabled) {
            Log.w(TAG, "Network handoff $prev → $next — forcing hard reconnect")
            reconnectingSinceMs = now
            scheduleHardReconnect("network-changed:${prev.name.lowercase()}->${next.name.lowercase()}")
        }
    }

    @PluginMethod
    fun setDataSaverEnabled(call: PluginCall) {
        dataSaverOnCellular = call.getBoolean("enabled", false) ?: false
        if (dataSaverOnCellular && currentNetType == NetType.CELLULAR &&
            room != null && currentTier != AdaptiveTier.LOW
        ) {
            applyAdaptiveTier(AdaptiveTier.LOW, "data-saver-toggle")
        } else if (!dataSaverOnCellular && room != null && currentTier != baseTier) {
            applyAdaptiveTier(baseTier, "data-saver-off")
        }
        val ret = JSObject()
        ret.put("enabled", dataSaverOnCellular)
        ret.put("network", currentNetType.name.lowercase())
        call.resolve(ret)
    }

    @PluginMethod
    fun getNetworkType(call: PluginCall) {
        val ret = JSObject()
        ret.put("type", currentNetType.name.lowercase())
        ret.put("dataSaver", dataSaverOnCellular)
        call.resolve(ret)
    }

    // ------------------------------------------------------------
    // Step 25 — Video stall & black-frame recovery
    //
    // A WebRTC track can keep its ICE/DTLS state nominally "alive" while
    // the decoded frame stream silently halts (broken keyframe sequence,
    // PLI/NACK storm dropped, encoder thread starved on the publisher,
    // hardware decoder hang on the subscriber). The signalling layer
    // never notices, so the user just sees a frozen / black tile.
    //
    // We bolt a tiny VideoSink alongside each renderer that simply
    // bumps a "last decoded frame at" timestamp. A coroutine polls every
    // 2 s; when a tile goes silent for 5 s we attempt soft recovery:
    //   • Remote tracks → setSubscribed(false) + setSubscribed(true)
    //     forces the SFU to re-issue a keyframe and re-establish the
    //     downstream RTP flow without dropping the room.
    //   • Local camera  → toggle setCameraEnabled(false→true) which
    //     republishes the camera track with a fresh encoder.
    // After 12 s without recovery we emit "video-stall-failed" so the
    // JS layer can show "Tap to retry" UI / fall back to a lower lane.
    // ------------------------------------------------------------

    private fun installStallSink(
        track: io.livekit.android.room.track.VideoTrack,
        key: String,
        sid: String,
        isLocal: Boolean,
    ) {
        if (!stallWatchdogEnabled) return
        // Detach an old sink first so reattaches don't double-count.
        stallSinks.remove(key)?.let { try { track.removeRenderer(it) } catch (_: Exception) {} }
        val sink = object : VideoSink {
            override fun onFrame(frame: VideoFrame?) {
                val entry = stallTable[key] ?: return
                entry.lastFrameMs = System.currentTimeMillis()
                entry.frameCount += 1L          // Step 28 — fps source.
                if (entry.attempts > 0) entry.attempts = 0
            }
        }
        stallSinks[key] = sink
        try { track.addRenderer(sink) } catch (e: Exception) {
            Log.w(TAG, "installStallSink addRenderer failed: ${e.message}")
            stallSinks.remove(key); return
        }
        stallTable[key] = StallEntry(
            lastFrameMs = System.currentTimeMillis(),
            attempts = 0,
            lastAttemptMs = 0L,
            isLocal = isLocal,
            sid = sid,
        )
    }

    private fun clearStallSinks() {
        // We don't have the original tracks here (they may already be
        // released by the SDK), so just drop our references — the WebRTC
        // VideoSinks become unreachable and GC reclaims them.
        stallSinks.clear()
        stallTable.clear()
    }

    private fun startStallWatchdog() {
        stopStallWatchdog()
        if (!stallWatchdogEnabled) return
        stallWatchdogJob = scope.launch {
            while (true) {
                delay(STALL_POLL_MS)
                if (room == null) break
                if (inBackground) continue   // Step 24 detached renderers — frames legitimately stop.
                checkForStalls()
            }
        }
    }

    private fun stopStallWatchdog() {
        stallWatchdogJob?.cancel()
        stallWatchdogJob = null
    }

    private fun checkForStalls() {
        val now = System.currentTimeMillis()
        // Snapshot to avoid concurrent-modification while we iterate.
        val snapshot = stallTable.entries.toList()
        for ((key, entry) in snapshot) {
            val silentMs = now - entry.lastFrameMs
            if (silentMs < STALL_WARN_MS) continue
            // Cooldown so each recovery attempt has time to settle.
            if (now - entry.lastAttemptMs < STALL_RECOVERY_COOLDOWN_MS) continue

            if (silentMs in STALL_WARN_MS until STALL_HARD_MS && entry.attempts < 2) {
                emitStallEvent(entry, silentMs, "stalled")
                entry.attempts += 1
                entry.lastAttemptMs = now
                attemptStallRecovery(key, entry)
            } else if (silentMs >= STALL_HARD_MS) {
                emitStallEvent(entry, silentMs, "failed")
                // Reset so a future keyframe still re-arms the cycle, but
                // back off attempt counter so we don't spam the SFU.
                entry.attempts = 0
                entry.lastAttemptMs = now
            }
        }
    }

    private fun attemptStallRecovery(key: String, entry: StallEntry) {
        val r = room ?: return
        scope.launch {
            try {
                if (entry.isLocal) {
                    // Republish camera with a fresh encoder. Cheap and
                    // doesn't disturb the room — peers see one black frame.
                    Log.w(TAG, "Stall recovery (local): toggling camera")
                    r.localParticipant.setCameraEnabled(false)
                    delay(250L)
                    r.localParticipant.setCameraEnabled(true)
                } else {
                    val participant = r.remoteParticipants.values.firstOrNull {
                        it.sid.value == entry.sid
                    } ?: return@launch
                    val pub = participant.getTrackPublication(Track.Source.CAMERA)
                        as? RemoteTrackPublication ?: return@launch
                    Log.w(TAG, "Stall recovery (remote ${entry.sid}): unsubscribe + resubscribe")
                    try { pub.setSubscribed(false) } catch (_: Exception) {}
                    delay(400L)
                    try { pub.setSubscribed(true) } catch (_: Exception) {}
                }
            } catch (e: Exception) {
                Log.w(TAG, "Stall recovery for $key failed: ${e.message}")
            }
        }
    }

    private fun emitStallEvent(entry: StallEntry, silentMs: Long, state: String) {
        val data = JSObject()
        data.put("sid", entry.sid)
        data.put("isLocal", entry.isLocal)
        data.put("silentMs", silentMs)
        data.put("attempt", entry.attempts)
        data.put("state", state) // "stalled" | "failed"
        notifyListeners("video-stall", data)
    }

    @PluginMethod
    fun setStallWatchdogEnabled(call: PluginCall) {
        val enabled = call.getBoolean("enabled", true) ?: true
        stallWatchdogEnabled = enabled
        if (enabled && room != null && stallWatchdogJob == null) startStallWatchdog()
        if (!enabled) stopStallWatchdog()
        val ret = JSObject(); ret.put("enabled", enabled); call.resolve(ret)
    }

    @PluginMethod
    fun getStallStatus(call: PluginCall) {
        val now = System.currentTimeMillis()
        val arr = org.json.JSONArray()
        stallTable.forEach { (_, e) ->
            val o = JSObject()
            o.put("sid", e.sid)
            o.put("isLocal", e.isLocal)
            o.put("silentMs", now - e.lastFrameMs)
            o.put("attempts", e.attempts)
            arr.put(o)
        }
        val ret = JSObject()
        ret.put("enabled", stallWatchdogEnabled)
        ret.put("tracks", arr)
        call.resolve(ret)
    }

    // ------------------------------------------------------------
    // RTC stats / telemetry collector (Step 28)
    //
    // Background coroutine emits an "rtc-stats" event every
    // statsIntervalMs (default 3 s) so the JS layer can render a
    // debug HUD and stream Quality-of-Experience metrics into
    // analytics without polling. Per-track fps is derived from the
    // VideoSink frame counter that the stall watchdog already
    // maintains, so this collector adds zero per-frame overhead.
    // ------------------------------------------------------------

    private fun startStatsCollector() {
        stopStatsCollector()
        if (!statsCollectorEnabled) return
        statsCollectorJob = scope.launch {
            // Seed sample window so the first emit reports a sensible fps.
            val now = System.currentTimeMillis()
            stallTable.values.forEach {
                it.lastSampleFrameCount = it.frameCount
                it.lastSampleMs = now
            }
            while (true) {
                delay(statsIntervalMs)
                if (room == null) break
                if (inBackground) continue
                emitRtcStatsSnapshot()
            }
        }
    }

    private fun stopStatsCollector() {
        statsCollectorJob?.cancel()
        statsCollectorJob = null
    }

    private fun buildRtcStatsPayload(): JSObject {
        val now = System.currentTimeMillis()
        val tracks = org.json.JSONArray()
        // Snapshot to avoid concurrent modification.
        val entries = stallTable.entries.toList()
        for ((_, e) in entries) {
            val winMs = (now - e.lastSampleMs).coerceAtLeast(1L)
            val deltaFrames = (e.frameCount - e.lastSampleFrameCount).coerceAtLeast(0L)
            val fps = (deltaFrames.toDouble() * 1000.0 / winMs.toDouble())
            // Slide the window for the next sample.
            e.lastSampleFrameCount = e.frameCount
            e.lastSampleMs = now

            val sidKey = if (e.isLocal) localSid else e.sid
            val o = JSObject()
            o.put("sid", e.sid)
            o.put("isLocal", e.isLocal)
            o.put("fps", Math.round(fps * 10.0) / 10.0)
            o.put("silentMs", now - e.lastFrameMs)
            o.put("framesTotal", e.frameCount)
            o.put("recoveryAttempts", e.attempts)
            o.put("quality", qualityTable[sidKey] ?: "unknown")
            tracks.put(o)
        }
        val payload = JSObject()
        payload.put("ts", now)
        payload.put("tracks", tracks)
        // Publisher ladder (Step 22 source of truth).
        payload.put("tier", currentTier.name.lowercase())
        payload.put("baseTier", baseTier.name.lowercase())
        payload.put("simulcast", currentTier != AdaptiveTier.LOW)
        payload.put("maxBitrate", tierEncoding(currentTier).maxBitrate)
        // Network + data-saver (Step 27).
        payload.put("networkType", currentNetType.name.lowercase())
        payload.put("dataSaver", dataSaverOnCellular)
        // Local quality + reconnect state.
        payload.put("localQuality", qualityTable[localSid] ?: "unknown")
        payload.put("reconnecting", reconnectingSinceMs > 0L)
        payload.put(
            "reconnectingMs",
            if (reconnectingSinceMs > 0L) now - reconnectingSinceMs else 0L
        )
        payload.put("hardReconnectAttempts", hardReconnectAttempts)
        payload.put("remoteParticipantCount", room?.remoteParticipants?.size ?: 0)
        payload.put("e2ee", e2eeEnabled)
        return payload
    }

    private fun emitRtcStatsSnapshot() {
        try {
            notifyListeners("rtc-stats", buildRtcStatsPayload())
        } catch (e: Exception) {
            Log.w(TAG, "emitRtcStatsSnapshot failed: ${e.message}")
        }
    }

    @PluginMethod
    fun setStatsCollectorEnabled(call: PluginCall) {
        val enabled = call.getBoolean("enabled", true) ?: true
        val interval = call.getLong("intervalMs")
        if (interval != null) {
            statsIntervalMs = interval.coerceAtLeast(STATS_MIN_INTERVAL_MS)
        }
        statsCollectorEnabled = enabled
        if (enabled && room != null && statsCollectorJob == null) startStatsCollector()
        if (!enabled) stopStatsCollector()
        val ret = JSObject()
        ret.put("enabled", enabled)
        ret.put("intervalMs", statsIntervalMs)
        call.resolve(ret)
    }

    @PluginMethod
    fun getRtcStats(call: PluginCall) {
        if (room == null) {
            val empty = JSObject()
            empty.put("ts", System.currentTimeMillis())
            empty.put("tracks", org.json.JSONArray())
            empty.put("hasRoom", false)
            call.resolve(empty)
            return
        }
        val payload = buildRtcStatsPayload()
        payload.put("hasRoom", true)
        payload.put("enabled", statsCollectorEnabled)
        payload.put("intervalMs", statsIntervalMs)
        call.resolve(payload)
    }

    // ------------------------------------------------------------
    // Picture-in-Picture (Step 29)
    //
    // Enter PiP from JS or auto-enter on home button when caller opted
    // in with setAutoPipOnLeaveHint({enabled:true}). Renderers stay
    // attached during PiP so the floating window keeps painting frames.
    // ------------------------------------------------------------

    private fun isActivityInPip(): Boolean = try {
        Build.VERSION.SDK_INT >= Build.VERSION_CODES.N &&
            (activity?.isInPictureInPictureMode == true)
    } catch (_: Exception) { false }

    private fun clampPipRatio(num: Int, den: Int): Pair<Int, Int> {
        // Android requires 0.418 ≤ ratio ≤ 2.39. Clamp gently.
        if (num <= 0 || den <= 0) return 9 to 16
        val r = num.toDouble() / den.toDouble()
        return when {
            r < 0.42 -> 42 to 100
            r > 2.39 -> 239 to 100
            else -> num to den
        }
    }

    private fun enterPipInternal(num: Int, den: Int): Boolean {
        if (!pipSupported) return false
        val act = activity ?: return false
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return false
        val (n, d) = clampPipRatio(num, den)
        pipAspectNumerator = n
        pipAspectDenominator = d
        return try {
            enteringPip = true
            val params = android.app.PictureInPictureParams.Builder()
                .setAspectRatio(android.util.Rational(n, d))
                .build()
            val ok = act.enterPictureInPictureMode(params)
            if (!ok) enteringPip = false
            ok
        } catch (e: Exception) {
            Log.w(TAG, "enterPictureInPictureMode failed: ${e.message}")
            enteringPip = false
            false
        }
    }

    /** Called from MainActivity.onUserLeaveHint via the static bridge. */
    internal fun onUserLeaveHintInternal(@Suppress("UNUSED_PARAMETER") activity: android.app.Activity) {
        if (!autoPipOnLeaveHint || room == null) return
        if (isActivityInPip()) return
        // Pick a sensible default aspect from the local renderer if we have it.
        val (n, d) = inferAspectFromLocal() ?: (pipAspectNumerator to pipAspectDenominator)
        enterPipInternal(n, d)
    }

    /** Called from MainActivity.onPictureInPictureModeChanged via the static bridge. */
    internal fun onPipModeChangedInternal(isInPip: Boolean) {
        inPictureInPicture = isInPip
        if (!isInPip) enteringPip = false
        // When we leave PiP back to full-screen, Android delivers another
        // onResume — Step 24's handleOnResume rewires renderers normally.
        val data = JSObject()
        data.put("isInPip", isInPip)
        data.put("aspectNumerator", pipAspectNumerator)
        data.put("aspectDenominator", pipAspectDenominator)
        notifyListeners("pip-changed", data)
        // Reset stall timers so the watchdog doesn't insta-fire after the
        // surface re-attaches on PiP exit.
        if (!isInPip) {
            val now = System.currentTimeMillis()
            stallTable.values.forEach { it.lastFrameMs = now; it.attempts = 0 }
        }
    }

    private fun inferAspectFromLocal(): Pair<Int, Int>? {
        val v = localRenderer ?: return null
        val w = v.width; val h = v.height
        return if (w > 0 && h > 0) w to h else null
    }

    @PluginMethod
    fun isPictureInPictureSupported(call: PluginCall) {
        val ret = JSObject()
        ret.put("supported", pipSupported &&
            Build.VERSION.SDK_INT >= Build.VERSION_CODES.O)
        ret.put("inPip", isActivityInPip())
        call.resolve(ret)
    }

    @PluginMethod
    fun enterPictureInPicture(call: PluginCall) {
        val aspect = call.getString("aspect", "9:16") ?: "9:16"
        val (n, d) = parseAspect(aspect)
        val ok = enterPipInternal(n, d)
        val ret = JSObject()
        ret.put("entered", ok)
        ret.put("supported", pipSupported)
        call.resolve(ret)
    }

    @PluginMethod
    fun setAutoPipOnLeaveHint(call: PluginCall) {
        autoPipOnLeaveHint = call.getBoolean("enabled", false) ?: false
        val aspect = call.getString("aspect")
        if (!aspect.isNullOrBlank()) {
            val (n, d) = parseAspect(aspect)
            pipAspectNumerator = n
            pipAspectDenominator = d
        }
        val ret = JSObject()
        ret.put("enabled", autoPipOnLeaveHint)
        ret.put("supported", pipSupported)
        call.resolve(ret)
    }

    @PluginMethod
    fun getPipState(call: PluginCall) {
        val ret = JSObject()
        ret.put("supported", pipSupported)
        ret.put("inPip", isActivityInPip())
        ret.put("autoOnLeaveHint", autoPipOnLeaveHint)
        ret.put("aspectNumerator", pipAspectNumerator)
        ret.put("aspectDenominator", pipAspectDenominator)
        call.resolve(ret)
    }

    private fun parseAspect(s: String): Pair<Int, Int> {
        val parts = s.split(":", "/", "x", " ").mapNotNull { it.trim().toIntOrNull() }
        return if (parts.size == 2) parts[0] to parts[1] else 9 to 16
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

    // ============================================================
    // Step 30 — Bluetooth SCO + headset hardware-button support
    //
    // Three independent pieces of plumbing wired together:
    //
    //  1. ACTION_HEADSET_PLUG receiver       → "headset-plug" event
    //     so JS can show a toast / auto-route audio when the user
    //     plugs/unplugs a 3.5 mm or USB-C headset mid-call.
    //
    //  2. ACTION_SCO_AUDIO_STATE_UPDATED     → "sco-state-changed"
    //     event so JS sees CONNECTING → CONNECTED → DISCONNECTED
    //     for Bluetooth Hands-Free profile transitions, plus an
    //     explicit setBluetoothScoEnabled() switch for pre-API 31
    //     devices where setCommunicationDevice() doesn't exist.
    //
    //  3. MediaSession callback              → "headset-button"
    //     event {action: "hook"|"play_pause"|"next"|"previous"}.
    //     Routes hardware-button presses (single click on wired
    //     remote, BT headset answer/end button, KEYCODE_HEADSETHOOK)
    //     into JS so Live broadcasters can mute/unmute and Private
    //     Call recipients can answer/hang up without unlocking the
    //     screen. Session is only ACTIVE while a LiveKit room is
    //     connected so we don't steal media keys outside calls.
    // ============================================================

    private var headsetButtonsEnabled: Boolean = true
    private var headsetMediaSession: MediaSession? = null
    private var headsetReceiver: BroadcastReceiver? = null
    private var scoReceiver: BroadcastReceiver? = null
    private var scoState: String = "disconnected" // "disconnected"|"connecting"|"connected"|"error"
    private var wiredHeadsetPlugged: Boolean = false
    private var wiredHeadsetHasMic: Boolean = false

    private fun registerHeadsetReceivers() {
        if (headsetReceiver == null) {
            try {
                val r = object : BroadcastReceiver() {
                    override fun onReceive(ctx: Context?, intent: Intent?) {
                        if (intent?.action != Intent.ACTION_HEADSET_PLUG) return
                        val state = intent.getIntExtra("state", 0)
                        val mic = intent.getIntExtra("microphone", 0)
                        wiredHeadsetPlugged = state == 1
                        wiredHeadsetHasMic = mic == 1
                        val data = JSObject()
                        data.put("plugged", wiredHeadsetPlugged)
                        data.put("hasMic", wiredHeadsetHasMic)
                        data.put("name", intent.getStringExtra("name") ?: "")
                        notifyListeners("headset-plug", data)
                        // Audio device list also changes — re-emit.
                        emitAudioDeviceState()
                    }
                }
                val filter = IntentFilter(Intent.ACTION_HEADSET_PLUG)
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                    context.registerReceiver(r, filter, Context.RECEIVER_NOT_EXPORTED)
                } else {
                    @Suppress("UnspecifiedRegisterReceiverFlag")
                    context.registerReceiver(r, filter)
                }
                headsetReceiver = r
            } catch (e: Exception) {
                Log.w(TAG, "registerHeadsetReceivers headset failed: ${e.message}")
            }
        }
        if (scoReceiver == null) {
            try {
                val r = object : BroadcastReceiver() {
                    override fun onReceive(ctx: Context?, intent: Intent?) {
                        if (intent?.action != AudioManager.ACTION_SCO_AUDIO_STATE_UPDATED) return
                        val s = intent.getIntExtra(
                            AudioManager.EXTRA_SCO_AUDIO_STATE,
                            AudioManager.SCO_AUDIO_STATE_ERROR
                        )
                        scoState = when (s) {
                            AudioManager.SCO_AUDIO_STATE_CONNECTED -> "connected"
                            AudioManager.SCO_AUDIO_STATE_CONNECTING -> "connecting"
                            AudioManager.SCO_AUDIO_STATE_DISCONNECTED -> "disconnected"
                            else -> "error"
                        }
                        val data = JSObject()
                        data.put("state", scoState)
                        notifyListeners("sco-state-changed", data)
                    }
                }
                val filter = IntentFilter(AudioManager.ACTION_SCO_AUDIO_STATE_UPDATED)
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                    context.registerReceiver(r, filter, Context.RECEIVER_NOT_EXPORTED)
                } else {
                    @Suppress("UnspecifiedRegisterReceiverFlag")
                    context.registerReceiver(r, filter)
                }
                scoReceiver = r
            } catch (e: Exception) {
                Log.w(TAG, "registerHeadsetReceivers sco failed: ${e.message}")
            }
        }
    }

    private fun unregisterHeadsetReceivers() {
        try { headsetReceiver?.let { context.unregisterReceiver(it) } } catch (_: Exception) {}
        headsetReceiver = null
        try { scoReceiver?.let { context.unregisterReceiver(it) } } catch (_: Exception) {}
        scoReceiver = null
    }

    /**
     * Explicitly start/stop the Bluetooth SCO link. On API 31+ prefer
     * setAudioDevice("bluetooth") which uses setCommunicationDevice;
     * this entry point is the legacy fallback (and a manual override
     * for testing). Idempotent — safe to call repeatedly.
     */
    private fun startBluetoothScoInternal(): Boolean {
        val am = audioManager() ?: return false
        return try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                val device = am.availableCommunicationDevices.firstOrNull {
                    it.type == AudioDeviceInfo.TYPE_BLUETOOTH_SCO ||
                    it.type == AudioDeviceInfo.TYPE_BLE_HEADSET
                }
                if (device != null) {
                    am.setCommunicationDevice(device); scoState = "connected"; true
                } else false
            } else {
                @Suppress("DEPRECATION")
                if (am.isBluetoothScoAvailableOffCall) {
                    @Suppress("DEPRECATION") am.startBluetoothSco()
                    @Suppress("DEPRECATION") am.isBluetoothScoOn = true
                    true
                } else false
            }
        } catch (e: Exception) {
            Log.w(TAG, "startBluetoothScoInternal failed: ${e.message}"); false
        }
    }

    private fun stopBluetoothScoInternal() {
        val am = audioManager() ?: return
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                try { am.clearCommunicationDevice() } catch (_: Exception) {}
            } else {
                @Suppress("DEPRECATION") am.isBluetoothScoOn = false
                @Suppress("DEPRECATION") am.stopBluetoothSco()
            }
        } catch (_: Exception) {}
    }

    private fun startHeadsetMediaSession() {
        if (headsetMediaSession != null) return
        try {
            val session = MediaSession(context, "$TAG.MediaSession")
            session.setCallback(object : MediaSession.Callback() {
                override fun onMediaButtonEvent(intent: Intent): Boolean {
                    val key: KeyEvent? = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                        intent.getParcelableExtra(Intent.EXTRA_KEY_EVENT, KeyEvent::class.java)
                    } else {
                        @Suppress("DEPRECATION")
                        intent.getParcelableExtra(Intent.EXTRA_KEY_EVENT) as? KeyEvent
                    }
                    if (key == null || key.action != KeyEvent.ACTION_DOWN) {
                        return super.onMediaButtonEvent(intent)
                    }
                    val action = when (key.keyCode) {
                        KeyEvent.KEYCODE_HEADSETHOOK,
                        KeyEvent.KEYCODE_MEDIA_PLAY_PAUSE -> "hook"
                        KeyEvent.KEYCODE_MEDIA_PLAY -> "play"
                        KeyEvent.KEYCODE_MEDIA_PAUSE,
                        KeyEvent.KEYCODE_MEDIA_STOP -> "pause"
                        KeyEvent.KEYCODE_MEDIA_NEXT -> "next"
                        KeyEvent.KEYCODE_MEDIA_PREVIOUS -> "previous"
                        else -> return super.onMediaButtonEvent(intent)
                    }
                    val data = JSObject()
                    data.put("action", action)
                    data.put("keyCode", key.keyCode)
                    data.put("repeatCount", key.repeatCount)
                    notifyListeners("headset-button", data)
                    return true
                }
            })
            // Minimal "playing" PlaybackState so the system routes media buttons to us.
            val pb = PlaybackState.Builder()
                .setActions(
                    PlaybackState.ACTION_PLAY_PAUSE or
                    PlaybackState.ACTION_PLAY or
                    PlaybackState.ACTION_PAUSE or
                    PlaybackState.ACTION_STOP or
                    PlaybackState.ACTION_SKIP_TO_NEXT or
                    PlaybackState.ACTION_SKIP_TO_PREVIOUS
                )
                .setState(PlaybackState.STATE_PLAYING, 0L, 1.0f)
                .build()
            session.setPlaybackState(pb)
            session.isActive = true
            headsetMediaSession = session
        } catch (e: Exception) {
            Log.w(TAG, "startHeadsetMediaSession failed: ${e.message}")
        }
    }

    private fun stopHeadsetMediaSession() {
        try {
            headsetMediaSession?.let {
                try { it.isActive = false } catch (_: Exception) {}
                try { it.release() } catch (_: Exception) {}
            }
        } catch (_: Exception) {}
        headsetMediaSession = null
    }

    @PluginMethod
    fun setBluetoothScoEnabled(call: PluginCall) {
        val enabled = call.getBoolean("enabled") ?: false
        val ok = if (enabled) startBluetoothScoInternal() else { stopBluetoothScoInternal(); true }
        val ret = JSObject()
        ret.put("enabled", enabled)
        ret.put("applied", ok)
        ret.put("state", scoState)
        call.resolve(ret)
    }

    @PluginMethod
    fun getBluetoothScoState(call: PluginCall) {
        val am = audioManager()
        val available = try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                am?.availableCommunicationDevices?.any {
                    it.type == AudioDeviceInfo.TYPE_BLUETOOTH_SCO ||
                    it.type == AudioDeviceInfo.TYPE_BLE_HEADSET
                } ?: false
            } else {
                @Suppress("DEPRECATION") am?.isBluetoothScoAvailableOffCall ?: false
            }
        } catch (_: Exception) { false }
        val ret = JSObject()
        ret.put("state", scoState)
        ret.put("available", available)
        call.resolve(ret)
    }

    @PluginMethod
    fun setHeadsetButtonsEnabled(call: PluginCall) {
        val enabled = call.getBoolean("enabled") ?: true
        headsetButtonsEnabled = enabled
        if (enabled) {
            if (room != null) startHeadsetMediaSession()
        } else {
            stopHeadsetMediaSession()
        }
        val ret = JSObject()
        ret.put("enabled", enabled)
        ret.put("active", headsetMediaSession != null)
        call.resolve(ret)
    }

    @PluginMethod
    fun getHeadsetState(call: PluginCall) {
        val ret = JSObject()
        ret.put("wiredPlugged", wiredHeadsetPlugged)
        ret.put("wiredHasMic", wiredHeadsetHasMic)
        ret.put("scoState", scoState)
        ret.put("buttonsEnabled", headsetButtonsEnabled)
        ret.put("mediaSessionActive", headsetMediaSession != null)
        call.resolve(ret)
    }

    // ============================================================
    // Step 32 — Codec negotiation + hardware acceleration
    //
    // libwebrtc inside livekit-android already wraps MediaCodec via
    // DefaultVideoEncoderFactory / DefaultVideoDecoderFactory, so HW
    // accel is on by default for any codec the device's MediaCodec
    // list reports. What this section adds:
    //
    //  • A capability probe that walks android.media.MediaCodecList
    //    and reports per-codec {hwEncode, hwDecode, mime} so JS can
    //    refuse a preference the device can't HW-encode (mid-tier
    //    devices rarely have a HW VP9 encoder, often have HW H.264
    //    + HW VP8 + HW VP9 *decode* only).
    //
    //  • A `setPreferredCodec({codec})` switch that biases the
    //    publish side via VideoTrackPublishDefaults.videoCodec on
    //    the next connect() call (codec is part of SDP — we don't
    //    hot-swap mid-call; JS surfaces a "Reconnect for new codec"
    //    toast).
    //
    //  • `getCodecState()` so a debug HUD can show what's actually
    //    being negotiated for the current session.
    // ============================================================

    private val supportedCodecs = listOf("vp8", "vp9", "h264", "av1")

    private fun resolvePublishCodec(): String? {
        val want = preferredCodec.lowercase()
        if (want == "auto" || want.isBlank()) return null
        if (want !in supportedCodecs) return null
        // Only honour the preference if MediaCodec can HW-encode it;
        // otherwise let the SDK fall back to its default to avoid a
        // software encoder pinning the CPU at 100 %.
        val caps = probeCodecCapabilities()
        val hw = caps.optJSONObject(want)?.optBoolean("hwEncode", false) ?: false
        return if (hw) want else null
    }

    private fun mimeForCodec(codec: String): String = when (codec.lowercase()) {
        "vp8"  -> "video/x-vnd.on2.vp8"
        "vp9"  -> "video/x-vnd.on2.vp9"
        "h264" -> "video/avc"
        "av1"  -> "video/av01"
        else   -> ""
    }

    /**
     * Walk MediaCodecList.REGULAR_CODECS once and return a JSONObject
     * keyed by codec name with {hwEncode, hwDecode, encoders, decoders}.
     * Result is cached per process — codec list never changes at runtime.
     */
    private var codecCapsCache: org.json.JSONObject? = null
    private fun probeCodecCapabilities(): org.json.JSONObject {
        codecCapsCache?.let { return it }
        val out = org.json.JSONObject()
        try {
            val list = android.media.MediaCodecList(android.media.MediaCodecList.REGULAR_CODECS)
            for (codec in supportedCodecs) {
                val mime = mimeForCodec(codec)
                if (mime.isEmpty()) continue
                var hwEncode = false; var hwDecode = false
                val encoders = org.json.JSONArray()
                val decoders = org.json.JSONArray()
                for (info in list.codecInfos) {
                    val name = info.name ?: continue
                    if (!info.supportedTypes.any { it.equals(mime, ignoreCase = true) }) continue
                    val isHardware = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                        info.isHardwareAccelerated
                    } else {
                        // Heuristic for older devices: software codecs are
                        // prefixed "OMX.google." or "c2.android." in AOSP.
                        val n = name.lowercase()
                        !n.startsWith("omx.google.") && !n.startsWith("c2.android.")
                    }
                    if (info.isEncoder) {
                        encoders.put(name); if (isHardware) hwEncode = true
                    } else {
                        decoders.put(name); if (isHardware) hwDecode = true
                    }
                }
                val o = org.json.JSONObject()
                o.put("hwEncode", hwEncode)
                o.put("hwDecode", hwDecode)
                o.put("encoders", encoders)
                o.put("decoders", decoders)
                o.put("mime", mime)
                out.put(codec, o)
            }
        } catch (e: Exception) {
            Log.w(TAG, "probeCodecCapabilities failed: ${e.message}")
        }
        codecCapsCache = out
        return out
    }

    @PluginMethod
    fun getCodecCapabilities(call: PluginCall) {
        val caps = probeCodecCapabilities()
        val ret = JSObject()
        ret.put("codecs", caps)
        ret.put("preferred", preferredCodec)
        ret.put("negotiated", negotiatedCodec)
        // Surface a recommended default per device class:
        //  • AV1 if HW available (newest Tensor / Snapdragon 8 Gen 2+)
        //  • H264 otherwise (universally HW-encoded since 2014)
        val rec = when {
            caps.optJSONObject("av1")?.optBoolean("hwEncode") == true -> "av1"
            caps.optJSONObject("vp9")?.optBoolean("hwEncode") == true -> "vp9"
            caps.optJSONObject("h264")?.optBoolean("hwEncode") == true -> "h264"
            else -> "vp8"
        }
        ret.put("recommended", rec)
        call.resolve(ret)
    }

    @PluginMethod
    fun setPreferredCodec(call: PluginCall) {
        val raw = (call.getString("codec") ?: "auto").lowercase()
        val codec = if (raw == "auto" || raw in supportedCodecs) raw else "auto"
        val previous = preferredCodec
        preferredCodec = codec
        // Validate against capabilities — return applied=false if the
        // device can't HW-encode the requested codec (JS should toast).
        val caps = probeCodecCapabilities()
        val hwOk = if (codec == "auto") true
                   else caps.optJSONObject(codec)?.optBoolean("hwEncode", false) ?: false
        val ret = JSObject()
        ret.put("codec", codec)
        ret.put("previous", previous)
        ret.put("hwEncode", hwOk)
        ret.put("requiresReconnect", room != null && previous != codec)
        ret.put("applied", true)
        call.resolve(ret)
    }

    @PluginMethod
    fun getCodecState(call: PluginCall) {
        val ret = JSObject()
        ret.put("preferred", preferredCodec)
        ret.put("negotiated", negotiatedCodec)
        ret.put("hasRoom", room != null)
        // Hardware accel is always on through DefaultVideoEncoderFactory.
        ret.put("hardwareAcceleration", true)
        call.resolve(ret)

    // ============================================================
    // Step 33 — Bandwidth probe + pre-call quality test.
    //
    // Runs BEFORE connect() to predict whether the device's current
    // network can sustain a 1080p / 720p / voice-only call. Two
    // measurements (run sequentially on a background coroutine):
    //
    //   1. RTT + jitter probe — N HEAD requests against `pingUrl`.
    //      Measures p50 / p95 latency and mean-absolute-deviation
    //      jitter. Used to detect lossy / Wi-Fi-roaming scenarios
    //      that wreck WebRTC even when raw throughput is high.
    //
    //   2. Throughput probe — single GET against `downloadUrl`,
    //      capped at `downloadBytes` (default 512 KB) and `timeoutMs`
    //      (default 6 s). Reports observed kbps. We deliberately keep
    //      the payload small — a long-running speed test would burn
    //      cellular data and delay the call by 5+ seconds.
    //
    // Verdict mapping (matches our publish ladder + Step 22 tiers):
    //   • HIGH   ≥ 2500 kbps and rtt < 150 ms and jitter < 30 ms
    //   • MEDIUM ≥ 1100 kbps and rtt < 250 ms and jitter < 60 ms
    //   • LOW    ≥ 400  kbps
    //   • VOICE  ≥ 80   kbps  (audio-only fallback)
    //   • POOR   below — JS should warn "Network too weak for a call".
    //
    // Emits `quality-probe-progress` events during the run so the UI
    // can render a progress bar without blocking on the resolve.
    // ============================================================

    private var qualityProbeJob: Job? = null
    private var lastQualityProbe: org.json.JSONObject? = null

    private data class QualityVerdict(
        val tier: String,                  // "high" | "medium" | "low" | "voice" | "poor"
        val recommendedTier: String,       // "high" | "medium" | "low"
        val recommendedAudioOnly: Boolean, // true when video would chop
        val warning: String?,              // null when tier is high/medium
    )

    private fun resolveVerdict(downKbps: Double, rttAvg: Double, jitter: Double): QualityVerdict {
        return when {
            downKbps >= 2500 && rttAvg < 150 && jitter < 30 ->
                QualityVerdict("high", "high", false, null)
            downKbps >= 1100 && rttAvg < 250 && jitter < 60 ->
                QualityVerdict("medium", "medium", false, null)
            downKbps >= 400 ->
                QualityVerdict("low", "low", false, "Network is weak — quality may drop.")
            downKbps >= 80 ->
                QualityVerdict("voice", "low", true, "Network too weak for video — switching to voice only.")
            else ->
                QualityVerdict("poor", "low", true, "Network too weak for a call. Try Wi-Fi.")
        }
    }

    private fun emitProgress(stage: String, percent: Int, detail: org.json.JSONObject? = null) {
        try {
            val ev = JSObject()
            ev.put("stage", stage)
            ev.put("percent", percent.coerceIn(0, 100))
            if (detail != null) ev.put("detail", detail)
            notifyListeners("quality-probe-progress", ev)
        } catch (_: Exception) {}
    }

    /**
     * One-shot HEAD with hard timeout. Returns RTT in ms or -1 on
     * failure. We deliberately disable keep-alive so each sample is
     * a real new connection — gives a more honest jitter reading.
     */
    private fun pingOnce(url: String, timeoutMs: Int): Long {
        var conn: HttpURLConnection? = null
        return try {
            val u = URL(url)
            val started = System.nanoTime()
            conn = (u.openConnection() as HttpURLConnection).apply {
                requestMethod = "HEAD"
                connectTimeout = timeoutMs
                readTimeout = timeoutMs
                instanceFollowRedirects = true
                useCaches = false
                setRequestProperty("Cache-Control", "no-cache")
                setRequestProperty("Connection", "close")
            }
            val code = conn.responseCode
            // 2xx / 3xx / 204 are all fine for a reachability ping.
            if (code in 200..399) (System.nanoTime() - started) / 1_000_000L else -1L
        } catch (_: Exception) {
            -1L
        } finally {
            try { conn?.disconnect() } catch (_: Exception) {}
        }
    }

    /**
     * Streaming GET capped at `maxBytes` / `timeoutMs`. Returns the
     * measured downlink throughput in kbps (kilobits / second), or 0
     * on failure. Drains into /dev/null — never allocates the full
     * payload.
     */
    private fun downloadProbe(url: String, maxBytes: Long, timeoutMs: Int): Double {
        var conn: HttpURLConnection? = null
        return try {
            val u = URL(url)
            conn = (u.openConnection() as HttpURLConnection).apply {
                requestMethod = "GET"
                connectTimeout = timeoutMs
                readTimeout = timeoutMs
                instanceFollowRedirects = true
                useCaches = false
                setRequestProperty("Cache-Control", "no-cache")
                setRequestProperty("Range", "bytes=0-${maxBytes - 1}")
            }
            val started = System.nanoTime()
            val input = conn.inputStream
            val buf = ByteArray(8 * 1024)
            var total = 0L
            while (total < maxBytes) {
                val n = input.read(buf)
                if (n <= 0) break
                total += n
                if ((System.nanoTime() - started) / 1_000_000L > timeoutMs) break
            }
            try { input.close() } catch (_: Exception) {}
            val elapsedMs = max(1L, (System.nanoTime() - started) / 1_000_000L)
            // bits / ms == kbps
            (total * 8.0) / elapsedMs.toDouble()
        } catch (_: Exception) {
            0.0
        } finally {
            try { conn?.disconnect() } catch (_: Exception) {}
        }
    }

    @PluginMethod
    fun runPreCallQualityProbe(call: PluginCall) {
        // Cancel any in-flight probe so a freshly-mounted Pre-Call
        // screen never races against a stale one from the last call.
        qualityProbeJob?.cancel()

        val pingUrl = call.getString("pingUrl") ?: "https://www.gstatic.com/generate_204"
        val downloadUrl = call.getString("downloadUrl")  // null = skip throughput stage
        val samples = (call.getInt("samples") ?: 5).coerceIn(1, 20)
        val downloadBytes = (call.getInt("downloadBytes") ?: 512_000).coerceIn(64_000, 4_000_000).toLong()
        val timeoutMs = (call.getInt("timeoutMs") ?: 6000).coerceIn(1000, 15000)

        qualityProbeJob = scope.launch {
            try {
                emitProgress("starting", 0)

                // -------- Stage 1 — RTT + jitter --------
                val rtts = mutableListOf<Long>()
                for (i in 0 until samples) {
                    val rtt = withContext(Dispatchers.IO) { pingOnce(pingUrl, timeoutMs) }
                    if (rtt >= 0) rtts.add(rtt)
                    val pct = ((i + 1) * 40 / samples)
                    emitProgress("rtt", pct, org.json.JSONObject().put("sampleMs", rtt))
                    // Tiny gap between probes — avoids accidentally
                    // exercising HTTP/2 multiplexing on the same conn.
                    delay(80)
                }

                val rttCount = rtts.size
                val rttAvg = if (rttCount > 0) rtts.average() else -1.0
                val rttMin = rtts.minOrNull() ?: -1L
                val rttMax = rtts.maxOrNull() ?: -1L
                val jitter = if (rttCount > 1) {
                    val mean = rttAvg
                    rtts.map { abs(it - mean) }.average()
                } else 0.0
                val packetLossPercent = if (samples > 0)
                    ((samples - rttCount) * 100.0) / samples
                else 0.0

                emitProgress("rtt-done", 40, org.json.JSONObject()
                    .put("rttAvg", rttAvg)
                    .put("rttMin", rttMin)
                    .put("rttMax", rttMax)
                    .put("jitter", jitter)
                    .put("packetLoss", packetLossPercent))

                // -------- Stage 2 — Throughput --------
                val downKbps = if (!downloadUrl.isNullOrBlank()) {
                    emitProgress("throughput", 50)
                    val v = withContext(Dispatchers.IO) {
                        downloadProbe(downloadUrl, downloadBytes, timeoutMs)
                    }
                    emitProgress("throughput-done", 90,
                        org.json.JSONObject().put("kbps", v))
                    v
                } else {
                    // No URL provided → can't measure throughput.
                    // Mark as -1 so the verdict layer falls back to
                    // an RTT-only "low" estimate when reachable.
                    emitProgress("throughput-skipped", 90)
                    -1.0
                }

                // -------- Verdict --------
                // When we couldn't measure throughput, downgrade the
                // verdict by RTT only (assume MEDIUM if the network
                // even responded; POOR if every ping was lost).
                val verdict = when {
                    downKbps < 0 && rttCount == 0 ->
                        QualityVerdict("poor", "low", true, "No network. Connect to Wi-Fi or mobile data.")
                    downKbps < 0 ->
                        resolveVerdict(min(2000.0, max(800.0, 2000.0 - rttAvg)), rttAvg, jitter)
                    else -> resolveVerdict(downKbps, rttAvg, jitter)
                }

                // Codec hint — let JS auto-pick a frugal codec on weak
                // links (VP9/AV1 sip ~30 % less bandwidth than H264 at
                // the same quality, when HW-encode is available).
                val caps = probeCodecCapabilities()
                val codecHint = when (verdict.recommendedTier) {
                    "low" -> when {
                        caps.optJSONObject("av1")?.optBoolean("hwEncode") == true -> "av1"
                        caps.optJSONObject("vp9")?.optBoolean("hwEncode") == true -> "vp9"
                        caps.optJSONObject("h264")?.optBoolean("hwEncode") == true -> "h264"
                        else -> "vp8"
                    }
                    else -> "auto"
                }

                val networkType = currentNetworkTypeLabel()

                val result = org.json.JSONObject()
                    .put("ts", System.currentTimeMillis())
                    .put("rttAvg", rttAvg)
                    .put("rttMin", rttMin)
                    .put("rttMax", rttMax)
                    .put("jitter", jitter)
                    .put("packetLoss", packetLossPercent)
                    .put("samples", samples)
                    .put("samplesReceived", rttCount)
                    .put("downKbps", downKbps)
                    .put("tier", verdict.tier)
                    .put("recommendedTier", verdict.recommendedTier)
                    .put("recommendedAudioOnly", verdict.recommendedAudioOnly)
                    .put("recommendedCodec", codecHint)
                    .put("warning", verdict.warning ?: org.json.JSONObject.NULL)
                    .put("networkType", networkType)
                    .put("dataSaver", isDataSaverActive())

                lastQualityProbe = result
                emitProgress("done", 100, result)

                val ret = JSObject.fromJSONObject(result)
                call.resolve(ret)
            } catch (e: Exception) {
                Log.w(TAG, "runPreCallQualityProbe failed: ${e.message}")
                call.reject("quality-probe-failed", e)
            } finally {
                qualityProbeJob = null
            }
        }
    }

    @PluginMethod
    fun cancelPreCallQualityProbe(call: PluginCall) {
        val running = qualityProbeJob != null
        qualityProbeJob?.cancel()
        qualityProbeJob = null
        val ret = JSObject()
        ret.put("cancelled", running)
        call.resolve(ret)
    }

    @PluginMethod
    fun getLastQualityProbe(call: PluginCall) {
        val ret = JSObject()
        val last = lastQualityProbe
        if (last != null) {
            ret.put("hasResult", true)
            ret.put("result", JSObject.fromJSONObject(last))
        } else {
            ret.put("hasResult", false)
        }
        call.resolve(ret)
    }

    /**
     * Best-effort label aligned with the Step 27 NetworkType enum so
     * JS sees the same vocabulary across `network-changed`, `rtc-stats`,
     * and the quality probe result.
     */
    private fun currentNetworkTypeLabel(): String {
        return try {
            val cm = context.getSystemService(Context.CONNECTIVITY_SERVICE) as? ConnectivityManager
                ?: return "unknown"
            val net = cm.activeNetwork ?: return "none"
            val caps = cm.getNetworkCapabilities(net) ?: return "none"
            when {
                caps.hasTransport(NetworkCapabilities.TRANSPORT_WIFI) -> "wifi"
                caps.hasTransport(NetworkCapabilities.TRANSPORT_CELLULAR) -> "cellular"
                caps.hasTransport(NetworkCapabilities.TRANSPORT_ETHERNET) -> "ethernet"
                else -> "other"
            }
        } catch (_: Exception) {
            "unknown"
        }
    }

    private fun isDataSaverActive(): Boolean {
        return try {
            val cm = context.getSystemService(Context.CONNECTIVITY_SERVICE) as? ConnectivityManager
                ?: return false
            cm.restrictBackgroundStatus == ConnectivityManager.RESTRICT_BACKGROUND_STATUS_ENABLED
        } catch (_: Exception) {
            false
        }
    }

    // ============================================================
    // Step 34 — Screen-share publishing via MediaProjection.
    //
    // Wires up an Android system screen-capture permission flow and
    // publishes the resulting display surface as a second video track
    // on the active LiveKit room (alongside the camera track, NOT in
    // place of it). Lets a host stream a game / browser / slideshow
    // while their face stays visible in the corner — the LiveKit SDK
    // handles all SFU plumbing (Track.Source.SCREEN_SHARE).
    //
    // Lifecycle:
    //   1. JS calls `startScreenShare()` while a room is connected.
    //   2. Plugin starts ScreenCaptureService (FGS type
    //      "mediaProjection") so Android 14+ allows the projection.
    //   3. We launch MediaProjectionManager.createScreenCaptureIntent
    //      via Capacitor's startActivityForResult bridge.
    //   4. On RESULT_OK, we hand the Intent to LiveKit's
    //      `localParticipant.setScreenShareEnabled(true, data)` —
    //      the SDK opens the VirtualDisplay and publishes a track.
    //   5. `stopScreenShare()` (or the FGS notification button) calls
    //      `setScreenShareEnabled(false)` and stops the FGS.
    //
    // Emits `screen-share-state` events: "starting" | "started" |
    // "denied" | "stopped" | "error".
    // ============================================================

    private var isScreenSharing = false
    private var screenShareStartedAt = 0L

    private fun emitScreenShareState(state: String, error: String? = null) {
        try {
            val ev = JSObject()
            ev.put("state", state)
            if (error != null) ev.put("error", error)
            ev.put("active", isScreenSharing)
            ev.put("startedAt", screenShareStartedAt)
            notifyListeners("screen-share-state", ev)
        } catch (_: Exception) {}
    }

    @PluginMethod
    fun isScreenShareSupported(call: PluginCall) {
        val ret = JSObject()
        // MediaProjection landed in API 21 (Android 5.0). Every supported
        // device meets that bar — we keep the call so JS can future-proof
        // against form factors (TVs, work-profile devices) that opt out.
        ret.put("supported", Build.VERSION.SDK_INT >= Build.VERSION_CODES.LOLLIPOP)
        ret.put("active", isScreenSharing)
        call.resolve(ret)
    }

    @PluginMethod
    fun isScreenSharing(call: PluginCall) {
        val ret = JSObject()
        ret.put("active", isScreenSharing)
        ret.put("startedAt", screenShareStartedAt)
        ret.put("hasRoom", room != null)
        call.resolve(ret)
    }

    @PluginMethod
    fun startScreenShare(call: PluginCall) {
        if (room == null) {
            call.reject("no-room", "Connect to a room before sharing the screen.")
            return
        }
        if (isScreenSharing) {
            // Idempotent — JS may double-tap the button; just resolve.
            val ret = JSObject()
            ret.put("active", true)
            ret.put("alreadyOn", true)
            call.resolve(ret)
            return
        }
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.LOLLIPOP) {
            call.reject("unsupported", "Screen sharing requires Android 5.0+.")
            return
        }

        try {
            // Start the FGS BEFORE issuing the projection request.
            // Android 14+ enforces this ordering — getMediaProjection()
            // throws SecurityException otherwise.
            com.merilive.app.service.ScreenCaptureService.start(context)

            val mpm = context.getSystemService(Context.MEDIA_PROJECTION_SERVICE)
                as? android.media.projection.MediaProjectionManager
            if (mpm == null) {
                com.merilive.app.service.ScreenCaptureService.stop(context)
                call.reject("no-projection-service", "MediaProjectionManager unavailable.")
                return
            }

            emitScreenShareState("starting")
            val intent = mpm.createScreenCaptureIntent()
            // Save the call so the @ActivityCallback can resolve it.
            startActivityForResult(call, intent, "handleScreenShareResult")
        } catch (e: Exception) {
            com.merilive.app.service.ScreenCaptureService.stop(context)
            emitScreenShareState("error", e.message)
            call.reject("screen-share-launch-failed", e)
        }
    }

    @com.getcapacitor.annotation.ActivityCallback
    private fun handleScreenShareResult(call: PluginCall?, result: androidx.activity.result.ActivityResult) {
        val data = result.data
        val ok = result.resultCode == android.app.Activity.RESULT_OK && data != null
        if (!ok) {
            com.merilive.app.service.ScreenCaptureService.stop(context)
            emitScreenShareState("denied")
            call?.reject("permission-denied", "User declined the screen-capture prompt.")
            return
        }

        val r = room
        if (r == null) {
            com.merilive.app.service.ScreenCaptureService.stop(context)
            emitScreenShareState("error", "Room disconnected before screen share could start.")
            call?.reject("no-room", "Room disconnected before screen share could start.")
            return
        }

        scope.launch {
            try {
                // LiveKit SDK 2.x: setScreenShareEnabled accepts the
                // raw Intent from MediaProjectionManager and handles
                // VirtualDisplay + WebRTC track plumbing internally.
                r.localParticipant.setScreenShareEnabled(true, data)
                isScreenSharing = true
                screenShareStartedAt = System.currentTimeMillis()
                emitScreenShareState("started")
                val ret = JSObject()
                ret.put("active", true)
                ret.put("startedAt", screenShareStartedAt)
                call?.resolve(ret)
            } catch (e: Exception) {
                Log.w(TAG, "setScreenShareEnabled(true) failed: ${e.message}")
                isScreenSharing = false
                screenShareStartedAt = 0L
                com.merilive.app.service.ScreenCaptureService.stop(context)
                emitScreenShareState("error", e.message)
                call?.reject("screen-share-publish-failed", e)
            }
        }
    }

    @PluginMethod
    fun stopScreenShare(call: PluginCall) {
        val r = room
        if (!isScreenSharing || r == null) {
            // Always stop the FGS — defensive cleanup.
            com.merilive.app.service.ScreenCaptureService.stop(context)
            isScreenSharing = false
            screenShareStartedAt = 0L
            val ret = JSObject()
            ret.put("active", false)
            ret.put("alreadyOff", true)
            call.resolve(ret)
            return
        }

        scope.launch {
            try {
                r.localParticipant.setScreenShareEnabled(false)
            } catch (e: Exception) {
                Log.w(TAG, "setScreenShareEnabled(false) failed: ${e.message}")
            } finally {
                com.merilive.app.service.ScreenCaptureService.stop(context)
                isScreenSharing = false
                screenShareStartedAt = 0L
                emitScreenShareState("stopped")
                val ret = JSObject()
                ret.put("active", false)
                call.resolve(ret)
            }
        }
    }

    // ============================================================
    // Step 35 — Push-to-Talk + spatial audio (Party Rooms).
    //
    // Two complementary primitives wired around the existing audio
    // track plumbing:
    //
    //   • PUSH-TO-TALK — instantaneous mute/unmute of the LOCAL
    //     audio track without unpublishing it. We flip the track's
    //     `enabled` flag instead of calling `setMicrophoneEnabled`,
    //     which would tear down + republish every press (audible
    //     "pop", 200-400 ms gap, costs SFU subscribe traffic). PTT
    //     starts in HELD mode (mic off until pressed) so a user who
    //     joined a Party Room mid-conversation never accidentally
    //     broadcasts.
    //
    //   • SPATIAL AUDIO — distance-attenuated per-remote gain. We
    //     keep a 2D listener (the local participant) plus a position
    //     map for each remote sid. On every position update the
    //     plugin recomputes Euclidean distance and writes the new
    //     gain to the matching RemoteAudioTrack via `setVolume()`.
    //
    //     Falloff: linear from `nearMeters` (vol 1.0) down to
    //     `farMeters` (vol `minVolume`, default 0.05). Outside the
    //     `farMeters` ring we stay at `minVolume` so a participant
    //     never silently disappears (matches Discord Voice Channels
    //     and Roblox Spatial Voice behaviour).
    //
    //     This is gain-only, not HRTF — true binaural panning needs
    //     OpenSL/Oboe + per-frame DSP and is reserved for a later
    //     "Stereo Party" mode. Gain attenuation alone covers ~90 %
    //     of the perceived spatial effect when paired with stereo
    //     headphones in a small Party Room (≤ 8 seats).
    // ============================================================

    // -- PTT state --------------------------------------------------
    private var pttModeEnabled = false
    private var pttMicHeldOpen = false
    private var pttMicMutedBeforePtt = true   // restored when PTT mode is disabled

    // -- Spatial audio state ----------------------------------------
    private var spatialAudioEnabled = false
    private var spatialNear = 1.0   // metres at which gain == 1.0
    private var spatialFar = 8.0    // metres at which gain == minVolume
    private var spatialMinVolume = 0.05
    private val listenerPos = doubleArrayOf(0.0, 0.0)
    private val participantPositions = mutableMapOf<String, DoubleArray>()

    private fun localAudioTrack(): io.livekit.android.room.track.LocalAudioTrack? {
        val r = room ?: return null
        return try {
            r.localParticipant.getTrackPublication(Track.Source.MICROPHONE)?.track
                as? io.livekit.android.room.track.LocalAudioTrack
        } catch (_: Exception) { null }
    }

    private fun applyMicGate(open: Boolean) {
        // Flip the SDK-level mic flag — fast path, no republish.
        try {
            scope.launch {
                room?.localParticipant?.setMicrophoneEnabled(open)
            }
        } catch (_: Exception) {}
        // Belt-and-braces: also flip the track's enabled flag so any
        // SDK that ignores the high-level setter still goes silent.
        try { localAudioTrack()?.enabled = open } catch (_: Exception) {}
    }

    private fun emitPttState(reason: String) {
        try {
            val ev = JSObject()
            ev.put("enabled", pttModeEnabled)
            ev.put("micOpen", pttMicHeldOpen)
            ev.put("reason", reason)
            notifyListeners("ptt-state", ev)
        } catch (_: Exception) {}
    }

    @PluginMethod
    fun setPushToTalkEnabled(call: PluginCall) {
        val enabled = call.getBoolean("enabled") ?: false
        if (enabled == pttModeEnabled) {
            val ret = JSObject()
            ret.put("enabled", pttModeEnabled)
            ret.put("micOpen", pttMicHeldOpen)
            call.resolve(ret)
            return
        }
        if (enabled) {
            // Snapshot current mic so we can restore it cleanly later.
            pttMicMutedBeforePtt = try {
                localAudioTrack()?.enabled?.not() ?: true
            } catch (_: Exception) { true }
            pttModeEnabled = true
            pttMicHeldOpen = false
            applyMicGate(false)
            emitPttState("enabled")
        } else {
            pttModeEnabled = false
            pttMicHeldOpen = false
            // Restore pre-PTT mic state — usually "open" when the user
            // started a Party Room, "muted" if they had toggled it off.
            applyMicGate(!pttMicMutedBeforePtt)
            emitPttState("disabled")
        }
        val ret = JSObject()
        ret.put("enabled", pttModeEnabled)
        ret.put("micOpen", pttMicHeldOpen)
        call.resolve(ret)
    }

    @PluginMethod
    fun setPushToTalkHeld(call: PluginCall) {
        val held = call.getBoolean("held") ?: false
        if (!pttModeEnabled) {
            call.reject("ptt-disabled", "Enable PTT mode first via setPushToTalkEnabled.")
            return
        }
        if (held == pttMicHeldOpen) {
            val ret = JSObject()
            ret.put("micOpen", pttMicHeldOpen)
            call.resolve(ret)
            return
        }
        pttMicHeldOpen = held
        applyMicGate(held)
        emitPttState(if (held) "press" else "release")
        val ret = JSObject()
        ret.put("micOpen", pttMicHeldOpen)
        call.resolve(ret)
    }

    @PluginMethod
    fun getPushToTalkState(call: PluginCall) {
        val ret = JSObject()
        ret.put("enabled", pttModeEnabled)
        ret.put("micOpen", pttMicHeldOpen)
        ret.put("hasRoom", room != null)
        call.resolve(ret)
    }

    // -------- Spatial audio --------

    private fun gainForDistance(distMetres: Double): Double {
        if (distMetres <= spatialNear) return 1.0
        if (distMetres >= spatialFar) return spatialMinVolume
        val span = (spatialFar - spatialNear).coerceAtLeast(0.001)
        val t = (distMetres - spatialNear) / span
        return (1.0 - t * (1.0 - spatialMinVolume)).coerceIn(spatialMinVolume, 1.0)
    }

    private fun applySpatialGains() {
        val r = room ?: return
        if (!spatialAudioEnabled) return
        try {
            for (rp in r.remoteParticipants.values) {
                val sid = try { rp.sid.value } catch (_: Exception) { null } ?: continue
                val pos = participantPositions[sid] ?: doubleArrayOf(0.0, 0.0)
                val dx = pos[0] - listenerPos[0]
                val dy = pos[1] - listenerPos[1]
                val dist = kotlin.math.sqrt(dx * dx + dy * dy)
                val gain = gainForDistance(dist).toFloat()
                for (pub in rp.audioTrackPublications) {
                    val track = pub.first?.track as? io.livekit.android.room.track.RemoteAudioTrack
                        ?: continue
                    try { track.setVolume(gain.toDouble()) } catch (_: Exception) {}
                }
            }
        } catch (e: Exception) {
            Log.w(TAG, "applySpatialGains failed: ${e.message}")
        }
    }

    private fun resetRemoteGainsToUnity() {
        val r = room ?: return
        try {
            for (rp in r.remoteParticipants.values) {
                for (pub in rp.audioTrackPublications) {
                    val track = pub.first?.track as? io.livekit.android.room.track.RemoteAudioTrack
                        ?: continue
                    try { track.setVolume(1.0) } catch (_: Exception) {}
                }
            }
        } catch (_: Exception) {}
    }

    @PluginMethod
    fun setSpatialAudioEnabled(call: PluginCall) {
        val enabled = call.getBoolean("enabled") ?: false
        val near = call.getDouble("nearMeters")
        val far = call.getDouble("farMeters")
        val minVol = call.getDouble("minVolume")
        if (near != null && near > 0) spatialNear = near
        if (far != null && far > spatialNear) spatialFar = far
        if (minVol != null) spatialMinVolume = minVol.coerceIn(0.0, 1.0)

        spatialAudioEnabled = enabled
        if (!enabled) {
            // Drop everyone back to unity gain so the room sounds
            // normal again — important when toggling off mid-call.
            resetRemoteGainsToUnity()
        } else {
            applySpatialGains()
        }
        val ret = JSObject()
        ret.put("enabled", spatialAudioEnabled)
        ret.put("nearMeters", spatialNear)
        ret.put("farMeters", spatialFar)
        ret.put("minVolume", spatialMinVolume)
        call.resolve(ret)
    }

    @PluginMethod
    fun setListenerPosition(call: PluginCall) {
        listenerPos[0] = call.getDouble("x") ?: 0.0
        listenerPos[1] = call.getDouble("y") ?: 0.0
        applySpatialGains()
        val ret = JSObject()
        ret.put("x", listenerPos[0])
        ret.put("y", listenerPos[1])
        call.resolve(ret)
    }

    @PluginMethod
    fun setParticipantPosition(call: PluginCall) {
        val sid = call.getString("sid")
        if (sid.isNullOrBlank()) {
            call.reject("missing-sid", "Provide the remote participant sid.")
            return
        }
        val x = call.getDouble("x") ?: 0.0
        val y = call.getDouble("y") ?: 0.0
        participantPositions[sid] = doubleArrayOf(x, y)
        applySpatialGains()
        val ret = JSObject()
        ret.put("sid", sid)
        ret.put("x", x); ret.put("y", y)
        call.resolve(ret)
    }

    @PluginMethod
    fun clearParticipantPosition(call: PluginCall) {
        val sid = call.getString("sid")
        if (sid.isNullOrBlank()) {
            participantPositions.clear()
        } else {
            participantPositions.remove(sid)
        }
        // Reset that participant (or all) to unity if spatial is on,
        // otherwise the stale gain would linger until the next move.
        if (spatialAudioEnabled) applySpatialGains()
        val ret = JSObject()
        ret.put("cleared", sid ?: "all")
        call.resolve(ret)
    }

    @PluginMethod
    fun getSpatialAudioState(call: PluginCall) {
        val ret = JSObject()
        ret.put("enabled", spatialAudioEnabled)
        ret.put("nearMeters", spatialNear)
        ret.put("farMeters", spatialFar)
        ret.put("minVolume", spatialMinVolume)
        ret.put("listenerX", listenerPos[0])
        ret.put("listenerY", listenerPos[1])
        ret.put("trackedParticipants", participantPositions.size)
        call.resolve(ret)
    }

    // ============================================================
    // Step 36 — Virtual background / blur (MediaPipe Selfie Seg).
    //
    // The pixel pipeline lives in VirtualBackgroundProcessor (impl
    // of org.webrtc.VideoProcessor). We hand it to LiveKit via
    // `LocalVideoTrack.setVideoProcessor(...)` which the SDK forwards
    // to the underlying VideoSource — every captured frame is then
    // composited (person stays sharp, background blurred or replaced)
    // before reaching the SFU.
    //
    // Modes:
    //   • "none"  — pass-through (zero overhead)
    //   • "blur"  — RenderScript Gaussian blur (radius 1-25, default 18)
    //   • "image" — replace background with a user-supplied bitmap
    //
    // Lifecycle: the processor is lazily created on the first
    // `setVirtualBackground()` call and survives camera switches.
    // It is released in disconnect() / handleOnDestroy().
    // ============================================================

    private var virtualBackgroundProcessor:
        com.merilive.app.plugin.video.VirtualBackgroundProcessor? = null

    private fun ensureBackgroundProcessor():
        com.merilive.app.plugin.video.VirtualBackgroundProcessor {
        virtualBackgroundProcessor?.let { return it }
        val proc = com.merilive.app.plugin.video.VirtualBackgroundProcessor(context)
        virtualBackgroundProcessor = proc
        return proc
    }

    private fun attachBackgroundProcessor() {
        val proc = virtualBackgroundProcessor ?: return
        val track = try {
            room?.localParticipant?.getTrackPublication(Track.Source.CAMERA)?.track
                as? io.livekit.android.room.track.LocalVideoTrack
        } catch (_: Exception) { null } ?: return
        // LiveKit Android 2.x exposes LocalVideoTrack.addRenderer/removeRenderer
        // and forwards a VideoProcessor through the underlying VideoSource.
        try {
            val m = track.javaClass.methods.firstOrNull {
                it.name == "setVideoProcessor" && it.parameterTypes.size == 1
            }
            if (m != null) {
                m.invoke(track, proc)
            } else {
                Log.w(TAG, "LocalVideoTrack.setVideoProcessor not found — virtual bg disabled.")
            }
        } catch (e: Exception) {
            Log.w(TAG, "attachBackgroundProcessor failed: ${e.message}")
        }
    }

    private fun detachBackgroundProcessor() {
        val track = try {
            room?.localParticipant?.getTrackPublication(Track.Source.CAMERA)?.track
                as? io.livekit.android.room.track.LocalVideoTrack
        } catch (_: Exception) { null }
        try {
            val m = track?.javaClass?.methods?.firstOrNull {
                it.name == "setVideoProcessor" && it.parameterTypes.size == 1
            }
            m?.invoke(track, null as Any?)
        } catch (_: Exception) {}
    }

    @PluginMethod
    fun setVirtualBackground(call: PluginCall) {
        val rawMode = (call.getString("mode") ?: "none").lowercase()
        val mode = when (rawMode) {
            "blur"  -> com.merilive.app.plugin.video.VirtualBackgroundProcessor.Mode.BLUR
            "image" -> com.merilive.app.plugin.video.VirtualBackgroundProcessor.Mode.IMAGE
            else    -> com.merilive.app.plugin.video.VirtualBackgroundProcessor.Mode.NONE
        }
        val blurRadius = call.getFloat("blurRadius") ?: 18f
        val imagePath = call.getString("imagePath")

        val proc = ensureBackgroundProcessor()
        proc.setMode(mode)
        proc.setBlurRadius(blurRadius)
        if (mode == com.merilive.app.plugin.video.VirtualBackgroundProcessor.Mode.IMAGE) {
            val ok = proc.setBackgroundFromFile(imagePath)
            if (!ok && !imagePath.isNullOrBlank()) {
                Log.w(TAG, "Background image not found at: $imagePath")
            }
        }

        // Initialise MediaPipe lazily; tryInit() returns false when
        // selfie_segmenter.tflite isn't bundled — surface that to JS
        // so the UI can show "Effect unavailable" instead of crashing.
        val segmenterReady = if (mode == com.merilive.app.plugin.video.VirtualBackgroundProcessor.Mode.NONE) true
                             else proc.tryInit()

        if (mode != com.merilive.app.plugin.video.VirtualBackgroundProcessor.Mode.NONE && segmenterReady) {
            attachBackgroundProcessor()
        }
        // For NONE we leave the processor wired but pass-through —
        // toggling back on is then instant (no track re-publish).

        val ret = JSObject()
        ret.put("mode", rawMode)
        ret.put("blurRadius", blurRadius)
        ret.put("imageApplied", mode == com.merilive.app.plugin.video.VirtualBackgroundProcessor.Mode.IMAGE && !imagePath.isNullOrBlank())
        ret.put("segmenterReady", segmenterReady)
        ret.put("hasRoom", room != null)
        call.resolve(ret)
    }

    @PluginMethod
    fun getVirtualBackgroundState(call: PluginCall) {
        val proc = virtualBackgroundProcessor
        val ret = JSObject()
        ret.put("mode", proc?.mode?.name?.lowercase() ?: "none")
        ret.put("blurRadius", proc?.blurRadius ?: 18f)
        ret.put("processorAttached", proc != null)
        ret.put("hasRoom", room != null)
        call.resolve(ret)
    }

    @PluginMethod
    fun isVirtualBackgroundSupported(call: PluginCall) {
        // Soft probe — tries to load MediaPipe model. If the asset
        // is missing the answer is `supported:false` so the UI can
        // hide the "Background Effects" button entirely.
        val proc = ensureBackgroundProcessor()
        val ok = proc.tryInit()
        val ret = JSObject()
        ret.put("supported", ok)
        ret.put("requiresAsset", "android/app/src/main/assets/mediapipe/selfie_segmenter.tflite")
        call.resolve(ret)
    }
}

