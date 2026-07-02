package com.merilive.app.plugins

import android.app.Activity
import android.content.Context
import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Paint
import android.graphics.PorterDuff
import android.graphics.PorterDuffXfermode
import android.graphics.Rect
import android.media.AudioAttributes
import android.media.AudioFocusRequest
import android.media.AudioManager
import android.media.MediaPlayer
import android.media.MediaRecorder
import android.media.audiofx.NoiseSuppressor
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.util.Base64
import android.util.Log
import android.view.Gravity
import android.view.View
import android.view.ViewGroup
import android.widget.FrameLayout
import android.widget.ImageView
import io.flutter.embedding.engine.FlutterEngine
import io.flutter.plugin.common.EventChannel
import io.flutter.plugin.common.MethodCall
import io.flutter.plugin.common.MethodChannel
import io.livekit.android.ConnectOptions
import io.livekit.android.LiveKit
import io.livekit.android.RoomOptions
import io.livekit.android.audio.AudioSwitchHandler
import io.livekit.android.events.RoomEvent
import io.livekit.android.events.collect
import io.livekit.android.renderer.TextureViewRenderer
import io.livekit.android.room.Room
import io.livekit.android.room.participant.LocalParticipant
import io.livekit.android.room.track.CameraPosition
import io.livekit.android.room.track.LocalVideoTrack
import io.livekit.android.room.track.LocalVideoTrackOptions
import io.livekit.android.room.track.Track
import io.livekit.android.room.track.VideoCaptureParameters
import io.livekit.android.room.track.VideoPreset169
import io.livekit.android.room.track.VideoTrack
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import org.webrtc.RendererCommon
import java.io.ByteArrayOutputStream
import java.io.File
import java.util.concurrent.atomic.AtomicBoolean


/**
 * LiveKitFlutterPlugin — Real LiveKit + Camera2 host plugin (M17 Phase A).
 *
 * Method channel: `app.merilive/livekit`
 *
 * Ownership model (Chamet/Bigo parity):
 *   • ONE Room instance per app process. `initialize` builds it lazily.
 *   • ONE local camera track. `startLocalPreview` publishes a preview-scope
 *     track that lives on a standalone renderer (behind the Flutter view
 *     with transparent WebView/FlutterView background). `connect` re-uses
 *     the same camera track — never republishes, never re-negotiates.
 *   • Two SurfaceViewRenderer holders:
 *       - `previewHolder`   — mounted below FlutterView during Go Live
 *       - `attachedHolder`  — mounted below FlutterView during in-stream
 *     Both use the same underlying track; scaling type + mirror push into
 *     both live.
 *   • Camera flip is atomic via LiveKit `CameraCapturer.switchCamera()` on
 *     the SAME track — no republish (SFU keeps the SSRC).
 *
 * Native beauty / sticker / snapshot:
 *   • `setBeautyParams` — pushed to `BeautyProcessor` (GPUPixel bridge in
 *     production; graceful no-op here if the .so isn't loaded, so debug
 *     APKs still function).
 *   • `setStickerOverlay` — decorates the renderer parent with an
 *     ImageView on top; positioned/scaled per args.
 *   • `snapshotLocalPreview` — grabs a frame off the renderer via
 *     `Bitmap.createBitmap(width,height)` + `PixelCopy`, returns JPEG@72
 *     as base64 (identical format to the web canvas snapshot upload).
 *
 * All methods are safe when called out-of-order; every op returns a
 * `{success, reason?}` map so the Dart side can render precise error
 * toasts instead of generic PlatformException stacks.
 */
class LiveKitFlutterPlugin : MethodChannel.MethodCallHandler {

    companion object {
        private const val TAG = "LiveKitFlutter"
        private const val CHANNEL = "app.merilive/livekit"

        @JvmStatic
        fun register(engine: FlutterEngine, activity: Activity) {
            val plugin = LiveKitFlutterPlugin().apply { attach(activity) }
            MethodChannel(engine.dartExecutor.binaryMessenger, CHANNEL)
                .setMethodCallHandler(plugin)
            // H2 — Android AudioFocus event bridge (used by AudioFocusAutoMute).
            EventChannel(engine.dartExecutor.binaryMessenger, "app.merilive/audio_focus")
                .setStreamHandler(AudioFocusEventEmitter.streamHandler(activity))
        }
    }


    // ─── Ownership ────────────────────────────────────────────
    private var activity: Activity? = null
    private val main = Handler(Looper.getMainLooper())
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Main)

    private var room: Room? = null
    private var audioSwitch: AudioSwitchHandler? = null
    private var eventsJob: Job? = null

    private var localVideoTrack: LocalVideoTrack? = null
    private var currentCameraPos: CameraPosition = CameraPosition.FRONT
    private var mirror: Boolean = true
    private var scalingType: RendererCommon.ScalingType =
        RendererCommon.ScalingType.SCALE_ASPECT_FILL

    private var previewHolder: FrameLayout? = null
    private var previewRenderer: TextureViewRenderer? = null

    private var attachedHolder: FrameLayout? = null
    private var attachedRenderer: TextureViewRenderer? = null

    private var stickerOverlay: ImageView? = null

    private val previewActive = AtomicBoolean(false)
    private val connected = AtomicBoolean(false)

    // ─── Attach ───────────────────────────────────────────────
    fun attach(activity: Activity) {
        this.activity = activity
    }

    // ─── Dispatch ─────────────────────────────────────────────
    override fun onMethodCall(call: MethodCall, result: MethodChannel.Result) {
        try {
            when (call.method) {
                "initialize" -> initialize(result)
                "startLocalPreview" -> startLocalPreview(call, result)
                "stopLocalPreview" -> stopLocalPreview(result)
                "connect" -> connect(call, result)
                "disconnect" -> disconnect(result)
                "getStatus" -> getStatus(result)
                "attachLocal" -> attachLocal(result)
                "detachLocal" -> detachLocal(result)
                "setMirror" -> {
                    mirror = call.argument<Boolean>("mirror") ?: true
                    applyMirror()
                    ok(result)
                }
                "setScalingType" -> {
                    val mode = call.argument<String>("mode") ?: "fill"
                    scalingType = when (mode) {
                        "fit" -> RendererCommon.ScalingType.SCALE_ASPECT_FIT
                        "balanced" -> RendererCommon.ScalingType.SCALE_ASPECT_BALANCED
                        else -> RendererCommon.ScalingType.SCALE_ASPECT_FILL
                    }
                    applyScaling()
                    ok(result)
                }
                "setVideoVisible" -> {
                    val visible = call.argument<Boolean>("visible") ?: true
                    scope.launch {
                        localVideoTrack?.enable(visible)
                        ok(result)
                    }
                }
                "setMicEnabled" -> {
                    val enabled = call.argument<Boolean>("enabled") ?: true
                    scope.launch {
                        room?.localParticipant?.setMicrophoneEnabled(enabled)
                        ok(result)
                    }
                }
                "switchCamera" -> switchCamera(result)
                "setBeautyEnabled" -> {
                    val enabled = call.argument<Boolean>("enabled") ?: false
                    BeautyProcessor.enabled = enabled
                    ok(result)
                }
                "setBeautyParams" -> setBeautyParams(call, result)
                "setStickerOverlay" -> setStickerOverlay(call, result)
                "snapshotLocalPreview" -> snapshotLocalPreview(result)
                "getStats" -> getStats(result)
                // ── H2 — content safety + Phase G effects ───────────
                "snapshotVoiceChunk" -> snapshotVoiceChunk(call, result)
                "setBackgroundMusic" -> setBackgroundMusic(call, result)
                "setBackgroundMusicPlaying" -> {
                    val playing = call.argument<Boolean>("playing") ?: false
                    setBackgroundMusicPlaying(playing); ok(result)
                }
                "setBackgroundMusicVolume" -> {
                    val v = (call.argument<Number>("volume") ?: 0.6).toFloat()
                    setBackgroundMusicVolume(v); ok(result)
                }
                "setVirtualBackground" -> setVirtualBackground(call, result)
                "setNoiseCancellation" -> {
                    val on = call.argument<Boolean>("enabled") ?: false
                    setNoiseCancellation(on, result)
                }
                else -> result.notImplemented()

            }
        } catch (t: Throwable) {
            Log.e(TAG, "onMethodCall ${call.method} failed", t)
            result.success(mapOf("success" to false, "reason" to (t.message ?: "error")))
        }
    }

    // ─── Room lifecycle ───────────────────────────────────────
    private fun initialize(result: MethodChannel.Result) {
        val ctx = activity ?: return fail(result, "no_activity")
        if (room != null) return ok(result)
        room = LiveKit.create(
            appContext = ctx.applicationContext,
            options = RoomOptions(
                adaptiveStream = true,
                dynacast = true,
            ),
        )
        audioSwitch = AudioSwitchHandler(ctx.applicationContext).also { it.start { _, _ -> } }
        ok(result)
    }

    private fun startLocalPreview(call: MethodCall, result: MethodChannel.Result) {
        val ctx = activity ?: return fail(result, "no_activity")
        if (room == null) {
            initialize(NoopResult)
        }
        val room = this.room ?: return fail(result, "room_null")
        val front = call.argument<Boolean>("front") ?: true
        currentCameraPos = if (front) CameraPosition.FRONT else CameraPosition.BACK

        scope.launch {
            try {
                if (localVideoTrack == null) {
                    localVideoTrack = room.localParticipant.createVideoTrack(
                        options = LocalVideoTrackOptions(
                            position = currentCameraPos,
                            captureParams = VideoCaptureParameters(
                                width = VideoPreset169.H720.capture.width,
                                height = VideoPreset169.H720.capture.height,
                                maxFps = 30,
                            ),
                        )
                    )
                    localVideoTrack?.startCapture()
                }
                ensurePreviewRenderer(ctx)
                localVideoTrack?.addRenderer(previewRenderer!!)
                previewActive.set(true)
                ok(result, mapOf("success" to true, "front" to front))
            } catch (t: Throwable) {
                Log.e(TAG, "startLocalPreview failed", t)
                fail(result, t.message ?: "start_preview_failed")
            }
        }
    }

    private fun stopLocalPreview(result: MethodChannel.Result) {
        try {
            previewRenderer?.let { localVideoTrack?.removeRenderer(it) }
            removeView(previewHolder)
            previewHolder = null
            previewRenderer?.release(); previewRenderer = null
            previewActive.set(false)
            // Only stop the camera capture if we're not connected — connect
            // path keeps the track alive.
            if (!connected.get()) {
                scope.launch {
                    localVideoTrack?.stopCapture()
                    localVideoTrack?.dispose()
                    localVideoTrack = null
                }
            }
            ok(result)
        } catch (t: Throwable) {
            fail(result, t.message ?: "stop_preview_failed")
        }
    }

    private fun connect(call: MethodCall, result: MethodChannel.Result) {
        val wsUrl = call.argument<String>("wsUrl") ?: return fail(result, "no_wsUrl")
        val token = call.argument<String>("token") ?: return fail(result, "no_token")
        val publishVideo = call.argument<Boolean>("publishVideo") ?: true
        val publishAudio = call.argument<Boolean>("publishAudio") ?: true

        val ctx = activity ?: return fail(result, "no_activity")
        if (room == null) initialize(NoopResult)
        val room = this.room ?: return fail(result, "room_null")

        scope.launch {
            try {
                room.connect(wsUrl, token, ConnectOptions(autoSubscribe = true))
                connected.set(true)

                val local: LocalParticipant = room.localParticipant
                if (publishVideo) {
                    // Reuse pre-warmed preview track if any (zero-gap handoff).
                    val track = localVideoTrack ?: local.createVideoTrack(
                        options = LocalVideoTrackOptions(position = currentCameraPos)
                    ).also { localVideoTrack = it; it.startCapture() }
                    local.publishVideoTrack(track)
                }
                if (publishAudio) {
                    local.setMicrophoneEnabled(true)
                }

                observeEvents(room)
                ok(result, mapOf("success" to true, "sid" to (room.sid ?: "")))
            } catch (t: Throwable) {
                Log.e(TAG, "connect failed", t)
                connected.set(false)
                fail(result, t.message ?: "connect_failed")
            }
        }
    }

    private fun disconnect(result: MethodChannel.Result) {
        scope.launch {
            try {
                eventsJob?.cancel(); eventsJob = null
                room?.disconnect()
                connected.set(false)
                previewRenderer?.let { localVideoTrack?.removeRenderer(it) }
                attachedRenderer?.let { localVideoTrack?.removeRenderer(it) }
                removeView(attachedHolder); attachedHolder = null
                attachedRenderer?.release(); attachedRenderer = null
                removeStickerOverlay()
                localVideoTrack?.stopCapture()
                localVideoTrack?.dispose(); localVideoTrack = null
                ok(result)
            } catch (t: Throwable) {
                fail(result, t.message ?: "disconnect_failed")
            }
        }
    }

    private fun getStatus(result: MethodChannel.Result) {
        result.success(
            mapOf(
                "initialized" to (room != null),
                "connected" to connected.get(),
                "previewing" to previewActive.get(),
                "hasLocalVideo" to (localVideoTrack != null),
                "cameraPosition" to currentCameraPos.name,
                "mirror" to mirror,
            )
        )
    }

    private fun observeEvents(room: Room) {
        eventsJob?.cancel()
        eventsJob = scope.launch {
            room.events.collect { ev: RoomEvent ->
                when (ev) {
                    is RoomEvent.Disconnected -> connected.set(false)
                    else -> {}
                }
            }
        }
    }

    // ─── Attach / detach in-stream ────────────────────────────
    private fun attachLocal(result: MethodChannel.Result) {
        val ctx = activity ?: return fail(result, "no_activity")
        val track = localVideoTrack ?: return result.success(
            mapOf("attached" to false, "reason" to "no_local_track")
        )
        ensureAttachedRenderer(ctx)
        track.addRenderer(attachedRenderer!!)
        result.success(mapOf("attached" to true))
    }

    private fun detachLocal(result: MethodChannel.Result) {
        attachedRenderer?.let { localVideoTrack?.removeRenderer(it) }
        removeView(attachedHolder); attachedHolder = null
        attachedRenderer?.release(); attachedRenderer = null
        ok(result)
    }

    // ─── Camera flip (SSRC-preserving) ────────────────────────
    private fun switchCamera(result: MethodChannel.Result) {
        val track = localVideoTrack ?: return fail(result, "no_local_track")
        scope.launch {
            try {
                // LiveKit's CameraCapturer supports symmetric flip that
                // preserves the sender SSRC — no republish, no PC re-negotiation.
                val newPos = if (currentCameraPos == CameraPosition.FRONT)
                    CameraPosition.BACK else CameraPosition.FRONT
                track.switchCamera(newPos)
                currentCameraPos = newPos
                mirror = (newPos == CameraPosition.FRONT)
                applyMirror()
                ok(result, mapOf("success" to true, "front" to (newPos == CameraPosition.FRONT)))
            } catch (t: Throwable) {
                fail(result, t.message ?: "switch_failed")
            }
        }
    }

    // ─── Beauty / sticker / snapshot ──────────────────────────
    private fun setBeautyParams(call: MethodCall, result: MethodChannel.Result) {
        BeautyProcessor.smooth = (call.argument<Number>("smooth") ?: 0).toFloat()
        BeautyProcessor.whiten = (call.argument<Number>("whiten") ?: 0).toFloat()
        BeautyProcessor.slim   = (call.argument<Number>("slim") ?: 0).toFloat()
        BeautyProcessor.eye    = (call.argument<Number>("eye") ?: 0).toFloat()
        BeautyProcessor.rosy   = (call.argument<Number>("rosy") ?: 0).toFloat()
        BeautyProcessor.pushToNative()
        ok(result)
    }

    private fun setStickerOverlay(call: MethodCall, result: MethodChannel.Result) {
        val ctx = activity ?: return fail(result, "no_activity")
        val url = call.argument<String>("url")
        val remove = call.argument<Boolean>("remove") ?: (url.isNullOrEmpty())
        main.post {
            if (remove) {
                removeStickerOverlay()
                ok(result); return@post
            }
            val parent = attachedHolder ?: previewHolder
            if (parent == null) return@post fail(result, "no_renderer")
            if (stickerOverlay == null) {
                stickerOverlay = ImageView(ctx).apply {
                    layoutParams = FrameLayout.LayoutParams(
                        FrameLayout.LayoutParams.MATCH_PARENT,
                        FrameLayout.LayoutParams.MATCH_PARENT,
                    ).apply { gravity = Gravity.CENTER }
                    scaleType = ImageView.ScaleType.CENTER_INSIDE
                }
                parent.addView(stickerOverlay)
            }
            StickerLoader.loadInto(ctx, url!!, stickerOverlay!!) { ok(result) }
        }
    }

    private fun removeStickerOverlay() {
        stickerOverlay?.let { it.parent?.let { p -> (p as ViewGroup).removeView(it) } }
        stickerOverlay = null
    }

    private fun snapshotLocalPreview(result: MethodChannel.Result) {
        val renderer = attachedRenderer ?: previewRenderer
            ?: return fail(result, "no_renderer")
        // TextureViewRenderer inherits TextureView.getBitmap() — works
        // on any API 14+ without PixelCopy.
        try {
            val bmp = renderer.bitmap ?: return fail(result, "bitmap_null")
            val out = ByteArrayOutputStream()
            bmp.compress(Bitmap.CompressFormat.JPEG, 72, out)
            val b64 = Base64.encodeToString(out.toByteArray(), Base64.NO_WRAP)
            ok(result, mapOf("success" to true, "base64" to "data:image/jpeg;base64,$b64"))
        } catch (t: Throwable) {
            fail(result, t.message ?: "snapshot_failed")
        }
    }

    private fun getStats(result: MethodChannel.Result) {
        val r = room
        if (r == null) return result.success(mapOf("success" to false, "reason" to "no_room"))
        result.success(
            mapOf(
                "success" to true,
                "state" to (r.state?.name ?: "unknown"),
                "numParticipants" to (r.remoteParticipants.size + if (connected.get()) 1 else 0),
            )
        )
    }

    // ─── Renderer bootstrap ───────────────────────────────────
    private fun ensurePreviewRenderer(ctx: Context) {
        val act = activity ?: return
        if (previewRenderer != null) return
        val renderer = TextureViewRenderer(ctx).apply {
            init(LiveKit.getEglBase(ctx.applicationContext).eglBaseContext, null)
            setScalingType(scalingType)
            setMirror(mirror && currentCameraPos == CameraPosition.FRONT)
        }
        val holder = FrameLayout(ctx).apply {
            layoutParams = ViewGroup.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.MATCH_PARENT,
            )
            setBackgroundColor(Color.BLACK)
            addView(renderer)
        }
        // Mount BEHIND FlutterView. FlutterView background is set
        // transparent in MainActivity for the camera to show through.
        val decor = act.window.decorView as ViewGroup
        decor.addView(holder, 0)
        previewRenderer = renderer
        previewHolder = holder
    }

    private fun ensureAttachedRenderer(ctx: Context) {
        val act = activity ?: return
        if (attachedRenderer != null) return
        val renderer = TextureViewRenderer(ctx).apply {
            init(LiveKit.getEglBase(ctx.applicationContext).eglBaseContext, null)
            setScalingType(scalingType)
            setMirror(mirror && currentCameraPos == CameraPosition.FRONT)
        }
        val holder = FrameLayout(ctx).apply {
            layoutParams = ViewGroup.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.MATCH_PARENT,
            )
            setBackgroundColor(Color.BLACK)
            addView(renderer)
        }
        val decor = act.window.decorView as ViewGroup
        decor.addView(holder, 0)
        attachedRenderer = renderer
        attachedHolder = holder
    }

    private fun applyMirror() {
        val m = mirror && currentCameraPos == CameraPosition.FRONT
        previewRenderer?.setMirror(m)
        attachedRenderer?.setMirror(m)
    }

    private fun applyScaling() {
        previewRenderer?.setScalingType(scalingType)
        attachedRenderer?.setScalingType(scalingType)
    }

    private fun removeView(v: View?) {
        v?.parent?.let { (it as ViewGroup).removeView(v) }
    }

    // ─── H2 — snapshotVoiceChunk (Phase E-19 voice moderation) ─────
    //
    // Records `ms` milliseconds of AAC audio from MIC into a temp file,
    // reads it back as base64. This is a self-contained mic capture
    // (not the actual published LiveKit track) — which is exactly what
    // the web build does too (Web Audio MediaRecorder off the mic
    // stream). ElevenLabs Scribe accepts AAC natively.
    private var voiceRecorder: MediaRecorder? = null
    private fun snapshotVoiceChunk(call: MethodCall, result: MethodChannel.Result) {
        val ctx = activity ?: return fail(result, "no_activity")
        val ms = (call.argument<Number>("ms") ?: 20000).toInt().coerceIn(1000, 60000)
        val out = File(ctx.cacheDir, "voice_${System.currentTimeMillis()}.aac")
        try {
            val rec = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S)
                MediaRecorder(ctx) else @Suppress("DEPRECATION") MediaRecorder()
            rec.setAudioSource(MediaRecorder.AudioSource.MIC)
            rec.setOutputFormat(MediaRecorder.OutputFormat.AAC_ADTS)
            rec.setAudioEncoder(MediaRecorder.AudioEncoder.AAC)
            rec.setAudioSamplingRate(16000)
            rec.setAudioEncodingBitRate(32_000)
            rec.setOutputFile(out.absolutePath)
            rec.prepare()
            rec.start()
            voiceRecorder = rec
            main.postDelayed({
                try {
                    voiceRecorder?.stop()
                    voiceRecorder?.release()
                    voiceRecorder = null
                    val bytes = out.readBytes()
                    val b64 = Base64.encodeToString(bytes, Base64.NO_WRAP)
                    out.delete()
                    result.success(mapOf(
                        "ok" to true,
                        "base64" to b64,
                        "mime" to "audio/aac",
                    ))
                } catch (t: Throwable) {
                    voiceRecorder = null
                    fail(result, t.message ?: "voice_stop_failed")
                }
            }, ms.toLong())
        } catch (t: Throwable) {
            voiceRecorder = null
            out.delete()
            fail(result, t.message ?: "voice_start_failed")
        }
    }

    // ─── H2 — Background music (Phase G-25) ────────────────────────
    //
    // Local host-side MediaPlayer playback (host self-monitor). Mixing
    // this into the published LiveKit audio track for remote listeners
    // requires a custom AudioSource swap and is deferred to a future
    // pass; for now the host hears their music at the configured
    // volume, matching Chamet's "monitor" behaviour when no music-
    // publish permission is granted.
    private var bgPlayer: MediaPlayer? = null
    private var bgVolume: Float = 0.6f
    private fun setBackgroundMusic(call: MethodCall, result: MethodChannel.Result) {
        val url = call.argument<String>("url")
        val play = call.argument<Boolean>("play") ?: true
        bgVolume = (call.argument<Number>("volume") ?: 0.6).toFloat()
        try {
            bgPlayer?.release(); bgPlayer = null
            if (url.isNullOrBlank() || !play) return ok(result)
            val mp = MediaPlayer().apply {
                setAudioAttributes(
                    AudioAttributes.Builder()
                        .setUsage(AudioAttributes.USAGE_MEDIA)
                        .setContentType(AudioAttributes.CONTENT_TYPE_MUSIC)
                        .build()
                )
                setDataSource(url)
                setVolume(bgVolume, bgVolume)
                isLooping = true
                setOnPreparedListener { it.start() }
                setOnErrorListener { _, _, _ -> true }
                prepareAsync()
            }
            bgPlayer = mp
            ok(result, mapOf("success" to true, "playing" to true))
        } catch (t: Throwable) {
            fail(result, t.message ?: "bg_music_failed")
        }
    }
    private fun setBackgroundMusicPlaying(playing: Boolean) {
        val p = bgPlayer ?: return
        try { if (playing) p.start() else p.pause() } catch (_: Throwable) {}
    }
    private fun setBackgroundMusicVolume(v: Float) {
        bgVolume = v.coerceIn(0f, 1f)
        try { bgPlayer?.setVolume(bgVolume, bgVolume) } catch (_: Throwable) {}
    }

    // ─── H2 — Virtual background (Phase G-25) ──────────────────────
    //
    // Real GPUPixel + MLKit SelfieSegmentation swap is a separate
    // pipeline (needs a frame-injection capturer wrapper). Until that
    // ships we accept the URL and persist the choice — sheet stops
    // showing the "dormant" hint because the plugin now handles the
    // method, but the actual pixel swap is dormant. Honest state.
    @Volatile private var virtualBgUrl: String? = null
    private fun setVirtualBackground(call: MethodCall, result: MethodChannel.Result) {
        virtualBgUrl = call.argument<String>("url")
        // TODO: when GPUPixel segmentation lands, load bitmap via Coil
        // and push into the beauty processor's background slot.
        result.success(mapOf(
            "success" to true,
            "applied" to false,
            "reason" to "segmentation_pending",
            "url" to virtualBgUrl,
        ))
    }

    // ─── H2 — Noise cancellation (Phase G-25) ──────────────────────
    //
    // Uses android.media.audiofx.NoiseSuppressor on the LiveKit audio
    // track's session id (best-effort). Returns `available:false` on
    // devices without the NoiseSuppressor OMX component.
    @Volatile private var noiseSuppressor: NoiseSuppressor? = null
    private fun setNoiseCancellation(on: Boolean, result: MethodChannel.Result) {
        try {
            if (!on) {
                noiseSuppressor?.release(); noiseSuppressor = null
                return ok(result, mapOf("success" to true, "enabled" to false))
            }
            if (!NoiseSuppressor.isAvailable()) {
                return result.success(mapOf(
                    "success" to true, "enabled" to false, "available" to false,
                ))
            }
            // LiveKit uses WebRTC's audio session; we can attach a system
            // NoiseSuppressor to session 0 (global mic) as a fallback.
            noiseSuppressor?.release()
            noiseSuppressor = NoiseSuppressor.create(0)?.also { it.enabled = true }
            ok(result, mapOf(
                "success" to true, "enabled" to (noiseSuppressor != null),
            ))
        } catch (t: Throwable) {
            fail(result, t.message ?: "ns_failed")
        }
    }


    // ─── Result helpers ───────────────────────────────────────
    private fun ok(r: MethodChannel.Result, extra: Map<String, Any?>? = null) {
        r.success(extra ?: mapOf("success" to true))
    }
    private fun fail(r: MethodChannel.Result, reason: String) {
        r.success(mapOf("success" to false, "reason" to reason))
    }
    private object NoopResult : MethodChannel.Result {
        override fun success(result: Any?) {}
        override fun error(code: String, message: String?, details: Any?) {}
        override fun notImplemented() {}
    }
}

/**
 * BeautyProcessor — bridge to native GPUPixel filter chain.
 *
 * Real production build links against `libgpupixel.so` and pushes params
 * into a JNI wrapper. If the .so isn't present (debug APK or missing
 * abi split), all methods are safe no-ops so the app still runs.
 */
object BeautyProcessor {
    @Volatile var enabled: Boolean = false
    @Volatile var smooth: Float = 0f
    @Volatile var whiten: Float = 0f
    @Volatile var slim: Float = 0f
    @Volatile var eye: Float = 0f
    @Volatile var rosy: Float = 0f

    private val gpuPixelAvailable: Boolean by lazy {
        try { System.loadLibrary("gpupixel"); true }
        catch (_: Throwable) { false }
    }

    fun pushToNative() {
        if (!gpuPixelAvailable) return
        try { nativeSetParams(enabled, smooth, whiten, slim, eye, rosy) }
        catch (_: Throwable) {}
    }
    @JvmStatic external fun nativeSetParams(
        enabled: Boolean, smooth: Float, whiten: Float,
        slim: Float, eye: Float, rosy: Float,
    )
}

/**
 * StickerLoader — lightweight URL → ImageView loader. Uses Bitmap
 * download + soft cache; avoids pulling in Glide/Picasso just for this.
 */
private object StickerLoader {
    private val cache = HashMap<String, Bitmap>()
    fun loadInto(ctx: Context, url: String, view: ImageView, done: () -> Unit) {
        cache[url]?.let { view.setImageBitmap(it); done(); return }
        Thread {
            try {
                val conn = java.net.URL(url).openConnection() as java.net.HttpURLConnection
                conn.connectTimeout = 5000
                conn.readTimeout = 5000
                val bmp = android.graphics.BitmapFactory.decodeStream(conn.inputStream)
                if (bmp != null) {
                    cache[url] = bmp
                    Handler(Looper.getMainLooper()).post {
                        view.setImageBitmap(bmp); done()
                    }
                }
            } catch (_: Throwable) {}
        }.start()
    }
}

/**
 * H2 — AudioFocusEventEmitter
 *
 * Bridges Android `AudioManager.OnAudioFocusChangeListener` into the
 * Flutter EventChannel `app.merilive/audio_focus` consumed by Dart's
 * `AudioFocusEvents` singleton (see AudioFocusAutoMute).
 *
 * Emits: 'gain' | 'loss' | 'loss_transient' | 'loss_transient_can_duck'.
 */
object AudioFocusEventEmitter {
    private var sink: EventChannel.EventSink? = null
    private var request: AudioFocusRequest? = null
    private var manager: AudioManager? = null

    private val listener = AudioManager.OnAudioFocusChangeListener { change ->
        val label = when (change) {
            AudioManager.AUDIOFOCUS_GAIN -> "gain"
            AudioManager.AUDIOFOCUS_LOSS -> "loss"
            AudioManager.AUDIOFOCUS_LOSS_TRANSIENT -> "loss_transient"
            AudioManager.AUDIOFOCUS_LOSS_TRANSIENT_CAN_DUCK -> "loss_transient_can_duck"
            else -> return@OnAudioFocusChangeListener
        }
        Handler(Looper.getMainLooper()).post {
            sink?.success(mapOf("change" to label))
        }
    }

    fun streamHandler(activity: Activity): EventChannel.StreamHandler =
        object : EventChannel.StreamHandler {
            override fun onListen(args: Any?, events: EventChannel.EventSink?) {
                sink = events
                val am = activity.getSystemService(Context.AUDIO_SERVICE) as AudioManager
                manager = am
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                    val req = AudioFocusRequest.Builder(AudioManager.AUDIOFOCUS_GAIN)
                        .setAudioAttributes(
                            AudioAttributes.Builder()
                                .setUsage(AudioAttributes.USAGE_VOICE_COMMUNICATION)
                                .setContentType(AudioAttributes.CONTENT_TYPE_SPEECH)
                                .build()
                        )
                        .setOnAudioFocusChangeListener(listener)
                        .setWillPauseWhenDucked(false)
                        .build()
                    request = req
                    am.requestAudioFocus(req)
                } else {
                    @Suppress("DEPRECATION")
                    am.requestAudioFocus(
                        listener,
                        AudioManager.STREAM_VOICE_CALL,
                        AudioManager.AUDIOFOCUS_GAIN,
                    )
                }
            }
            override fun onCancel(args: Any?) {
                try {
                    val am = manager
                    if (am != null) {
                        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                            request?.let { am.abandonAudioFocusRequest(it) }
                        } else {
                            @Suppress("DEPRECATION")
                            am.abandonAudioFocus(listener)
                        }
                    }
                } catch (_: Throwable) {}
                sink = null
                request = null
                manager = null
            }
        }
}
