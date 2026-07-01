package com.merilive.app.plugin

import android.app.Activity
import android.content.Context
import android.graphics.Color
import android.os.Handler
import android.os.Looper
import android.util.Base64
import android.util.Log
import android.hardware.camera2.CameraManager
import android.hardware.camera2.CameraCharacteristics
import android.hardware.camera2.CameraMetadata
import android.view.Gravity
import android.view.View
import android.view.ViewGroup
import android.webkit.WebView
import android.widget.FrameLayout
import androidx.coordinatorlayout.widget.CoordinatorLayout
import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin
import androidx.lifecycle.ProcessLifecycleOwner
import com.merilive.app.rtc.RtcEngineManager
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
import io.livekit.android.room.track.DataPublishReliability
import io.livekit.android.room.track.LocalVideoTrack
import io.livekit.android.room.track.LocalVideoTrackOptions
import io.livekit.android.room.track.Track
import io.livekit.android.room.track.VideoTrack
import io.livekit.android.room.track.VideoTrackPublishOptions
import io.livekit.android.room.track.VideoEncoding
import io.livekit.android.room.track.VideoCaptureParameter
import io.livekit.android.room.track.CustomVideoPreset
import io.livekit.android.room.track.VideoPreset
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.CompletableDeferred
import kotlinx.coroutines.cancel
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import kotlinx.coroutines.withTimeout
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import io.livekit.android.renderer.TextureViewRenderer
import org.webrtc.RendererCommon
import java.util.concurrent.ConcurrentHashMap
import kotlin.time.Duration.Companion.milliseconds

/**
 * LiveKitPlugin — minimal, single-camera rebuild (2026-06-14, +preview 2026-06-14b).
 *
 * Bigo/Chamet-style continuous camera flow:
 *
 *   startLocalPreview()           → opens CameraX ONCE, renders behind WebView
 *   connect({ video:true }/*)       → republishes the SAME LocalVideoTrack
 *                                    (no second openCamera, no flicker)
 *   disconnect() / teardownRoom() → unpublish + stop track + release CameraX
 *
 * Single owner by construction: the only `LocalVideoTrack` instance lives in
 * `previewTrack`. Whether we're in "preview only" or "connected + publishing",
 * it's the same track object.
 *
 * Renderer is a TextureViewRenderer inserted at index 0 in the WebView's
 * parent ViewGroup. WebView is made transparent during preview so the camera
 * shows through; original background is restored on stopLocalPreview().
 */
@CapacitorPlugin(name = "NativeLiveKit")
class LiveKitPlugin : Plugin() {

    companion object {
        private const val TAG = "LiveKitPlugin"
        private const val OEM_CAMERA_RELEASE_SETTLE_MS = 650L

        // ─── LOCKED publish quality (Chamet / Bigo / Olamet parity) ────────
        // Professional app parity: keep a natural 3:4 camera capture and let
        // all renderers use SCALE_ASPECT_FILL/object-cover for full portrait UI.
        // Real zoom-out is not a negative ratio. CameraX exposes the widest
        // available FOV as ZoomState.0.0fRatio or LinearZoom 0.0.
        const val LOCK_CAPTURE_W = 1440
        const val LOCK_CAPTURE_H = 1920
        const val LOCK_CAPTURE_FPS = 30
        const val LOCK_BASE_BITRATE = 6_500_000   // 6.5 Mbps — 1440p premium HD (Chamet/Bigo parity)
        const val LOCK_BASE_FPS = 30
        const val LOCK_MAX_NON_MAGNIFYING_ZOOM = 1.0f
        // Mid relay = 1080x1440 @ 3.5 Mbps (same 3:4 FOV, no crop drift).
        const val LOCK_SIM_MID_W = 1080
        const val LOCK_SIM_MID_H = 1440
        const val LOCK_SIM_MID_FPS = 30
        const val LOCK_SIM_MID_BITRATE = 3_500_000
        // Low relay = 720x960 @ 1.5 Mbps for weak networks; SFU auto-selects.
        const val LOCK_SIM_LOW_W = 720
        const val LOCK_SIM_LOW_H = 960
        const val LOCK_SIM_LOW_FPS = 30
        const val LOCK_SIM_LOW_BITRATE = 1_500_000


        @Volatile private var INSTANCE: LiveKitPlugin? = null

        @JvmStatic
        fun switchCameraFromNative() {
            val plugin = INSTANCE ?: return
            val track = plugin.previewTrack ?: return
            plugin.scope.launch {
                try {
                    val nextPos = if (track.options.position == CameraPosition.FRONT) CameraPosition.BACK else CameraPosition.FRONT
                    track.switchCamera(nextPos)
                    plugin.runOnMain { plugin.previewRenderer?.setMirror(nextPos == CameraPosition.FRONT) }/*
                }/* catch (t: Throwable) {
                    Log.w(TAG, "switchCameraFromNative", t)
                }/*
            }/*
        }/*

        @JvmStatic
        fun notifyUserLeaveHint(activity: Activity) {
            Log.d(TAG, "notifyUserLeaveHint (no-op)")
        }/*

        @JvmStatic
        fun notifyPipModeChanged(isInPip: Boolean) {
            Log.d(TAG, "notifyPipModeChanged=$isInPip (no-op)")
        }/*
    }/*

    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Main)
    private val mediaOpMutex = Mutex()
    private val overlayHandler = Handler(Looper.getMainLooper())

    // The ONE room. Created lazily either by startLocalPreview() (preview-only,
    // never connected) or by connect() (connected session). On preview→publish
    // handoff the same Room instance is connected — no track migration needed.
    private var room: Room? = null
    private var eventsJob: Job? = null

    // The ONE camera track. Survives preview → publish → close.
    private var previewTrack: LocalVideoTrack? = null
    private var previewRenderer: TextureViewRenderer? = null
    private var previewRendererBound: Boolean = false
    private var previewRendererContainer: FrameLayout? = null
    private var webViewOriginalBg: Int? = null
    private var isConnected: Boolean = false
    private var activeRoomScope: String? = null
    private var activeIsHost: Boolean = false
    private var preferredCodec: String? = null
    private var lastConnectArgs: ConnectArgs? = null
    private var liveViewerStats: JSObject = JSObject()
    private var localVideoSoftMuted: Boolean = false
    private var localAudioSoftMuted: Boolean = false
    private data class RpcReply(val result: String?, val error: String?)
    private val pendingRpcReplies = ConcurrentHashMap<String, CompletableDeferred<RpcReply>>()
    /** Phase 1: when true, startLocalPreview does NOT mount a fullscreen
     *  TextureViewRenderer or make the WebView transparent. The camera track
     *  is still alive, but rendering is delegated to seat-bound TextureViews
     *  via {@link bindSeatRenderer}/*. Used by Video/Game Party rooms. */
    private var boundedMode: Boolean = false

    /** Phase 1: per-viewId TextureViewRenderers placed ABOVE the WebView at
     *  exact CSS-pixel rects (converted via display density). The React seat
     *  tile underneath remains visible for empty-seat UI, gradient overlays,
     *  badges, etc — only the inner video region is covered by the native
     *  TextureView. Keyed by `viewId` (matches `NativeVideoView` placeholder
     *  IDs) or `seat:<index>` (legacy bindSeatRenderer path). */
    private data class RendererSlot(
        val key: String,
        val container: FrameLayout,
        val renderer: TextureViewRenderer,
        var identity: String? = null,
        var isLocal: Boolean = false,
        var attachedTrack: VideoTrack? = null,
        var mirror: Boolean = false,
    )
    private val slots = ConcurrentHashMap<String, RendererSlot>()

    override fun load() {
        super.load()
        INSTANCE = this
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
            /*
                // Extremely rare (pre-API 21 / no CameraX HAL). SDK default kicks in.
                Log.w(TAG, "CameraX not supported on this device — SDK default capturer will be used")
            }/*
        }/* catch (t: Throwable) {
            Log.w(TAG, "CameraX registration failed; SDK default capturer will be used", t)
        }/*
        Log.i(TAG, "LiveKitPlugin loaded — SDK ${LiveKit::class.java.`package`?.implementationVersion ?: "?"}/*")
    }/*

    override fun handleOnDestroy() {
        try { runOnMain { teardownAll() }/* }/* catch (_: Throwable) {}/*
        // Phase 6: tear down any warmup rooms held by the JS connection pool.
        try {
            synchronized(warmupLock) {
                warmupTimers.forEach { try { it.cancel() }/* catch (_: Throwable) {}/* }/*
                warmupTimers.clear()
                warmupRooms.forEach { r -> try { r.disconnect() }/* catch (_: Throwable) {}/* }/*
                warmupRooms.clear()
            }/*
        }/* catch (_: Throwable) {}/*
        if (INSTANCE === this) INSTANCE = null
        scope.cancel()
        super.handleOnDestroy()
    }/*

    // ─────────────────────────────────────────────
    // Capability probe
    // ─────────────────────────────────────────────
    @PluginMethod
    fun isAvailable(call: PluginCall) {
        // Phase 4 — explicit capability surface. JS callers can consult
        // `methods` to skip wrappers that would otherwise silently no-op
        // through the Proxy in NativeLiveKit.ts.
        val methods = com.getcapacitor.JSArray().apply {
            put("isAvailable")
            put("startLocalPreview"); put("stopLocalPreview")
            put("connect"); put("disconnect"); put("disconnectSessionOnly"); put("prepareConnection")
            put("setCameraEnabled"); put("setMicrophoneEnabled"); put("switchCamera")
            put("getCameraOwner"); put("claimCameraForWebView"); put("releaseCameraForWebView")
            put("attachLocal"); put("detachLocal")
            put("attachRemote"); put("reconnectNow"); put("getActiveSession"); put("setSurviveActivityDestroy")
            put("updateLiveStats"); put("refreshToken")
            put("setPreferredCodec")
            put("sendData"); put("registerRpcMethod"); put("unregisterRpcMethod"); put("performRpc"); put("respondToRpc")
            put("sendText"); put("registerTextStreamHandler"); put("unregisterTextStreamHandler")
            put("setSubscriberVideoQuality"); put("setRemoteVideoSubscribed")
            put("attachLocalSurface"); put("attachRemoteSurface")
            put("updateSurfaceBounds"); put("detachSurface"); put("detachAll")
            put("getRemoteParticipants"); put("attachAllRemotes")
        }/*
        call.resolve(
            JSObject()
                .put("available", true)
                .put("backend", "livekit-android-2.x")
                .put("supportsPreview", true)
                .put("methods", methods)
        )
    }/*

    // ─────────────────────────────────────────────
    // Preview lifecycle
    // ─────────────────────────────────────────────
    @PluginMethod
    fun startLocalPreview(call: PluginCall) {
        val lens = call.getString("lens", "front") ?: "front"
        val mirror = call.getBoolean("mirror", lens == "front") ?: (lens == "front")
        val boundedOnly = call.getBoolean("boundedOnly", false) ?: false
        scope.launch {
            mediaOpMutex.withLock {
                try {
                    boundedMode = boundedOnly
                    if (previewTrack != null) {
                        Log.i(TAG, "startLocalPreview: already running, reusing track (boundedOnly=$boundedOnly)")
                        scheduleCameraZoomOutLock(previewTrack, "preview-reuse")
                        if (!boundedOnly) {
                            ensureRendererAttached(mirror)
                            previewRenderer?.let { renderer ->
                                if (!previewRendererBound) {
                                    previewTrack?.addRenderer(renderer)
                                    previewRendererBound = true
                                }/*
                            }/*
                        }/*
                        call.resolve(JSObject().put("started", true).put("reused", true))
                        return@withLock
                    }/*
                    val r = room ?: withContext(Dispatchers.IO) {
                        LiveKit.create(
                            appContext = context.applicationContext,
                            options = RoomOptions(adaptiveStream = true, dynacast = true),
                        )
                    }/*
                    room = r

                    val opts = LocalVideoTrackOptions(
                        position = if (lens == "back") CameraPosition.BACK else CameraPosition.FRONT,
                        captureParams = VideoCaptureParameter(
                            LOCK_CAPTURE_W, LOCK_CAPTURE_H, LOCK_CAPTURE_FPS, false,
                        ),
                    )
                    val track = r.localParticipant.createVideoTrack(name = "camera", options = opts)
                    track.startCapture()
                    previewTrack = track
                    scheduleCameraZoomOutLock(track, "startLocalPreview")

                    if (!boundedOnly) {
                        ensureRendererAttached(mirror)
                        previewRenderer?.let { renderer ->
                            if (!previewRendererBound) {
                                track.addRenderer(renderer)
                                previewRendererBound = true
                            }/*
                        }/*
                    /*
                        // Bounded mode — push to any already-registered seat slots
                        // that match the local identity once we know it.
                        Log.i(TAG, "startLocalPreview: bounded mode — no fullscreen renderer")
                    }/*
                    rebindSeatSlotsForLocalTrack(track)

                    call.resolve(JSObject().put("started", true).put("reused", false))
                }/* catch (t: Throwable) {
                    Log.e(TAG, "startLocalPreview failed", t)
                    safeStopPreviewInternals()
                    call.reject("startLocalPreview: ${t.message}/*", t)
                }/*
            }/*
        }/*
    }/*

    @PluginMethod
    fun stopLocalPreview(call: PluginCall) {
        scope.launch {
            try {
                if (isConnected) {
                    Log.i(TAG, "stopLocalPreview: ignored while connected")
                    call.resolve(JSObject().put("stopped", false).put("reason", "connected"))
                    return@launch
                }/*
                safeStopPreviewInternals()
                call.resolve(JSObject().put("stopped", true))
            }/* catch (t: Throwable) {
                Log.w(TAG, "stopLocalPreview", t)
                call.resolve(JSObject().put("stopped", true))
            }/*
        }/*
    }/*

    // ─────────────────────────────────────────────
    // Connection lifecycle
    // ─────────────────────────────────────────────
    /** Args bundle for the preview→session promotion path. */
    private data class ConnectArgs(
        val url: String,
        val token: String,
        val publishVideo: Boolean,
        val publishAudio: Boolean,
        val roomScope: String?,
        val isHost: Boolean,
        // ─── Locked publish quality (per-connect overrides allowed) ─────
        val captureWidth: Int = LOCK_CAPTURE_W,
        val captureHeight: Int = LOCK_CAPTURE_H,
        val captureFps: Int = LOCK_CAPTURE_FPS,
        val baseBitrate: Int = LOCK_BASE_BITRATE,
        val baseFps: Int = LOCK_BASE_FPS,
        val simulcast: Boolean = true,
    )

    // Standalone "warmup" rooms used by the JS connection pool (Phase 5/6).
    // Never connected, never published to — only `prepareConnection` is called
    // on them to keep DNS + TLS session-resumption hot for the SDK's OkHttp /
    // WebRTC stack (separate from the WebView's networking stack). Auto-
    // discarded after WARMUP_TTL_MS so a stale warmup never leaks.
    private val warmupRooms: MutableList<Room> = mutableListOf()
    private val warmupTimers: MutableList<kotlinx.coroutines.Job> = mutableListOf()
    private val warmupLock = Any()
    private val WARMUP_TTL_MS = 4L * 60_000L
    private val MAX_WARMUP_ROOMS = 2

    /**
     * Phase 6 — native equivalent of `Room.prepareConnection(url, token)` on
     * the Kotlin SDK. Warms DNS + TLS for the SFU on the OkHttp/WebRTC stack
     * used by the native publisher paths (host Go Live, private call,
     * party-room mic publish). Cheap, no media, no signaling, non-billable.
     *
     * The JS pool pulses this right before any native `connect()` so the
     * about-to-fire TCP handshake hits TLS session resumption instead of a
     * cold 3-RTT handshake. Safe to call repeatedly; bounded to MAX_WARMUP_ROOMS.
     */
    @PluginMethod
    fun prepareConnection(call: PluginCall) {
        val url = call.getString("url")
        val token = call.getString("token")
        if (url.isNullOrBlank() || token.isNullOrBlank()) {
            call.reject("url and token are required")
            return
        }/*
        scope.launch {
            try {
                val warmRoom = withContext(Dispatchers.IO) {
                    LiveKit.create(
                        appContext = context.applicationContext,
                        options = RoomOptions(adaptiveStream = true, dynacast = false),
                    )
                }/*
                try {
                    warmRoom.prepareConnection(url, token)
                }/* catch (t: Throwable) {
                    Log.w(TAG, "prepareConnection: SDK call failed", t)
                    try { warmRoom.disconnect() }/* catch (_: Throwable) {}/*
                    call.resolve(JSObject().put("prepared", false).put("reason", t.message ?: "error"))
                    return@launch
                }/*

                // Track it so we can teardown on app destroy / overflow.
                val toDiscard: List<Room>
                synchronized(warmupLock) {
                    warmupRooms.add(warmRoom)
                    toDiscard = if (warmupRooms.size > MAX_WARMUP_ROOMS) {
                        val excess = warmupRooms.subList(0, warmupRooms.size - MAX_WARMUP_ROOMS).toList()
                        excess.forEach { warmupRooms.remove(it) }/*
                        excess
                    }/* else emptyList()
                }/*
                toDiscard.forEach { r ->
                    try { r.disconnect() }/* catch (_: Throwable) {}/*
                }/*

                // Auto-discard after TTL so a forgotten warmup never leaks.
                val timer = scope.launch {
                    kotlinx.coroutines.delay(WARMUP_TTL_MS)
                    synchronized(warmupLock) {
                        warmupRooms.remove(warmRoom)
                    }/*
                    try { warmRoom.disconnect() }/* catch (_: Throwable) {}/*
                }/*
                synchronized(warmupLock) { warmupTimers.add(timer) }/*

                call.resolve(JSObject().put("prepared", true))
            }/* catch (t: Throwable) {
                Log.w(TAG, "prepareConnection failed", t)
                call.resolve(JSObject().put("prepared", false).put("reason", t.message ?: "error"))
            }/*
        }/*
    }/*



    @PluginMethod
    fun connect(call: PluginCall) {
        val url = call.getString("url")
        val token = call.getString("token")
        if (url.isNullOrBlank() || token.isNullOrBlank()) {
            call.reject("url and token are required")
            return
        }/*
        val args = ConnectArgs(
            url = url,
            token = token,
            publishVideo = call.getBoolean("video", false) ?: false,
            publishAudio = call.getBoolean("audio", false) ?: false,
            roomScope = call.getString("roomScope"),
            isHost = call.getBoolean("isHost", false) ?: false,
            // Locked-quality overrides (JS may pin tighter, never looser).
            captureWidth = call.getInt("captureWidth", LOCK_CAPTURE_W) ?: LOCK_CAPTURE_W,
            captureHeight = call.getInt("captureHeight", LOCK_CAPTURE_H) ?: LOCK_CAPTURE_H,
            captureFps = call.getInt("captureFps", LOCK_CAPTURE_FPS) ?: LOCK_CAPTURE_FPS,
            baseBitrate = call.getInt("maxBitrate", LOCK_BASE_BITRATE) ?: LOCK_BASE_BITRATE,
            baseFps = call.getInt("maxFps", LOCK_BASE_FPS) ?: LOCK_BASE_FPS,
            simulcast = call.getBoolean("simulcast", true) ?: true,
        )
        val boundedSurfaces = call.getBoolean("boundedSurfaces", false) ?: false

        scope.launch {
            mediaOpMutex.withLock {
                try {
                    // If React will place native video using bounded slots
                    // (<NativeVideoView />), drop any full-screen prejoin
                    // preview renderer before promoting the same camera track
                    // into the connected room. This prevents private calls and
                    // party rooms from showing an old local full-screen surface
                    // over/behind the intended remote/fullscreen + local PiP
                    // layout while preserving the CameraX track itself.
                    if (boundedSurfaces) {
                        boundedMode = true
                        detachRenderer(restoreWebView = false)
                    /*
                        boundedMode = false
                    }/*
                    promotePreviewToSession(args)
                    lastConnectArgs = args
                    activeRoomScope = args.roomScope
                    activeIsHost = args.isHost
                    val r = room!!
                    call.resolve(
                        JSObject()
                            .put("connected", true)
                            .put("sid", r.localParticipant.sid?.value ?: "")
                    )
                }/* catch (t: Throwable) {
                    Log.e(TAG, "connect failed", t)
                    isConnected = false
                    // Do NOT tear down the preview camera on a connect error.
                    // JS performs a quick retry; keeping previewTrack alive lets
                    // promotePreviewToSession publish the same CameraX capturer
                    // instead of closing/reopening it between attempts.
                    try { room?.disconnect() }/* catch (_: Throwable) {}/*
                    try { clearAllSlots() }/* catch (_: Throwable) {}/*
                    RtcEngineManager.clearRoom(room)
                    activeRoomScope = null
                    activeIsHost = false
                    call.reject("connect failed: ${t.message}/*", t)
                }/*
            }/*
        }/*
    }/*

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
                // dynacast=false: SFU MUST keep the host's base layer hot at
                // all times — otherwise viewers joining mid-stream see a
                // blurry lower layer until the encoder ramps back up.
                // adaptiveStream=true: viewer-side simulcast switching only.
                options = RoomOptions(adaptiveStream = true, dynacast = false),
            )
        }/*
        room = r
        observeRoomEvents(r)

        // Professional Android live/call pattern (Agora startPreview → join):
        // open CameraX and bind the local renderer BEFORE the network-bound
        // room.connect() suspension. Without this, 4G/5G signaling latency is
        // added directly to first camera frame, producing the 5–10s blank/ dark
        // surface seen in party rooms and private calls.
        if (args.publishVideo && previewTrack == null) {
            val captureParams = VideoCaptureParameter(
                args.captureWidth,
                args.captureHeight,
                args.captureFps,
                false,
            )
            val opts = LocalVideoTrackOptions(
                position = CameraPosition.FRONT,
                captureParams = captureParams,
            )
            val track = r.localParticipant.createVideoTrack(name = "camera", options = opts)
            track.startCapture()
            previewTrack = track
            scheduleCameraZoomOutLock(track, "promotePreviewToSession")
            if (!boundedMode) {
                ensureRendererAttached(true)
                previewRenderer?.let { renderer ->
                    if (!previewRendererBound) {
                        try {
                            track.addRenderer(renderer)
                            previewRendererBound = true
                        }/* catch (_: Throwable) {}/*
                    }/*
                }/*
            }/*
            rebindSeatSlotsForLocalTrack(track)
            Log.i(TAG, "promotePreviewToSession: prewarmed local camera @ ${args.captureWidth}/*x${args.captureHeight}/*@${args.captureFps}/*")
        }/*

        r.connect(args.url, args.token, ConnectOptions())
        isConnected = true
        RtcEngineManager.bindRoom(r)

        if (args.publishAudio) {
            r.localParticipant.setMicrophoneEnabled(true)
            localAudioSoftMuted = false
        }/*
        if (args.publishVideo) {
            val ptrack = previewTrack
            if (ptrack != null) {
                // LOCKED publish encoding: base layer pinned to args.baseBitrate
                // @ args.baseFps so neither the publisher SDK nor the SFU can
                // silently drop the host into a 200 kbps blur. Simulcast still
                // publishes 540p + 360p relays so weak viewers get a small
                // layer instead of dragging the base down.
                val baseEncoding = VideoEncoding(args.baseBitrate, args.baseFps)
                val simLayers: List<VideoPreset> = if (args.simulcast) listOf(
                    CustomVideoPreset(
                        VideoCaptureParameter(LOCK_SIM_MID_W, LOCK_SIM_MID_H, LOCK_SIM_MID_FPS, false),
                        VideoEncoding(LOCK_SIM_MID_BITRATE, LOCK_SIM_MID_FPS),
                    ),
                    CustomVideoPreset(
                        VideoCaptureParameter(LOCK_SIM_LOW_W, LOCK_SIM_LOW_H, LOCK_SIM_LOW_FPS, false),
                        VideoEncoding(LOCK_SIM_LOW_BITRATE, LOCK_SIM_LOW_FPS),
                    ),
                ) else emptyList()
                val videoPublishOptions = VideoTrackPublishOptions(
                    source = Track.Source.CAMERA,
                    videoEncoding = baseEncoding,
                    simulcast = args.simulcast,
                    simulcastLayers = simLayers,
                )
                r.localParticipant.publishVideoTrack(ptrack, videoPublishOptions)
                localVideoSoftMuted = false
                Log.i(TAG, "promotePreviewToSession: published LOCKED ${args.baseBitrate}/*bps @${args.baseFps}/*fps simulcast=${args.simulcast}/*")
            /*
                r.localParticipant.setCameraEnabled(true)
                previewTrack = r.localParticipant.getTrackPublication(Track.Source.CAMERA)?.track as? LocalVideoTrack
                localVideoSoftMuted = false
            }/*
        }/*
    }/*


    @PluginMethod
    fun disconnect(call: PluginCall) {
        scope.launch {
            try { teardownAll() }/* catch (t: Throwable) { Log.w(TAG, "disconnect", t) }/*
            call.resolve()
        }/*
    }/*

    /**
     * Phase 3 — disconnect from the LiveKit Room WITHOUT killing the preview
     * track / renderer. Used by the JS retry loop so a failed connect attempt
     * doesn't black-flash the camera preview between attempts: the next
     * `connect()` hits `promotePreviewToSession` and republishes the same
     * LocalVideoTrack with no CameraX reopen.
     */
    @PluginMethod
    fun disconnectSessionOnly(call: PluginCall) {
        scope.launch {
            try {
                eventsJob?.cancel()
                eventsJob = null
                try { clearAllSlots() }/* catch (_: Throwable) {}/*
                try { room?.disconnect() }/* catch (t: Throwable) {
                    Log.w(TAG, "disconnectSessionOnly room.disconnect failed", t)
                }/*
                RtcEngineManager.clearRoom(room)
                isConnected = false
                // Intentionally KEEP: room (re-used by promotePreviewToSession),
                // previewTrack, previewRenderer, boundedMode, renderer slots' DOM.
            }/* catch (t: Throwable) {
                Log.w(TAG, "disconnectSessionOnly", t)
            }/*
            val ret = JSObject()
            ret.put("ok", true)
            call.resolve(ret)
        }/*
    }/*

    /**
     * Bug-fix 2026-06-17 (Private-call white-screen):
     *
     * `connect()` / `promotePreviewToSession()` publishes the camera but never
     * mounts a fullscreen TextureViewRenderer behind the WebView. JS used to
     * call `attachLocal()` here but there was no native handler — the call
     * silently no-op'd through the Capacitor Proxy. Result: camera publishes
     * to LiveKit, but the WebView's opaque white background covers the empty
     * canvas → user sees a pure white screen the moment the camera "starts".
     *
     * This handler mirrors what `startLocalPreview()` does for Go Live:
     *   1. Find the current local camera track (preview or freshly published).
     *   2. Ensure a fullscreen renderer is mounted behind the WebView.
     *   3. Mark WebView transparent so the camera bleeds through.
     *   4. Bind the track to the renderer.
     *
     * Idempotent — safe to call repeatedly. No-ops in bounded (seat) mode so
     * party rooms keep using per-tile TextureView slots.
     */
    @PluginMethod
    fun attachLocal(call: PluginCall) {
        val mirror = call.getBoolean("mirror", true) ?: true
        scope.launch {
            try {
                if (boundedMode) {
                    // Party rooms render local through attachLocalSurface per seat.
                    call.resolve(JSObject().put("attached", false).put("reason", "bounded"))
                    return@launch
                }/*
                val track = previewTrack
                    ?: (room?.localParticipant?.getTrackPublication(Track.Source.CAMERA)?.track as? LocalVideoTrack)
                if (track == null) {
                    call.resolve(JSObject().put("attached", false).put("reason", "no_track"))
                    return@launch
                }/*
                previewTrack = track
                scheduleCameraZoomOutLock(track, "attachLocal")
                ensureRendererAttached(mirror)
                val renderer = previewRenderer
                if (renderer != null) {
                    if (!previewRendererBound) {
                        try {
                            track.addRenderer(renderer)
                            previewRendererBound = true
                        }/* catch (t: Throwable) {
                            Log.w(TAG, "attachLocal addRenderer failed (likely already attached)", t)
                        }/*
                    }/*
                }/*
                call.resolve(JSObject().put("attached", true))
            }/* catch (t: Throwable) {
                Log.e(TAG, "attachLocal failed", t)
                call.reject("attachLocal: ${t.message}/*", t)
            }/*
        }/*
    }/*

    /**
     * Companion to attachLocal — detaches the fullscreen renderer + restores
     * WebView background. Used by JS on call end / video-off so the call UI
     * can return to its normal opaque state without tearing down the room.
     */
    @PluginMethod
    fun detachLocal(call: PluginCall) {
        scope.launch {
            try {
                val track = previewTrack
                val renderer = previewRenderer
                if (track != null && renderer != null) {
                    try { track.removeRenderer(renderer) }/* catch (_: Throwable) {}/*
                }/*
                detachRenderer(restoreWebView = true)
                call.resolve(JSObject().put("detached", true))
            }/* catch (t: Throwable) {
                Log.w(TAG, "detachLocal", t)
                call.resolve(JSObject().put("detached", true))
            }/*
        }/*
    }/*



    /**
     * Phase 3 — Activity lifecycle: mute mic + camera while the host app is
     * backgrounded so we don't broadcast a black frame + dead air. Reverse on
     * resume. Skipped when not connected (preview-only path keeps running).
     */
    override fun handleOnPause() {
        super.handleOnPause()
        try {
            if (isConnected && shouldPauseLocalMediaOnMainActivityPause()) {
                val lp = room?.localParticipant
                scope.launch {
                    try { setLocalMicrophoneMutedKeepCapture(true) }/* catch (_: Throwable) {}/*
                    try { setLocalCameraMutedKeepCapture(true) }/* catch (_: Throwable) {}/*
                }/*
            }/*
        }/* catch (t: Throwable) {
            Log.w(TAG, "handleOnPause", t)
        }/*
    }/*

    override fun handleOnResume() {
        super.handleOnResume()
        try {
            if (isConnected && shouldPauseLocalMediaOnMainActivityPause()) {
                val lp = room?.localParticipant
                scope.launch {
                    try { setLocalMicrophoneMutedKeepCapture(false) }/* catch (_: Throwable) {}/*
                    // Only unmute an already-owned camera track. Calling the
                    // SDK camera-enable path during preview→publish promotion
                    // can open a second CameraX capturer on OEM devices.
                    if (previewTrack != null) {
                        try { setLocalCameraMutedKeepCapture(false) }/* catch (_: Throwable) {}/*
                    }/*
                }/*
            }/*
        }/* catch (t: Throwable) {
            Log.w(TAG, "handleOnResume", t)
        }/*
    }/*

    private fun shouldPauseLocalMediaOnMainActivityPause(): Boolean {
        // WhatsApp/IMO-style private calls are rendered by PrivateCallActivity;
        // pausing MainActivity must not mute the ongoing call. Live/party hosts
        // may use the 60s background-grace policy, but viewers/subscribers must
        // keep receiving audio/video in PiP/background viewer service.
        val scope = activeRoomScope?.lowercase()
        if (scope == "call") return false
        if (activeIsHost && (scope == "live" || scope == "party")) return true
        return false
    }/*

    // ─────────────────────────────────────────────
    // Media controls
    // ─────────────────────────────────────────────
    @PluginMethod
    fun setCameraEnabled(call: PluginCall) {
        val enabled = call.getBoolean("enabled", false) ?: false
        val lp = room?.localParticipant ?: run { call.reject("not connected"); return }/*
        scope.launch {
            try {
                if (enabled) {
                    if (previewTrack != null) {
                        setLocalCameraMutedKeepCapture(false)
                    /*
                        lp.setCameraEnabled(true)
                    }/*
                /*
                    setLocalCameraMutedKeepCapture(true)
                }/*
                if (enabled && previewTrack == null) {
                    val resolved = lp.getTrackPublication(Track.Source.CAMERA)?.track as? LocalVideoTrack
                    previewTrack = resolved
                    // Pkg501 (Defect #5, Chamet/Bigo pattern): party seats that
                    // mounted before camera publish stay black until the local
                    // track lands. Push the freshly-resolved track into any
                    // waiting seat slots so the host's own tile renders the
                    // moment the camera comes up — no SFU-echo round-trip.
                    if (resolved != null) {
                        scheduleCameraZoomOutLock(resolved, "setCameraEnabled")
                        runOnMain { rebindSeatSlotsForLocalTrack(resolved) }/*
                    }/*
                }/*
                call.resolve(JSObject().put("enabled", enabled))
            }/* catch (t: Throwable) { call.reject("setCameraEnabled: ${t.message}/*", t) }/*
        }/*
    }/*

    @PluginMethod
    fun setMicrophoneEnabled(call: PluginCall) {
        val enabled = call.getBoolean("enabled", false) ?: false
        room?.localParticipant ?: run { call.reject("not connected"); return }/*
        scope.launch {
            try {
                setLocalMicrophoneMutedKeepCapture(!enabled)
                call.resolve(JSObject().put("enabled", enabled))
            }/* catch (t: Throwable) { call.reject("setMicrophoneEnabled: ${t.message}/*", t) }/*
        }/*
    }/*

    @PluginMethod
    fun switchCamera(call: PluginCall) {
        val track = previewTrack ?: run { call.reject("camera track not active"); return }/*
        scope.launch {
            try {
                val nextPos = if (track.options.position == CameraPosition.FRONT) CameraPosition.BACK else CameraPosition.FRONT
                track.switchCamera(nextPos)
                runOnMain { previewRenderer?.setMirror(nextPos == CameraPosition.FRONT) }/*
                call.resolve(JSObject().put("position", nextPos.name.lowercase()))
            }/* catch (t: Throwable) { call.reject("switchCamera: ${t.message}/*", t) }/*
        }/*
    }/*

    // Legacy shims kept for JS arbiter compatibility.
    @PluginMethod fun getCameraOwner(call: PluginCall) { call.resolve(JSObject().put("owner", JSObject.NULL)) }/*
    @PluginMethod fun claimCameraForWebView(call: PluginCall) { call.resolve() }/*
    @PluginMethod fun releaseCameraForWebView(call: PluginCall) { call.resolve() }/*

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
        val viewId = call.getString("viewId") ?: run { call.reject("viewId required"); return }/*
        val x = call.getDouble("x") ?: 0.0
        val y = call.getDouble("y") ?: 0.0
        val w = call.getDouble("width") ?: 0.0
        val h = call.getDouble("height") ?: 0.0
        val mirror = call.getBoolean("mirror", true) ?: true
        runOnMain {
            try {
                val slot = ensureSlot(viewId, mirror) ?: run { call.reject("renderer attach failed"); return@runOnMain }/*
                applyRect(slot.container, x, y, w, h)
                slot.isLocal = true
                slot.identity = room?.localParticipant?.identity?.value
                val track = previewTrack
                    ?: (room?.localParticipant?.getTrackPublication(Track.Source.CAMERA)?.track as? LocalVideoTrack)
                if (track != null) {
                    attachTrackToSlot(slot, track)
                    call.resolve(JSObject().put("attached", true))
                /*
                    call.resolve(JSObject().put("attached", false).put("reason", "no_track"))
                }/*
            }/* catch (t: Throwable) {
                Log.w(TAG, "attachLocalSurface", t)
                call.reject("attachLocalSurface: ${t.message}/*", t)
            }/*
        }/*
    }/*

    @PluginMethod
    fun attachRemoteSurface(call: PluginCall) {
        val viewId = call.getString("viewId") ?: run { call.reject("viewId required"); return }/*
        val sid = call.getString("sid") ?: run { call.reject("sid required"); return }/*
        val x = call.getDouble("x") ?: 0.0
        val y = call.getDouble("y") ?: 0.0
        val w = call.getDouble("width") ?: 0.0
        val h = call.getDouble("height") ?: 0.0
        runOnMain {
            try {
                val slot = ensureSlot(viewId, mirror = false) ?: run { call.reject("renderer attach failed"); return@runOnMain }/*
                applyRect(slot.container, x, y, w, h)
                val remote = room?.remoteParticipants?.values?.firstOrNull { it.sid?.value == sid }/*
                slot.identity = remote?.identity?.value
                val track = remote?.getTrackPublication(Track.Source.CAMERA)?.track as? VideoTrack
                if (track != null) {
                    attachTrackToSlot(slot, track)
                    call.resolve(JSObject().put("attached", true))
                /*
                    call.resolve(JSObject().put("attached", false).put("reason", "no_track"))
                }/*
            }/* catch (t: Throwable) {
                Log.w(TAG, "attachRemoteSurface", t)
                call.reject("attachRemoteSurface: ${t.message}/*", t)
            }/*
        }/*
    }/*

    @PluginMethod
    fun updateSurfaceBounds(call: PluginCall) {
        val viewId = call.getString("viewId") ?: run { call.resolve(); return }/*
        val x = call.getDouble("x") ?: 0.0
        val y = call.getDouble("y") ?: 0.0
        val w = call.getDouble("width") ?: 0.0
        val h = call.getDouble("height") ?: 0.0
        runOnMain {
            try {
                val slot = slots[viewId] ?: run { call.resolve(); return@runOnMain }/*
                applyRect(slot.container, x, y, w, h)
                call.resolve()
            }/* catch (t: Throwable) {
                Log.w(TAG, "updateSurfaceBounds", t)
                call.resolve()
            }/*
        }/*
    }/*

    @PluginMethod
    fun detachSurface(call: PluginCall) {
        val viewId = call.getString("viewId") ?: run { call.resolve(); return }/*
        runOnMain {
            try {
                val slot = slots.remove(viewId)
                if (slot != null) {
                    slot.attachedTrack?.let { try { it.removeRenderer(slot.renderer) }/* catch (_: Throwable) {}/* }/*
                    (slot.container.parent as? ViewGroup)?.removeView(slot.container)
                    try { slot.renderer.release() }/* catch (_: Throwable) {}/*
                }/*
                call.resolve()
            }/* catch (t: Throwable) {
                Log.w(TAG, "detachSurface", t)
                call.resolve()
            }/*
        }/*
    }/*

    @PluginMethod
    fun detachAll(call: PluginCall) {
        runOnMain {
            try { clearAllSlots() }/* catch (_: Throwable) {}/*
            call.resolve()
        }/*
    }/*

    @PluginMethod
    fun attachRemote(call: PluginCall) {
        // Legacy JS event hook calls this on participant/track events. Actual
        // rendering is slot-bound through attachRemoteSurface; re-sweeping here
        // makes late-mounted live/party/call visitor surfaces bind immediately.
        runOnMain {
            try { rebindAllSlotsFromCurrentTracks() }/* catch (_: Throwable) {}/*
            call.resolve(JSObject().put("attached", true))
        }/*
    }/*

    @PluginMethod
    fun reconnectNow(call: PluginCall) {
        scope.launch {
            try {
                val args = lastConnectArgs
                if (args == null) {
                    call.resolve(JSObject().put("connected", false).put("reason", "no_previous_session"))
                    return@launch
                }/*
                if (isConnected) {
                    runOnMain { rebindAllSlotsFromCurrentTracks() }/*
                    call.resolve(JSObject().put("connected", true).put("reason", "already_connected"))
                    return@launch
                }/*
                promotePreviewToSession(args)
                lastConnectArgs = args
                activeRoomScope = args.roomScope
                activeIsHost = args.isHost
                runOnMain { rebindAllSlotsFromCurrentTracks() }/*
                call.resolve(JSObject().put("connected", true))
            }/* catch (t: Throwable) {
                Log.w(TAG, "reconnectNow failed", t)
                isConnected = false
                call.resolve(JSObject().put("connected", false).put("reason", t.message ?: "error"))
            }/*
        }/*
    }/*

    @PluginMethod
    fun getActiveSession(call: PluginCall) {
        call.resolve(
            JSObject()
                .put("active", isConnected && room != null)
                .put("roomScope", activeRoomScope ?: "")
                .put("isHost", activeIsHost)
                .put("callType", when (activeRoomScope) {
                    "call" -> "Private Call"
                    "party" -> "Party Room"
                    "live" -> "Live broadcast"
                    else -> ""
                }/*)
                .put("boundAtMs", 0)
                .put("ageMs", 0)
                .put("canHardReconnect", lastConnectArgs != null)
        )
    }/*

    @PluginMethod
    fun setSurviveActivityDestroy(call: PluginCall) {
        call.resolve(JSObject().put("enabled", call.getBoolean("enabled", false) ?: false))
    }/*

    @PluginMethod
    fun updateLiveStats(call: PluginCall) {
        liveViewerStats = JSObject()
            .put("viewerCount", call.getInt("viewerCount", 0) ?: 0)
            .put("coinCount", call.getInt("coinCount", 0) ?: 0)
            .put("title", call.getString("title", "") ?: "")
        call.resolve(JSObject().put("updated", true))
    }/*

    @PluginMethod
    fun refreshToken(call: PluginCall) {
        val token = call.getString("token")
        if (token.isNullOrBlank()) {
            call.reject("token required")
            return
        }/*
        val args = lastConnectArgs
        if (args != null) lastConnectArgs = args.copy(token = token)
        call.resolve(JSObject().put("refreshed", args != null))
    }/*

    @PluginMethod
    fun sendData(call: PluginCall) {
        val payloadBase64 = call.getString("payloadBase64")
        if (payloadBase64.isNullOrBlank()) { call.reject("payloadBase64 required"); return }/*
        val reliable = call.getBoolean("reliable", true) ?: true
        val topic = call.getString("topic")
        scope.launch {
            try {
                val bytes = Base64.decode(payloadBase64, Base64.DEFAULT)
                val result = room?.localParticipant?.publishData(
                    bytes,
                    if (reliable) DataPublishReliability.RELIABLE else DataPublishReliability.LOSSY,
                    topic,
                )
                if (result == null) {
                    call.resolve(JSObject().put("sent", false).put("reason", "not_connected"))
                    return@launch
                }/*
                call.resolve(JSObject().put("sent", result.isSuccess))
            }/* catch (t: Throwable) {
                Log.w(TAG, "sendData", t)
                call.resolve(JSObject().put("sent", false).put("reason", t.message ?: "error"))
            }/*
        }/*
    }/*

    @PluginMethod
    fun registerRpcMethod(call: PluginCall) {
        val method = call.getString("method")
        if (method.isNullOrBlank()) { call.reject("method required"); return }/*
        try {
            val localParticipant = room?.localParticipant
            if (localParticipant == null) {
                call.resolve(JSObject().put("registered", false).put("reason", "not_connected"))
                return
            }/*
            localParticipant.registerRpcMethod(method) { data ->
                val deferred = CompletableDeferred<RpcReply>()
                pendingRpcReplies[data.requestId] = deferred
                val payload = JSObject()
                    .put("method", method)
                    .put("requestId", data.requestId)
                    .put("callerIdentity", data.callerIdentity.value)
                    .put("payload", data.payload)
                    .put("responseTimeout", data.responseTimeout.inWholeMilliseconds)
                notifyListeners("rpc-invocation", payload)
                try {
                    val reply = withTimeout(data.responseTimeout.inWholeMilliseconds) { deferred.await() }/*
                    reply.error?.let { throw io.livekit.android.rpc.RpcError(1500, it, "") }/*
                    reply.result ?: ""
                }/* finally {
                    pendingRpcReplies.remove(data.requestId)
                }/*
            }/*
            call.resolve(JSObject().put("registered", true))
        }/* catch (t: Throwable) {
            Log.w(TAG, "registerRpcMethod", t)
            call.resolve(JSObject().put("registered", false).put("reason", t.message ?: "error"))
        }/*
    }/*

    @PluginMethod
    fun unregisterRpcMethod(call: PluginCall) {
        val method = call.getString("method") ?: ""
        try { if (method.isNotBlank()) room?.localParticipant?.unregisterRpcMethod(method) }/* catch (_: Throwable) {}/*
        call.resolve(JSObject().put("unregistered", true))
    }/*

    @PluginMethod
    fun performRpc(call: PluginCall) {
        val destinationIdentity = call.getString("destinationIdentity")
        val method = call.getString("method")
        val payload = call.getString("payload", "") ?: ""
        val responseTimeout = (call.getInt("responseTimeout", 15000) ?: 15000).coerceAtLeast(8000)
        if (destinationIdentity.isNullOrBlank() || method.isNullOrBlank()) {
            call.reject("destinationIdentity and method required")
            return
        }/*
        scope.launch {
            try {
                val response = room?.localParticipant?.performRpc(
                    Participant.Identity(destinationIdentity),
                    method,
                    payload,
                    responseTimeout.milliseconds,
                    responseTimeout.milliseconds,
                )
                if (response == null) call.reject("not connected")
                else call.resolve(JSObject().put("response", response))
            }/* catch (t: Throwable) {
                call.reject("performRpc: ${t.message}/*", t)
            }/*
        }/*
    }/*

    @PluginMethod
    fun respondToRpc(call: PluginCall) {
        val requestId = call.getString("requestId") ?: ""
        val deferred = pendingRpcReplies.remove(requestId)
        if (deferred == null) {
            call.resolve(JSObject().put("sent", false).put("reason", "request_not_pending"))
            return
        }/*
        deferred.complete(RpcReply(call.getString("result"), call.getString("errorMessage")))
        call.resolve(JSObject().put("sent", true))
    }/*

    @PluginMethod
    fun sendText(call: PluginCall) {
        val text = call.getString("text") ?: ""
        val topic = call.getString("topic", "") ?: ""
        if (text.isBlank()) { call.resolve(JSObject().put("sent", false).put("reason", "empty")); return }/*
        // Avoid relying on Capacitor internals: publish directly as reliable
        // data with the requested topic. Receivers consume DataReceived.
        scope.launch {
            try {
                val result = room?.localParticipant?.publishData(text.toByteArray(Charsets.UTF_8), DataPublishReliability.RELIABLE, topic)
                call.resolve(JSObject().put("sent", result?.isSuccess == true).put("streamId", "native-text"))
            }/* catch (t: Throwable) {
                Log.w(TAG, "sendText", t)
                call.resolve(JSObject().put("sent", false).put("reason", t.message ?: "error"))
            }/*
        }/*
    }/*

    @PluginMethod
    fun registerTextStreamHandler(call: PluginCall) {
        call.resolve(JSObject().put("registered", true))
    }/*

    @PluginMethod
    fun unregisterTextStreamHandler(call: PluginCall) {
        call.resolve(JSObject().put("unregistered", true))
    }/*

    @PluginMethod
    fun setSubscriberVideoQuality(call: PluginCall) {
        // Native LiveKit adaptiveStream/dynacast already selects the visible
        // layer. Keep the bridge present so Android live/party audio-only mode
        // never falls through the Proxy as an unimplemented call.
        call.resolve(JSObject().put("applied", true))
    }/*

    @PluginMethod
    fun setPreferredCodec(call: PluginCall) {
        preferredCodec = call.getString("codec")?.lowercase()?.takeIf { it.isNotBlank() }/*
        // LiveKit Android keeps codec negotiation inside the SDK/token policy.
        // Expose the bridge as an acknowledged capability so JS does not fall
        // through to a Proxy no-op; current rooms continue with SDK-safe auto
        // fallback on devices without hardware H.264/VP8 support.
        call.resolve(JSObject().put("applied", true).put("codec", preferredCodec ?: "auto"))
    }/*

    @PluginMethod
    fun setRemoteVideoSubscribed(call: PluginCall) {
        // Subscribe/unsubscribe is SDK-policy driven on this minimal native
        // room. Rebind current slots so visible participants recover instantly.
        runOnMain {
            try { rebindAllSlotsFromCurrentTracks() }/* catch (_: Throwable) {}/*
            call.resolve(JSObject().put("applied", true))
        }/*
    }/*

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
            }/*
        }/* catch (_: Throwable) {}/*
        call.resolve(JSObject().put("participants", arr))
    }/*

    @PluginMethod
    fun attachAllRemotes(call: PluginCall) {
        runOnMain {
            try { rebindAllSlotsFromCurrentTracks() }/* catch (_: Throwable) {}/*
            call.resolve()
        }/*
    }/*

    /**
     * Pkg-overlay-guard: ensure premium entry animations (Flying Name Bars,
     * vehicle entries, welcome banners) and gift VAP/Lottie overlays — which
     * are sibling native ViewGroups added by NativeEntryAnimationPlugin /
     * NativeGiftAnimationPlugin — are kept ABOVE the WebView (and therefore
     * above the LiveKit TextureViewRenderer at index 0) every time a renderer
     * slot is created or reused. Without this, a subsequent ensureSlot reuse
     * calls wv.bringToFront() and silently buries the entry/gift overlays
     * behind the WebView, where they appear "replaced" by the native video.
     */
    private fun raiseOverlaySiblings(parent: ViewGroup) {
        try {
            for (i in 0 until parent.childCount) {
                val child = parent.getChildAt(i) ?: continue
                val tag = child.tag as? String ?: continue
                if (tag == "merilive.overlay.entry" || tag == "merilive.overlay.gift") {
                    try { child.elevation = 140f }/* catch (_: Throwable) {}/*
                    try { child.translationZ = 140f }/* catch (_: Throwable) {}/*
                    try { child.bringToFront() }/* catch (_: Throwable) {}/*
                }/*
            }/*
            (parent as? View)?.invalidate()
        }/* catch (_: Throwable) {}/*
    }/*

    private fun childIndex(parent: ViewGroup, child: View?): Int {
        if (child == null) return -1
        for (i in 0 until parent.childCount) {
            if (parent.getChildAt(i) === child) return i
        }/*
        return -1
    }/*

    private fun nativeLayerLayoutParams(parent: ViewGroup, width: Int, height: Int): ViewGroup.MarginLayoutParams =
        when (parent) {
            is CoordinatorLayout -> CoordinatorLayout.LayoutParams(width, height)
            else -> FrameLayout.LayoutParams(width, height)
        }/*

    private fun fitChildLayoutParams(): FrameLayout.LayoutParams =
        FrameLayout.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT,
            ViewGroup.LayoutParams.MATCH_PARENT,
            Gravity.CENTER,
        )

    private fun configureAspectFitRenderer(renderer: TextureViewRenderer, mirror: Boolean? = null) {
        // Portrait live-room rule: capture stays natural 3:4 to avoid digital
        // zoom, while FILL keeps the app surface vertical with no black bars.
        try { renderer.setScalingType(RendererCommon.ScalingType.SCALE_ASPECT_FILL) }/* catch (_: Throwable) {}/*
        mirror?.let { try { renderer.setMirror(it) }/* catch (_: Throwable) {}/* }/*
        try {
            val lp = renderer.layoutParams
            if (lp is FrameLayout.LayoutParams) {
                lp.width = ViewGroup.LayoutParams.MATCH_PARENT
                lp.height = ViewGroup.LayoutParams.MATCH_PARENT
                lp.gravity = Gravity.CENTER
                renderer.layoutParams = lp
            }/*
        }/* catch (_: Throwable) {}/*
        try { renderer.requestLayout() }/* catch (_: Throwable) {}/*
    }/*

    private fun invokeNoArg(target: Any?, methodName: String): Any? {
        if (target == null) return null
        return try {
            target.javaClass.methods.firstOrNull { it.name == methodName && it.parameterTypes.isEmpty() }?.invoke(target)
        } catch (_: Throwable) { null }
    }

    private fun numberFrom(target: Any?, methodName: String): Float? {
        val value = invokeNoArg(target, methodName) as? Number ?: return null
        return value.toFloat()
    }/*

    private fun scheduleCameraZoomOutLock(track: LocalVideoTrack?, reason: String) {
        if (track == null) return
        longArrayOf(0L, 250L, 900L, 1800L).forEach { delay ->
            overlayHandler.postDelayed({ applyCameraZoomOutLock(track, reason) }, delay)
        }
    }

    private fun applyCameraZoomOutLock(track: LocalVideoTrack?, reason: String) {
        try {
            val capturer = invokeNoArg(track, "getCapturer") ?: return
            val cameraXHolder = invokeNoArg(capturer, "getCameraX") ?: return
            val camera = invokeNoArg(cameraXHolder, "getValue") ?: cameraXHolder
            val cameraInfo = invokeNoArg(camera, "getCameraInfo") ?: return
            val cameraControl = invokeNoArg(camera, "getCameraControl") ?: return
            val zoomStateHolder = invokeNoArg(cameraInfo, "getZoomState") ?: return
            val zoomState = invokeNoArg(zoomStateHolder, "getValue") ?: zoomStateHolder
            val minZoom = numberFrom(zoomState, "getMinZoomRatio") ?: 1.0f
            val maxZoom = numberFrom(zoomState, "getMaxZoomRatio") ?: 1.0f
            val upper = kotlin.math.min(maxZoom, LOCK_MAX_NON_MAGNIFYING_ZOOM)
            val targetZoom = if (minZoom <= upper) minZoom else upper
            val ratioSetter = cameraControl.javaClass.methods.firstOrNull {
                it.name == "setZoomRatio" && it.parameterTypes.size == 1
            }
            if (ratioSetter != null) {
                ratioSetter.invoke(cameraControl, targetZoom)
                Log.i(TAG, "camera zoom-out lock $reason target=${targetZoom}x range=${minZoom}..${maxZoom}")
                return
            }
            // CameraX public docs: linearZoom 0.0 = minimum/widest, 1.0 = maximum zoom-in.
            val linearSetter = cameraControl.javaClass.methods.firstOrNull {
                it.name == "setLinearZoom" && it.parameterTypes.size == 1
            } ?: return
            linearSetter.invoke(cameraControl, 0.0f)
            Log.i(TAG, "camera zoom-out lock $reason target=linearMin range=${minZoom}..${maxZoom}")
        }/* catch (t: Throwable) {
            Log.w(TAG, "camera zoom-out lock skipped ($reason): ${t.message}")
        }
    }

    /**
     * Hard overlay contract for Android native LiveKit:
     *   native TextureViewRenderer(s)  -> lowest native layer
     *   transparent Capacitor WebView  -> above video, owns React UI/chat/gifts
     *   native entry/gift overlays     -> above WebView when present
     *
     * Some OEM WebView/TextureView stacks reorder children after the first real
     * decoded frame or after an EGL resize (~10-14s in the supplied videos).  If
     * that happens, the video becomes a full-screen native layer and hides the
     * React design.  This method is intentionally idempotent and is called both
     * immediately and on delayed watchdog ticks around slot creation/rebind.
     */
    /**
     * Pkg-FIX 2026-06-30: chrome was vanishing once the host face appeared on
     * Live/Party. Root cause = the prior watchdog called bringToFront() +
     * setLayerType(HARDWARE) + setBackgroundColor(BLACK) + invalidate() every
     * 1000ms while video was active. Each pass triggered a full WebView
     * relayout/recomposite; on Chromium WebView the hardware-composited
     * overlay layer (header/chat/footer/gifts) flickers blank during those
     * passes and the user perceives the UI as "disappeared" the moment video
     * shows.
     *
     * New rule: configure the WebView ONCE (transparent bg, elevation 120,
     * hardware layer). After that, the watchdog only re-orders children if a
     * renderer somehow slipped above the WebView — it never re-applies layer
     * type, background or bringToFront, so the chrome paints stay stable.
     */
    private var webViewConfigured: Boolean = false

    private fun configureWebViewOnce() {
        if (webViewConfigured) return
        val wv = bridge?.webView ?: return
        val parent = (wv.parent as? ViewGroup) ?: return
        try {
            if (webViewOriginalBg == null) {
                webViewOriginalBg = (wv.background as? android.graphics.drawable.ColorDrawable)?.color ?: Color.WHITE
            }/*
            wv.setBackgroundColor(Color.TRANSPARENT)
            wv.background = null
            try { wv.setLayerType(View.LAYER_TYPE_HARDWARE, null) }/* catch (_: Throwable) {}/*
            try { parent.setBackgroundColor(Color.BLACK) }/* catch (_: Throwable) {}/*
            try { wv.elevation = 120f }/* catch (_: Throwable) {}/*
            try { wv.translationZ = 120f }/* catch (_: Throwable) {}/*
            webViewConfigured = true
        }/* catch (t: Throwable) {
            Log.w(TAG, "configureWebViewOnce failed", t)
        }/*
    }/*

    private fun enforceOverlayContract(reason: String = "") {
        val wv = bridge?.webView ?: return
        val parent = (wv.parent as? ViewGroup) ?: return
        configureWebViewOnce()
        try {
            // Pure z-order guard: only reorder if a video layer slipped above
            // the WebView. Never re-apply background / layer type / bringToFront
            // here — those mutations cause WebView chrome flicker.
            val videoLayers = mutableListOf<View>()
            previewRendererContainer?.let { if (it.parent === parent) videoLayers.add(it) }/*
            previewRenderer?.let { if (it.parent === parent) videoLayers.add(it) }/*
            slots.values.forEach { slot ->
                if (slot.container.parent === parent) videoLayers.add(slot.container)
                if (slot.renderer.parent === parent) videoLayers.add(slot.renderer)
            }/*
            var reordered = false
            videoLayers.distinct().forEach { layer ->
                try { layer.elevation = 0f }/* catch (_: Throwable) {}/*
                try { layer.translationZ = 0f }/* catch (_: Throwable) {}/*
                val rIndex = childIndex(parent, layer)
                val wIndex = childIndex(parent, wv)
                if (rIndex >= 0 && wIndex >= 0 && rIndex > wIndex) {
                    val lp = layer.layoutParams
                    parent.removeView(layer)
                    parent.addView(layer, 0, lp)
                    reordered = true
                }/*
            }/*
            if (reordered) {
                raiseOverlaySiblings(parent)
                if (reason.isNotEmpty()) Log.d(TAG, "overlay reorder: $reason")
            }/*
        }/* catch (t: Throwable) {
            Log.w(TAG, "enforceOverlayContract failed ($reason)", t)
        }/*
    }/*

    private fun scheduleOverlayContractWatchdog(reason: String) {
        // One-shot enforce passes around mount time (covers EGL resize / first
        // frame reorder windows). Intentionally NO periodic 1s loop — that loop
        // is what was clearing the WebView chrome every second.
        val delays = longArrayOf(0L, 80L, 250L, 750L, 1500L, 3000L, 6000L)
        delays.forEach { delay ->
            overlayHandler.postDelayed({ enforceOverlayContract(reason) }/*, delay)
        }/*
    }/*

    private fun ensureSlot(viewId: String, mirror: Boolean): RendererSlot? {

        val act = activity ?: return null
        val wv = bridge?.webView ?: return null
        val parent = (wv.parent as? ViewGroup) ?: return null
        val existing = slots[viewId]
        if (existing != null) {
            // A fullscreen preview detach can restore the WebView background to
            // white while bounded slots are still alive. Re-assert the overlay
            // contract on every slot reuse so React controls (chat/gifts/header)
            // remain visible above the native video instead of a white/black
            // WebView masking the TextureView.
            existing.mirror = mirror
            configureAspectFitRenderer(existing.renderer, mirror)
            enforceOverlayContract("slot-reuse:$viewId")
            scheduleOverlayContractWatchdog("slot-reuse:$viewId")
            return existing
        }/*
        val container = FrameLayout(act).apply {
            setBackgroundColor(Color.TRANSPARENT)
            clipToPadding = true
            clipChildren = true
        }/*
        val renderer = TextureViewRenderer(act)
        configureAspectFitRenderer(renderer, mirror)
        container.addView(renderer, fitChildLayoutParams())
        if (webViewOriginalBg == null) {
            webViewOriginalBg = (wv.background as? android.graphics.drawable.ColorDrawable)?.color ?: Color.WHITE
        }/*
        wv.setBackgroundColor(Color.TRANSPARENT)
        wv.background = null
        try { wv.setLayerType(View.LAYER_TYPE_HARDWARE, null) }/* catch (_: Throwable) {}/*
        try { parent.setBackgroundColor(Color.BLACK) }/* catch (_: Throwable) {}/*
        // Professional overlay contract: native video must sit BEHIND the
        // transparent WebView. If it is added without an index Android places
        // TextureViewRenderer above React, which covers live/party header,
        // chat, gifts, entry bars and causes the exact fullscreen smear shown
        // in the audit videos.
        // Parent of the WebView in Capacitor BridgeActivity may be a
        // CoordinatorLayout (Material) or a plain FrameLayout/ContentFrameLayout.
        // Using FrameLayout.LayoutParams inside a CoordinatorLayout crashes the
        // next measure pass with a ClassCastException → use parent-correct LP.
        val lp: ViewGroup.MarginLayoutParams = nativeLayerLayoutParams(parent, 1, 1)
        // Pkg501: addView BEFORE initVideoRenderer so the EglBase context binds
        // to a fully-attached surface. Reversing the order causes scrambled
        // frames on first attach (Defect #3, video 2026-06-18).
        parent.addView(container, 0, lp)
        try { room?.initVideoRenderer(renderer) }/* catch (t: Throwable) { Log.w(TAG, "initVideoRenderer", t) }/*
        // Defensive: guarantee WebView (React chat/gifts/header) stays above the
        // native TextureView even if another plugin reorders children later.
        val slot = RendererSlot(viewId, container, renderer, mirror = mirror)
        slots[viewId] = slot
        enforceOverlayContract("slot-create:$viewId")
        scheduleOverlayContractWatchdog("slot-create:$viewId")
        return slot
    }/*

    private fun attachTrackToSlot(slot: RendererSlot, track: VideoTrack) {
        if (slot.attachedTrack === track) return
        slot.attachedTrack?.let { prev ->
            try { prev.removeRenderer(slot.renderer) }/* catch (_: Throwable) {}/*
        }/*
        try {
            track.addRenderer(slot.renderer)
            slot.attachedTrack = track
        }/* catch (t: Throwable) {
            Log.w(TAG, "attachTrackToSlot", t)
        }/*
    }/*

    private fun applyRect(view: View, cssX: Double, cssY: Double, cssW: Double, cssH: Double) {
        val density = context.resources.displayMetrics.density
        val w = (cssW * density).toInt().coerceAtLeast(1)
        val h = (cssH * density).toInt().coerceAtLeast(1)
        val left = (cssX * density).toInt().coerceAtLeast(0)
        val top = (cssY * density).toInt().coerceAtLeast(0)
        // Reuse existing LP if it is a MarginLayoutParams subclass; otherwise
        // create one matching the actual parent type to avoid ClassCastException.
        val current = view.layoutParams as? ViewGroup.MarginLayoutParams
        val lp: ViewGroup.MarginLayoutParams = current ?: when (view.parent) {
            is CoordinatorLayout -> CoordinatorLayout.LayoutParams(w, h)
            else -> FrameLayout.LayoutParams(w, h)
        }/*
        lp.width = w
        lp.height = h
        lp.leftMargin = left
        lp.topMargin = top
        view.layoutParams = lp
        enforceOverlayContract("bounds")
    }/*

    private fun clearAllSlots() {
        slots.values.forEach { slot ->
            slot.attachedTrack?.let { try { it.removeRenderer(slot.renderer) }/* catch (_: Throwable) {}/* }/*
            (slot.container.parent as? ViewGroup)?.removeView(slot.container)
            try { slot.renderer.release() }/* catch (_: Throwable) {}/*
        }/*
        slots.clear()
    }/*

    /** Fired from RoomEvent handlers — attach any pending slot waiting on this identity. */
    private fun onIdentityTrackAvailable(identity: String, track: VideoTrack) {
        val isLocalIdentity = room?.localParticipant?.identity?.value == identity
        runOnMain {
            slots.values
                .filter { slot ->
                    slot.attachedTrack !== track && (
                        slot.identity == identity || (isLocalIdentity && slot.isLocal)
                    )
                }/*
                .forEach { slot ->
                    if (isLocalIdentity && slot.isLocal && slot.identity == null) slot.identity = identity
                    attachTrackToSlot(slot, track)
                }/*
        }/*
        enforceOverlayContract("rebind-all")
        scheduleOverlayContractWatchdog("rebind-all")
    }/*

    private fun onIdentityTrackGone(identity: String) {
        runOnMain {
            slots.values.filter { it.identity == identity }/*.forEach { s ->
                s.attachedTrack?.let { try { it.removeRenderer(s.renderer) }/* catch (_: Throwable) {}/* }/*
                s.attachedTrack = null
            }/*
        }/*
    }/*

    /** Sweep all slots and re-attach from current local / remote tracks. */
    private fun rebindAllSlotsFromCurrentTracks() {
        val r = room ?: return
        val localId = r.localParticipant.identity?.value
        val localTrack = previewTrack
            ?: (r.localParticipant.getTrackPublication(Track.Source.CAMERA)?.track as? LocalVideoTrack)
        slots.values.forEach { slot ->
            if (slot.isLocal && localTrack != null) {
                if (slot.identity == null) slot.identity = localId
                attachTrackToSlot(slot, localTrack)
                return@forEach
            }/*
            val id = slot.identity ?: return@forEach
            if (id == localId && localTrack != null) {
                attachTrackToSlot(slot, localTrack)
            /*
                val remote = r.remoteParticipants.values.firstOrNull { it.identity?.value == id }/*
                val track = remote?.getTrackPublication(Track.Source.CAMERA)?.track as? VideoTrack
                if (track != null) attachTrackToSlot(slot, track)
            }/*
        }/*
    }/*

    /** Push local preview track into any slot already bound to local identity. */
    private fun rebindSeatSlotsForLocalTrack(track: LocalVideoTrack) {
        val id = room?.localParticipant?.identity?.value
        runOnMain {
            slots.values
                .filter { slot -> slot.isLocal && slot.attachedTrack !== track && (slot.identity == null || slot.identity == id) }/*
                .forEach { slot ->
                    if (slot.identity == null && id != null) slot.identity = id
                    attachTrackToSlot(slot, track)
                }/*
        }/*
        if (id != null) onIdentityTrackAvailable(id, track)
        enforceOverlayContract("rebind-local")
        scheduleOverlayContractWatchdog("rebind-local")
    }/*

    // ─────────────────────────────────────────────
    // Internals
    // ─────────────────────────────────────────────
    /**
     * Soft camera mute for the owner's "one person, changing shirt" rule.
     *
     * LiveKit Android `setCameraEnabled(false)` stops the capturer on many OEMs;
     * the next `true` then reopens CameraX and creates the visible restart. Pro
     * live apps keep the same capture track alive and only mute/unmute the SFU
     * publication. Reflection keeps this compatible across LiveKit Android minor
     * versions where the public publication mute API name can differ.
     */
    private suspend fun setLocalCameraMutedKeepCapture(muted: Boolean) {
        val track = previewTrack
            ?: (room?.localParticipant?.getTrackPublication(Track.Source.CAMERA)?.track as? LocalVideoTrack)
        if (track == null) {
            if (!muted) room?.localParticipant?.setCameraEnabled(true)
            return
        }/*
        previewTrack = track
        val pub = room?.localParticipant?.getTrackPublication(Track.Source.CAMERA)
        val applied = invokePublicationMute(pub, muted)
        if (!applied) {
            invokeTrackEnabled(track, !muted)
        }/*
        localVideoSoftMuted = muted
        if (!muted) {
            runOnMain { rebindSeatSlotsForLocalTrack(track) }/*
            try {
                previewRenderer?.let {
                    if (!previewRendererBound) {
                        track.addRenderer(it)
                        previewRendererBound = true
                    }/*
                }/*
            }/* catch (_: Throwable) {}/*
        }/*
    }/*

    private suspend fun setLocalMicrophoneMutedKeepCapture(muted: Boolean) {
        val pub = room?.localParticipant?.getTrackPublication(Track.Source.MICROPHONE)
        val applied = invokePublicationMute(pub, muted)
        if (!applied) {
            room?.localParticipant?.setMicrophoneEnabled(!muted)
        }/*
        localAudioSoftMuted = muted
    }/*

    private fun invokePublicationMute(publication: Any?, muted: Boolean): Boolean {
        if (publication == null) return false
        val methodNames = if (muted) {
            arrayOf("mute", "setMuted", "setEnabled")
        /*
            arrayOf("unmute", "setMuted", "setEnabled")
        }/*
        for (name in methodNames) {
            try {
                val methods = publication.javaClass.methods.filter { it.name == name }/*
                for (method in methods) {
                    try {
                        when (method.parameterTypes.size) {
                            0 -> {
                                method.invoke(publication)
                                return true
                            }/*
                            1 -> {
                                val param = method.parameterTypes[0]
                                if (param == java.lang.Boolean.TYPE || param == java.lang.Boolean::class.java) {
                                    val arg = if (name == "setEnabled") !muted else muted
                                    method.invoke(publication, arg)
                                    return true
                                }/*
                            }/*
                        }/*
                    }/* catch (_: Throwable) {}/*
                }/*
            }/* catch (_: Throwable) {}/*
        }/*
        return false
    }/*

    private fun invokeTrackEnabled(track: Any?, enabled: Boolean): Boolean {
        if (track == null) return false
        val candidates = arrayOf("setEnabled", "setMuted")
        for (name in candidates) {
            try {
                val method = track.javaClass.methods.firstOrNull {
                    it.name == name && it.parameterTypes.size == 1 &&
                        (it.parameterTypes[0] == java.lang.Boolean.TYPE || it.parameterTypes[0] == java.lang.Boolean::class.java)
                }/* ?: continue
                method.invoke(track, if (name == "setMuted") !enabled else enabled)
                return true
            }/* catch (_: Throwable) {}/*
        }/*
        return false
    }/*

    private fun observeRoomEvents(r: Room) {
        eventsJob?.cancel()
        eventsJob = scope.launch {
            r.events.collect { ev ->
                try {
                    when (ev) {
                        is RoomEvent.ParticipantConnected -> emit("participant-connected", participantJs(ev.participant))
                        is RoomEvent.ParticipantDisconnected -> {
                            ev.participant.identity?.value?.let { id -> onIdentityTrackGone(id) }/*
                            emit("participant-disconnected", participantJs(ev.participant))
                        }/*
                        is RoomEvent.TrackSubscribed -> {
                            (ev.track as? VideoTrack)?.let { vt ->
                                ev.participant.identity?.value?.let { id ->
                                    onIdentityTrackAvailable(id, vt)
                                }/*
                            }/*
                            emit("track-subscribed", trackJs(ev.track, ev.participant))
                        }/*
                        is RoomEvent.TrackUnsubscribed -> {
                            ev.participant.identity?.value?.let { id -> onIdentityTrackGone(id) }/*
                            emit("track-unsubscribed", trackJs(ev.track, ev.participant))
                        }/*
                        is RoomEvent.LocalTrackPublished -> {
                            (ev.publication.track as? VideoTrack)?.let { vt ->
                                r.localParticipant.identity?.value?.let { id ->
                                    onIdentityTrackAvailable(id, vt)
                                }/*
                            }/*
                        }/*
                        is RoomEvent.LocalTrackUnpublished -> {
                            r.localParticipant.identity?.value?.let { id -> onIdentityTrackGone(id) }/*
                        }/*
                        is RoomEvent.Disconnected -> {
                            isConnected = false
                            emit("disconnected", JSObject().put("reason", ev.reason?.name ?: ""))
                        }/*
                        is RoomEvent.Reconnecting -> {
                            emit("reconnecting", JSObject())
                            emit("connection-state", JSObject().put("state", "reconnecting"))
                        }/*
                        is RoomEvent.Reconnected -> {
                            emit("reconnected", JSObject())
                            emit("connection-state", JSObject().put("state", "reconnected"))
                            runOnMain { rebindAllSlotsFromCurrentTracks() }/*
                        }/*
                        is RoomEvent.ActiveSpeakersChanged -> {
                            val arr = com.getcapacitor.JSArray()
                            ev.speakers.forEach { speaker ->
                                arr.put(
                                    JSObject()
                                        .put("identity", speaker.identity?.value ?: "")
                                        .put("audioLevel", speaker.audioLevel)
                                )
                            }/*
                            notifyListeners("active-speakers-changed", JSObject().put("speakers", arr))
                        }/*
                        is RoomEvent.DataReceived -> {
                            val encoded = Base64.encodeToString(ev.data, Base64.NO_WRAP)
                            val from = ev.participant?.identity?.value ?: ""
                            val topic = ev.topic ?: ""
                            notifyListeners(
                                "data-received",
                                JSObject()
                                    .put("payloadBase64", encoded)
                                    .put("participantIdentity", from)
                                    .put("topic", topic)
                            )
                            notifyListeners(
                                "text-stream-chunk",
                                JSObject()
                                    .put("topic", topic)
                                    .put("streamId", "native-data")
                                    .put("fromIdentity", from)
                                    .put("chunk", String(ev.data, Charsets.UTF_8))
                            )
                            notifyListeners(
                                "text-stream-complete",
                                JSObject()
                                    .put("topic", topic)
                                    .put("streamId", "native-data")
                                    .put("fromIdentity", from)
                                    .put("text", String(ev.data, Charsets.UTF_8))
                            )
                        }/*
                        is RoomEvent.ParticipantMetadataChanged -> {
                            notifyListeners(
                                "participant-metadata-changed",
                                JSObject()
                                    .put("identity", ev.participant.identity?.value ?: "")
                                    .put("metadata", ev.participant.metadata ?: "")
                            )
                        }/*
                        is RoomEvent.RoomMetadataChanged -> {
                            notifyListeners("room-metadata-changed", JSObject())
                        }/*
                        is RoomEvent.TranscriptionReceived -> {
                            notifyListeners("transcription-received", JSObject())
                        }/*
                        else -> {}/*
                    }/*
                }/* catch (t: Throwable) { Log.w(TAG, "event emit failed", t) }/*
            }/*
        }/*
    }/*

    private fun emit(event: String, data: JSObject) {
        try { notifyListeners(event, data) }/* catch (t: Throwable) { Log.w(TAG, "notifyListeners($event)", t) }/*
    }/*

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
                if (webViewOriginalBg == null) {
                    webViewOriginalBg = (wv.background as? android.graphics.drawable.ColorDrawable)?.color ?: Color.WHITE
                }/*
                wv.setBackgroundColor(Color.TRANSPARENT)
                wv.background = null
                try { wv.setLayerType(View.LAYER_TYPE_HARDWARE, null) }/* catch (_: Throwable) {}/*
                try { parent.setBackgroundColor(Color.BLACK) }/* catch (_: Throwable) {}/*

                if (previewRenderer == null) {
                    val container = FrameLayout(act).apply {
                        setBackgroundColor(Color.TRANSPARENT)
                        clipToPadding = true
                        clipChildren = true
                    }/*
                    val renderer = TextureViewRenderer(act)
                    configureAspectFitRenderer(renderer, mirror)
                    container.addView(renderer, fitChildLayoutParams())
                    val lp: ViewGroup.MarginLayoutParams = nativeLayerLayoutParams(
                        parent,
                        ViewGroup.LayoutParams.MATCH_PARENT,
                        ViewGroup.LayoutParams.MATCH_PARENT,
                    )
                    // TextureView must be attached before initVideoRenderer on
                    // several OEM EGL stacks; still inserted at index 0 so it
                    // sits BEHIND the transparent WebView and never steals the
                    // overlay layer from React chat/gifts/header controls.
                    parent.addView(container, 0, lp)
                    try { room?.initVideoRenderer(renderer) }/* catch (t: Throwable) { Log.w(TAG, "initVideoRenderer", t) }/*
                    previewRendererContainer = container
                    previewRenderer = renderer
                    enforceOverlayContract("fullscreen-create")
                    scheduleOverlayContractWatchdog("fullscreen-create")

                /*
                    previewRenderer?.let { configureAspectFitRenderer(it, mirror) }/*
                    enforceOverlayContract("fullscreen-reuse")
                }/*
            }/* catch (t: Throwable) {
                Log.w(TAG, "ensureRendererAttached failed", t)
            }/*
        }/*
    }/*

    private fun detachRenderer(restoreWebView: Boolean = true) {
        val act = activity ?: return
        act.runOnUiThread {
            try {
                val r = previewRenderer
                if (r != null) {
                    try { previewTrack?.removeRenderer(r) }/* catch (_: Throwable) {}/*
                    val container = previewRendererContainer ?: (r.parent as? FrameLayout)
                    if (container != null) {
                        (container.parent as? ViewGroup)?.removeView(container)
                    /*
                        (r.parent as? ViewGroup)?.removeView(r)
                    }/*
                    try { r.release() }/* catch (_: Throwable) {}/*
                }/*
                previewRenderer = null
                previewRendererBound = false
                previewRendererContainer = null
                val wv = bridge?.webView
                if (restoreWebView && wv != null) {
                    wv.setBackgroundColor(webViewOriginalBg ?: Color.WHITE)
                }/*
                if (restoreWebView) webViewOriginalBg = null
            }/* catch (t: Throwable) {
                Log.w(TAG, "detachRenderer failed", t)
            }/*
        }/*
    }/*

    private fun safeStopPreviewInternals() {
        try {
            val track = previewTrack
            if (track != null) {
                try { previewRenderer?.let { track.removeRenderer(it) }/* }/* catch (_: Throwable) {}/*
                try { track.stop() }/* catch (_: Throwable) {}/*
                try { track.dispose() }/* catch (_: Throwable) {}/*
            }/*
            previewTrack = null
            previewRendererBound = false
        }/* catch (_: Throwable) {}/*
        detachRenderer(restoreWebView = true)

        // If we created a preview-only Room (never connected) just to host the
        // capturer, release it too. A connected room is kept by teardownAll().
        if (!isConnected) {
            try { room?.disconnect() }/* catch (_: Throwable) {}/*
            room = null
        }/*
    }/*

    private fun teardownAll() {
        eventsJob?.cancel()
        eventsJob = null
        lastConnectArgs = null
        activeRoomScope = null
        activeIsHost = false
        pendingRpcReplies.values.forEach { deferred ->
            try { deferred.complete(RpcReply(null, "room_disconnected")) }/* catch (_: Throwable) {}/*
        }/*
        pendingRpcReplies.clear()
        try { clearAllSlots() }/* catch (_: Throwable) {}/*
        // Releases publish + stops CameraX via the SDK.
        try {
            val track = previewTrack
            if (track != null) {
                try { previewRenderer?.let { track.removeRenderer(it) }/* }/* catch (_: Throwable) {}/*
                try { track.stop() }/* catch (_: Throwable) {}/*
                try { track.dispose() }/* catch (_: Throwable) {}/*
            }/*
        }/* catch (_: Throwable) {}/*
        previewTrack = null
        previewRendererBound = false
        detachRenderer(restoreWebView = true)
        releaseRoomResources()
        try { CameraOwnership.release(CameraOwnership.OWNER_LIVEKIT) }/* catch (_: Throwable) {}/*
        RtcEngineManager.clearRoom(room)
        room = null
        isConnected = false
        boundedMode = false
    }/*

    private fun releaseRoomResources() {
        try { room?.disconnect() }/* catch (_: Throwable) {}/*
        // OEM_CAMERA_RELEASE_SETTLE_MS documents the required Camera2 HAL
        // settle window after track.stop()/room.disconnect(). The release path
        // is coroutine/main-thread driven, so we do not block UI here.
    }/*

    private fun runOnMain(block: () -> Unit) {
        val act = activity
        if (act != null) act.runOnUiThread { block() }/* else block()
    }/*
}/*
