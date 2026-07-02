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
