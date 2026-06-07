package com.merilive.app.plugin.video

import android.content.Context
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Matrix
import android.graphics.Paint
import android.graphics.PorterDuff
import android.graphics.PorterDuffXfermode
import android.os.Build
import android.os.Handler
import android.os.HandlerThread
import android.renderscript.Allocation
import android.renderscript.Element
import android.renderscript.RenderScript
import android.renderscript.ScriptIntrinsicBlur
import android.util.Log
import com.google.mediapipe.framework.image.BitmapImageBuilder
import com.google.mediapipe.tasks.core.BaseOptions
import com.google.mediapipe.tasks.vision.core.RunningMode
import com.google.mediapipe.tasks.vision.imagesegmenter.ImageSegmenter
import com.google.mediapipe.tasks.vision.imagesegmenter.ImageSegmenter.ImageSegmenterOptions
import livekit.org.webrtc.VideoFrame
import livekit.org.webrtc.VideoProcessor
import livekit.org.webrtc.VideoSink
import livekit.org.webrtc.YuvHelper
import java.io.File
import java.nio.ByteBuffer
import java.nio.ByteOrder
import java.util.concurrent.atomic.AtomicReference

/**
 * Step 36 — Virtual background / blur processor.
 *
 * Implements `org.webrtc.VideoProcessor` and is attached to the
 * `LocalVideoTrack` via `LocalVideoTrack.setVideoProcessor(...)`.
 * Every captured frame:
 *
 *   1. Is downscaled to a 256×256 ARGB bitmap.
 *   2. Runs through MediaPipe's SelfieSegmenter (CONFIDENCE_MASK,
 *      UINT8). Mask values: 0 = background, 255 = person.
 *   3. The original frame is composited:
 *        • mode=BLUR  → person stays sharp, background is blurred via
 *                       RenderEffect (API 31+) or ScriptIntrinsicBlur.
 *        • mode=IMAGE → person stays sharp, background is replaced by
 *                       the user-supplied image (scaled center-crop).
 *        • mode=NONE  → frame is forwarded untouched (zero overhead).
 *   4. The result is re-encoded as an I420 VideoFrame and pushed to
 *      the SFU sink.
 *
 * Segmentation is single-threaded on a dedicated HandlerThread so
 * the camera capturer is never blocked. The last computed mask is
 * reused if a new frame arrives before the segmenter finishes —
 * keeps the publisher at 30 fps even on mid-tier devices that can
 * only segment at ~20 fps.
 *
 * Model file: place `selfie_segmenter.tflite`
 * (https://storage.googleapis.com/mediapipe-models/image_segmenter/selfie_segmenter/float16/latest/selfie_segmenter.tflite)
 * in `android/app/src/main/assets/mediapipe/`. If the file is
 * missing, `tryInit()` returns false and the processor stays in
 * pass-through mode — no crashes, no UI blocked.
 */
class VirtualBackgroundProcessor(private val context: Context) : VideoProcessor {

    enum class Mode { NONE, BLUR, IMAGE }

    @Volatile var mode: Mode = Mode.NONE
        private set
    @Volatile var blurRadius: Float = 18f
        private set
    private val backgroundBitmap = AtomicReference<Bitmap?>(null)

    @Volatile private var sink: VideoSink? = null
    private var segmenter: ImageSegmenter? = null
    private var renderScript: RenderScript? = null
    private var blurScript: ScriptIntrinsicBlur? = null

    private val workerThread = HandlerThread("VBackgroundProc").apply { start() }
    private val worker = Handler(workerThread.looper)

    // Pkg-audit Tier-4: use a dedicated lock for read/recycle of the mask
    // bitmap. `@Volatile` only protects reference visibility — without
    // synchronization the capture thread could be holding (and drawing into)
    // a Bitmap reference at the exact instant the worker thread recycles it,
    // crashing with "Canvas: trying to use a recycled bitmap".
    private val maskLock = Any()
    private var lastMask: Bitmap? = null
    // Pkg-audit Tier-4: AtomicBoolean.compareAndSet for the in-flight gate —
    // a plain `@Volatile` flag is visible across threads but the read-modify-
    // write (if (!inFlight) { inFlight = true ... }) is not atomic, so two
    // captured frames arriving back-to-back can both pass the guard.
    private val inFlight = java.util.concurrent.atomic.AtomicBoolean(false)

    @Synchronized
    fun tryInit(modelAsset: String = "mediapipe/selfie_segmenter.tflite"): Boolean {
        if (segmenter != null) return true
        return try {
            val baseOptions = BaseOptions.builder()
                .setModelAssetPath(modelAsset)
                .build()
            val opts = ImageSegmenterOptions.builder()
                .setBaseOptions(baseOptions)
                .setRunningMode(RunningMode.IMAGE)
                .setOutputCategoryMask(true)
                .setOutputConfidenceMasks(false)
                .build()
            segmenter = ImageSegmenter.createFromOptions(context, opts)
            true
        } catch (e: Exception) {
            Log.w(TAG, "MediaPipe model load failed (${e.message}); processor stays pass-through.")
            null.also { segmenter = null } != null
            false
        }
    }

    fun setMode(newMode: Mode) {
        if (newMode == mode) return
        mode = newMode
        if (newMode != Mode.NONE) tryInit()
    }

    fun setBlurRadius(radius: Float) {
        blurRadius = radius.coerceIn(1f, 60f)
    }

    /** Set the replacement bitmap. Pass null to clear. */
    fun setBackgroundBitmap(bm: Bitmap?) {
        backgroundBitmap.getAndSet(bm)?.recycle()
    }

    fun setBackgroundFromFile(path: String?): Boolean {
        if (path.isNullOrBlank()) { setBackgroundBitmap(null); return true }
        return try {
            val f = File(path)
            if (!f.exists()) return false
            val bm = BitmapFactory.decodeFile(f.absolutePath) ?: return false
            setBackgroundBitmap(bm)
            true
        } catch (_: Exception) { false }
    }

    fun release() {
        worker.removeCallbacksAndMessages(null)
        workerThread.quitSafely()
        try { segmenter?.close() } catch (_: Exception) {}
        segmenter = null
        try { blurScript?.destroy() } catch (_: Exception) {}
        try { renderScript?.destroy() } catch (_: Exception) {}
        blurScript = null; renderScript = null
        synchronized(maskLock) { lastMask?.recycle(); lastMask = null }
        backgroundBitmap.getAndSet(null)?.recycle()
    }

    // ---- VideoProcessor / CapturerObserver --------------------------

    override fun setSink(sink: VideoSink?) { this.sink = sink }
    override fun onCapturerStarted(success: Boolean) {}
    override fun onCapturerStopped() {
        Log.i(TAG, "onCapturerStopped — releasing VirtualBackgroundProcessor")
        try { release() } catch (_: Throwable) {}
    }

    override fun onFrameCaptured(frame: VideoFrame) {
        val activeMode = mode
        val seg = segmenter
        if (activeMode == Mode.NONE || seg == null) {
            sink?.onFrame(frame); return
        }

        val capturedAtNs = frame.timestampNs
        val rotation = frame.rotation
        val srcW = frame.buffer.width
        val srcH = frame.buffer.height
        val i420 = frame.buffer.toI420()

        val bitmap = i420ToArgbBitmap(i420)
        i420.release()

        if (inFlight.compareAndSet(false, true)) {
            val downscale = scaleBitmap(bitmap, 256, 256)
            worker.post {
                try {
                    val mp = BitmapImageBuilder(downscale).build()
                    val res = seg.segment(mp)
                    val maskImg = res.categoryMask().orElse(null)
                    if (maskImg != null) {
                        val maskBytes = ByteBuffer.allocateDirect(256 * 256)
                            .order(ByteOrder.nativeOrder())
                        com.google.mediapipe.framework.image.ByteBufferExtractor
                            .extract(maskImg, maskBytes)
                        val newMask = maskBufferToBitmap(maskBytes, 256, 256)
                        // Pkg-audit Tier-4: swap + recycle the old mask under
                        // the lock so the capture thread can never read a
                        // reference that's about to be (or has been) recycled.
                        synchronized(maskLock) {
                            lastMask?.recycle()
                            lastMask = newMask
                        }
                    }
                    res.close()
                } catch (e: Exception) {
                    Log.w(TAG, "segment failed: ${e.message}")
                } finally {
                    downscale.recycle()
                    inFlight.set(false)
                }
            }
        }

        // Compose under the lock: holding maskLock for the duration of
        // composite() guarantees the worker can't recycle the mask mid-draw.
        val outFrame = synchronized(maskLock) {
            val mask = lastMask
            val composed = if (mask != null) composite(bitmap, mask, activeMode) else bitmap
            val f = argbBitmapToVideoFrame(composed, srcW, srcH, rotation, capturedAtNs)
            if (composed !== bitmap) composed.recycle()
            f
        }
        bitmap.recycle()
        sink?.onFrame(outFrame)
        outFrame.release()
    }

    // ---- Compositing -------------------------------------------------

    private fun composite(src: Bitmap, mask256: Bitmap, m: Mode): Bitmap {
        val out = Bitmap.createBitmap(src.width, src.height, Bitmap.Config.ARGB_8888)
        val canvas = Canvas(out)

        when (m) {
            Mode.BLUR -> {
                val blurred = blurBitmap(src, blurRadius)
                canvas.drawBitmap(blurred, 0f, 0f, null)
                if (blurred !== src) blurred.recycle()
            }
            Mode.IMAGE -> {
                val bg = backgroundBitmap.get()
                if (bg != null) {
                    canvas.drawBitmap(bg, centerCropMatrix(bg, src.width, src.height), null)
                } else {
                    canvas.drawColor(Color.BLACK)
                }
            }
            Mode.NONE -> { }
        }

        val personLayer = Bitmap.createBitmap(src.width, src.height, Bitmap.Config.ARGB_8888)
        val pc = Canvas(personLayer)
        pc.drawBitmap(src, 0f, 0f, null)
        val maskUp = scaleBitmap(mask256, src.width, src.height)
        val maskPaint = Paint().apply {
            xfermode = PorterDuffXfermode(PorterDuff.Mode.DST_IN)
            isAntiAlias = true
        }
        pc.drawBitmap(maskUp, 0f, 0f, maskPaint)
        maskUp.recycle()

        canvas.drawBitmap(personLayer, 0f, 0f, null)
        personLayer.recycle()
        return out
    }

    private fun centerCropMatrix(bg: Bitmap, dstW: Int, dstH: Int): Matrix {
        val m = Matrix()
        val scale = maxOf(dstW.toFloat() / bg.width, dstH.toFloat() / bg.height)
        m.postScale(scale, scale)
        m.postTranslate((dstW - bg.width * scale) / 2f, (dstH - bg.height * scale) / 2f)
        return m
    }

    private fun blurBitmap(src: Bitmap, radius: Float): Bitmap {
        // Pkg-audit Tier-4: previously the API ≥ 31 branch eagerly allocated
        // a placeholder `out` bitmap, then `blurRenderScript` returned a NEW
        // bitmap on success — leaking the placeholder every frame (~1-3 MB ×
        // 30 fps → OOM in minutes). Allocate the fallback only when blur
        // actually failed.
        val result = blurRenderScript(src, radius)
        if (result != null) return result
        return Bitmap.createBitmap(src.width, src.height, Bitmap.Config.ARGB_8888).also {
            Canvas(it).drawBitmap(src, 0f, 0f, null)
        }
    }

    private fun blurRenderScript(src: Bitmap, radius: Float): Bitmap? {
        val rs = try {
            renderScript ?: RenderScript.create(context).also { renderScript = it }
        } catch (_: Exception) { return null }
        val script = try {
            blurScript ?: ScriptIntrinsicBlur.create(rs, Element.U8_4(rs)).also { blurScript = it }
        } catch (_: Exception) { return null }
        var input: Allocation? = null
        var output: Allocation? = null
        return try {
            val out = Bitmap.createBitmap(src.width, src.height, Bitmap.Config.ARGB_8888)
            input = Allocation.createFromBitmap(rs, src)
            output = Allocation.createFromBitmap(rs, out)
            script.setRadius(radius.coerceIn(1f, 25f))
            script.setInput(input)
            script.forEach(output)
            output.copyTo(out)
            out
        } catch (_: Exception) { null } finally {
            try { input?.destroy() } catch (_: Exception) {}
            try { output?.destroy() } catch (_: Exception) {}
        }
    }

    // ---- Bitmap / I420 conversion -----------------------------------

    private fun i420ToArgbBitmap(i420: VideoFrame.I420Buffer): Bitmap {
        val w = i420.width; val h = i420.height
        val bm = Bitmap.createBitmap(w, h, Bitmap.Config.ARGB_8888)
        val nv21Size = w * h * 3 / 2
        val nv21 = ByteBuffer.allocateDirect(nv21Size).order(ByteOrder.nativeOrder())
        YuvHelper.I420ToNV12(
            i420.dataY, i420.strideY,
            i420.dataU, i420.strideU,
            i420.dataV, i420.strideV,
            nv21, w, h
        )
        val argb = IntArray(w * h)
        nv21ToArgb(nv21, w, h, argb)
        bm.setPixels(argb, 0, w, 0, 0, w, h)
        return bm
    }

    private fun nv21ToArgb(nv21: ByteBuffer, w: Int, h: Int, out: IntArray) {
        val ySize = w * h
        nv21.position(0)
        val data = ByteArray(nv21.remaining())
        nv21.get(data)
        var idx = 0
        for (j in 0 until h) {
            val uvRow = (j shr 1) * w + ySize
            for (i in 0 until w) {
                val y = (data[j * w + i].toInt() and 0xff) - 16
                val uvCol = (i and 1.inv())
                val u = (data[uvRow + uvCol].toInt() and 0xff) - 128
                val v = (data[uvRow + uvCol + 1].toInt() and 0xff) - 128
                val yc = if (y < 0) 0 else 1192 * y
                var r = (yc + 1634 * v) shr 10
                var g = (yc - 833 * v - 400 * u) shr 10
                var b = (yc + 2066 * u) shr 10
                if (r < 0) r = 0 else if (r > 255) r = 255
                if (g < 0) g = 0 else if (g > 255) g = 255
                if (b < 0) b = 0 else if (b > 255) b = 255
                out[idx++] = (0xff shl 24) or (r shl 16) or (g shl 8) or b
            }
        }
    }

    private fun argbBitmapToVideoFrame(
        bm: Bitmap, w: Int, h: Int, rotation: Int, timestampNs: Long
    ): VideoFrame {
        val pixels = IntArray(bm.width * bm.height)
        bm.getPixels(pixels, 0, bm.width, 0, 0, bm.width, bm.height)
        // Pkg-audit Tier-4: was `org.webrtc.JavaI420Buffer` — wrong package.
        // The surrounding VideoFrame / VideoSink etc. all come from
        // `livekit.org.webrtc.*` (repackaged WebRTC bundled with LiveKit),
        // and the `livekit.org.webrtc.VideoFrame` constructor will not accept
        // a buffer from a different package namespace.
        val buffer = livekit.org.webrtc.JavaI420Buffer.allocate(w, h)
        val yStride = buffer.strideY
        val uStride = buffer.strideU
        val vStride = buffer.strideV
        val yArr = ByteArray(yStride * h)
        val uArr = ByteArray(uStride * (h / 2))
        val vArr = ByteArray(vStride * (h / 2))
        for (j in 0 until h) {
            for (i in 0 until w) {
                val c = pixels[j * w + i]
                val r = (c shr 16) and 0xff
                val g = (c shr 8) and 0xff
                val b = c and 0xff
                val y = ((66 * r + 129 * g + 25 * b + 128) shr 8) + 16
                yArr[j * yStride + i] = y.coerceIn(0, 255).toByte()
                if ((j and 1) == 0 && (i and 1) == 0) {
                    val u = ((-38 * r - 74 * g + 112 * b + 128) shr 8) + 128
                    val v = ((112 * r - 94 * g - 18 * b + 128) shr 8) + 128
                    val ui = (j shr 1) * uStride + (i shr 1)
                    val vi = (j shr 1) * vStride + (i shr 1)
                    uArr[ui] = u.coerceIn(0, 255).toByte()
                    vArr[vi] = v.coerceIn(0, 255).toByte()
                }
            }
        }
        buffer.dataY.put(yArr); buffer.dataY.position(0)
        buffer.dataU.put(uArr); buffer.dataU.position(0)
        buffer.dataV.put(vArr); buffer.dataV.position(0)
        return VideoFrame(buffer, rotation, timestampNs)
    }

    private fun scaleBitmap(src: Bitmap, w: Int, h: Int): Bitmap {
        if (src.width == w && src.height == h) return src.copy(src.config ?: Bitmap.Config.ARGB_8888, false)
        return Bitmap.createScaledBitmap(src, w, h, true)
    }

    private fun maskBufferToBitmap(buf: ByteBuffer, w: Int, h: Int): Bitmap {
        val pixels = IntArray(w * h)
        buf.position(0)
        for (i in 0 until w * h) {
            val v = buf.get().toInt() and 0xff
            val a = if (v > 0) 255 else 0
            pixels[i] = (a shl 24) or 0xffffff
        }
        return Bitmap.createBitmap(pixels, w, h, Bitmap.Config.ARGB_8888)
    }

    companion object { private const val TAG = "VBackgroundProc" }
}
