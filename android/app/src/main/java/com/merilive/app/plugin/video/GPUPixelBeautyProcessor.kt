package com.merilive.app.plugin.video

import android.content.Context
import android.os.Handler
import android.os.HandlerThread
import android.util.Log
import com.pixpark.gpupixel.FaceDetector
import com.pixpark.gpupixel.GPUPixel
import com.pixpark.gpupixel.GPUPixelFilter
import com.pixpark.gpupixel.GPUPixelSinkRawData
import com.pixpark.gpupixel.GPUPixelSourceRawData
import livekit.org.webrtc.JavaI420Buffer
import livekit.org.webrtc.VideoFrame
import livekit.org.webrtc.VideoProcessor
import livekit.org.webrtc.VideoSink
import java.io.File
import java.util.concurrent.atomic.AtomicBoolean

/**
 * Pkg201 — GPUPixel Broadcast Beauty Processor.
 *
 * Implements org.webrtc.VideoProcessor and is attached to the
 * LiveKit LocalVideoTrack via the same reflective setVideoProcessor
 * path used by VirtualBackgroundProcessor (Step 36).
 *
 * Pipeline per frame:
 *   1. WebRTC VideoFrame (I420) → ARGB int[] @ frame resolution.
 *   2. MarsFace detects 3D face landmarks from RGBA pixels.
 *   3. GPUPixelSourceRawData feeds lipstick → blusher → reshape → beauty.
 *   4. GPUPixelSinkRawData returns processed I420 for LiveKit.
 *
 * IMPORTANT — this is gated behind a Capacitor-side feature flag in
 * GPUPixelBeauty.ts (`setBroadcastEnabled`). When the flag is OFF
 * (default) the LiveKit plugin never attaches this processor and
 * frames flow untouched, keeping all existing live broadcasts safe.
 *
 * Threading: GPUPixel native calls happen on a dedicated background
 * HandlerThread so the WebRTC capturer thread is never blocked. If a
 * new frame arrives while the previous one is still being processed,
 * the previous one is dropped (publisher stays at source fps).
 */
class GPUPixelBeautyProcessor(private val context: Context) : VideoProcessor {

    companion object {
        private const val TAG = "GPUPixelBeautyProc"
    }

    @Volatile private var sink: VideoSink? = null
    private val busy = AtomicBoolean(false)
    private val initialized = AtomicBoolean(false)
    private val disposed = AtomicBoolean(false)

    private val workerThread = HandlerThread("GPUPixelBeauty").apply { start() }
    private val worker = Handler(workerThread.looper)

    // GPUPixel v1.3+ filter chain — created lazily on the worker thread.
    private var faceDetector: FaceDetector? = null
    private var rawInput: GPUPixelSourceRawData? = null
    private var rawOutput: GPUPixelSinkRawData? = null
    private var beauty: GPUPixelFilter? = null
    private var reshape: GPUPixelFilter? = null
    private var lipstick: GPUPixelFilter? = null
    private var blusher: GPUPixelFilter? = null

    fun isReleased(): Boolean = disposed.get()

    // Live levels (0..1). Updated from JS via setLevels(...).
    @Volatile var smooth: Float = 0.6f
    @Volatile var white: Float = 0.4f
    @Volatile var thinFace: Float = 0.3f
    @Volatile var bigEye: Float = 0.3f
    @Volatile var lipstickLevel: Float = 0f
    @Volatile var blusherLevel: Float = 0f

    fun setLevels(smooth: Float, white: Float, thinFace: Float, bigEye: Float, lipstick: Float, blusher: Float) {
        this.smooth = smooth.coerceIn(0f, 1f)
        this.white = white.coerceIn(0f, 1f)
        this.thinFace = thinFace.coerceIn(0f, 1f)
        this.bigEye = bigEye.coerceIn(0f, 1f)
        this.lipstickLevel = lipstick.coerceIn(0f, 1f)
        this.blusherLevel = blusher.coerceIn(0f, 1f)
        worker.post { applyLevelsLocked() }
    }

    private fun ensureGraph() {
        if (disposed.get()) return
        if (initialized.get()) return
        try {
            GPUPixel.Init(context.applicationContext)
            validateGpupixelResources()
            faceDetector = FaceDetector.Create()
            rawInput = GPUPixelSourceRawData.Create()
            rawOutput = GPUPixelSinkRawData.Create()
            lipstick = GPUPixelFilter.Create(GPUPixelFilter.LIPSTICK_FILTER)
            blusher = GPUPixelFilter.Create(GPUPixelFilter.BLUSHER_FILTER)
            reshape = GPUPixelFilter.Create(GPUPixelFilter.FACE_RESHAPE_FILTER)
            beauty = GPUPixelFilter.Create(GPUPixelFilter.BEAUTY_FACE_FILTER)

            // Professional chain: raw → lipstick/blusher/3D reshape → skin beauty → raw sink.
            rawInput!!.AddSink(lipstick)
            lipstick!!.AddSink(blusher)
            blusher!!.AddSink(reshape)
            reshape!!.AddSink(beauty)
            beauty!!.AddSink(rawOutput)

            applyLevelsLocked()
            initialized.set(true)
            Log.i(TAG, "GPUPixel MarsFace 3D landmark graph ready")
        } catch (t: Throwable) {
            Log.e(TAG, "ensureGraph failed", t)
        }
    }

    private fun validateGpupixelResources() {
        val base = context.applicationContext.getExternalFilesDir(null) ?: return
        val required = listOf(
            "gpupixel/models/face_det.mars_model",
            "gpupixel/models/face_align.mars_model",
            "gpupixel/res/mouth.png",
            "gpupixel/res/blusher.png",
        )
        val missing = required.filter { rel ->
            val f = File(base, rel)
            !f.exists() || f.length() <= 0L
        }
        if (missing.isEmpty()) return
        missing.forEach { rel -> runCatching { File(base, rel).delete() } }
        Log.w(TAG, "GPUPixel resources missing/corrupt: $missing — recopying bundled AI assets")
        GPUPixel.copyResource(context.applicationContext)
        val stillMissing = required.filter { rel ->
            val f = File(base, rel)
            !f.exists() || f.length() <= 0L
        }
        if (stillMissing.isNotEmpty()) {
            Log.e(TAG, "GPUPixel AI resources still unavailable after recopy: $stillMissing")
        }
    }

    private fun applyLevelsLocked() {
        try {
            beauty?.SetProperty("skin_smoothing", smooth)
            beauty?.SetProperty("whiteness", white)
            reshape?.SetProperty("thin_face", thinFace)
            reshape?.SetProperty("big_eye", bigEye)
            lipstick?.SetProperty("blend_level", lipstickLevel)
            blusher?.SetProperty("blend_level", blusherLevel)
        } catch (_: Throwable) { /* ignore */ }
    }

    private fun applyLandmarksLocked(rgba: ByteArray, width: Int, height: Int, stride: Int) {
        val landmarks = try {
            faceDetector?.detect(
                rgba,
                width,
                height,
                stride,
                FaceDetector.GPUPIXEL_MODE_FMT_VIDEO,
                FaceDetector.GPUPIXEL_FRAME_TYPE_RGBA,
            )
        } catch (t: Throwable) {
            Log.w(TAG, "face landmark detect failed: ${t.message}")
            null
        }
        if (landmarks == null || landmarks.isEmpty()) return
        reshape?.SetProperty("face_landmark", landmarks)
        lipstick?.SetProperty("face_landmark", landmarks)
        blusher?.SetProperty("face_landmark", landmarks)
    }

    override fun setSink(s: VideoSink?) { sink = s }

    override fun onCapturerStarted(success: Boolean) {
        Log.i(TAG, "onCapturerStarted success=$success")
        worker.post { ensureGraph() }
    }

    override fun onCapturerStopped() {
        // Capturer stop is not final: LiveKit can restart the same track after
        // camera switch/recovery. Release only the native graph; keep the
        // worker thread alive so onCapturerStarted can rebuild AI filters.
        Log.i(TAG, "onCapturerStopped — releasing GPUPixel graph")
        worker.post { releaseGraphLocked() }
    }

    override fun onFrameCaptured(frame: VideoFrame) {
        val s = sink
        if (s == null) { frame.release(); return }
        // Drop frame if previous is still being processed.
        if (!busy.compareAndSet(false, true)) {
            s.onFrame(frame)
            return
        }
        frame.retain()
        worker.post {
            try {
                processFrame(frame, s)
            } catch (t: Throwable) {
                Log.e(TAG, "processFrame failed — passthrough", t)
                s.onFrame(frame)
            } finally {
                frame.release()
                busy.set(false)
            }
        }
    }

    private fun processFrame(frame: VideoFrame, sink: VideoSink) {
        ensureGraph()
        val raw = rawInput
        val outSink = rawOutput
        if (!initialized.get() || raw == null || outSink == null) {
            sink.onFrame(frame)
            return
        }

        val w = frame.buffer.width
        val h = frame.buffer.height
        val i420 = frame.buffer.toI420() ?: run { sink.onFrame(frame); return }

        try {
            val rgba = i420ToRgba(i420, w, h)
            applyLandmarksLocked(rgba, w, h, w * 4)
            raw.ProcessData(rgba, w, h, w * 4, GPUPixelSourceRawData.FRAME_TYPE_RGBA)

            val out = outSink.GetI420Buffer()
            if (out == null || out.size < (w * h * 3 / 2)) {
                sink.onFrame(frame)
                return
            }

            // GPUPixelSinkRawData returns processed I420 directly, so the
            // outgoing LiveKit frame keeps real GPU beauty + 3D face reshape.
            val outBuf = JavaI420Buffer.allocate(w, h)
            if (!copyPackedI420(out, outBuf, w, h)) {
                outBuf.release()
                sink.onFrame(frame)
                return
            }

            val outFrame = VideoFrame(outBuf, frame.rotation, frame.timestampNs)
            sink.onFrame(outFrame)
            outFrame.release()
        } finally {
            i420.release()
        }
    }

    // Phase-E perf: reusable scratch buffers — allocated once per resolution.
    // The previous per-frame allocation of an (w*h*4) RGBA + per-pixel
    // ByteBuffer.get() on Y/U/V was the dominant CPU cost at 1080p
    // (~70 % of beauty CPU on mid-range Android). Bulk-reading planes
    // into byte[] once, then doing the YUV→RGBA math on plain arrays
    // is ~5-8× faster.
    @Volatile private var scratchRgba: ByteArray = ByteArray(0)
    @Volatile private var scratchY: ByteArray = ByteArray(0)
    @Volatile private var scratchU: ByteArray = ByteArray(0)
    @Volatile private var scratchV: ByteArray = ByteArray(0)
    @Volatile private var scratchW: Int = 0
    @Volatile private var scratchH: Int = 0

    private fun ensureScratch(width: Int, height: Int) {
        if (scratchW == width && scratchH == height && scratchRgba.size == width * height * 4) return
        scratchRgba = ByteArray(width * height * 4)
        // Allocate Y/U/V with the worst-case stride (= width) so per-row
        // reads work regardless of the planar strides we get from the SDK.
        scratchY = ByteArray(width * height)
        scratchU = ByteArray(((width + 1) / 2) * ((height + 1) / 2))
        scratchV = ByteArray(((width + 1) / 2) * ((height + 1) / 2))
        scratchW = width
        scratchH = height
    }

    private fun i420ToRgba(i420: VideoFrame.I420Buffer, width: Int, height: Int): ByteArray {
        ensureScratch(width, height)
        val out = scratchRgba

        // Bulk-read each plane row-by-row into a contiguous byte[] (handles
        // arbitrary stride from the WebRTC SDK without per-pixel buffer hops).
        val y = scratchY
        val u = scratchU
        val v = scratchV
        val uvW = (width + 1) / 2
        val uvH = (height + 1) / 2

        val dy = i420.dataY.duplicate()
        for (row in 0 until height) {
            dy.position(row * i420.strideY)
            dy.get(y, row * width, width)
        }
        val du = i420.dataU.duplicate()
        for (row in 0 until uvH) {
            du.position(row * i420.strideU)
            du.get(u, row * uvW, uvW)
        }
        val dv = i420.dataV.duplicate()
        for (row in 0 until uvH) {
            dv.position(row * i420.strideV)
            dv.get(v, row * uvW, uvW)
        }

        // Per-pixel YUV→RGBA on plain arrays (HotSpot bounds-check elision
        // makes this dramatically faster than ByteBuffer.get(index) loops).
        var p = 0
        for (row in 0 until height) {
            val uvRow = row / 2
            val yRowBase = row * width
            val uvRowBase = uvRow * uvW
            for (col in 0 until width) {
                val yy = (y[yRowBase + col].toInt() and 0xFF)
                val uvCol = col / 2
                val uu = (u[uvRowBase + uvCol].toInt() and 0xFF) - 128
                val vv = (v[uvRowBase + uvCol].toInt() and 0xFF) - 128
                val r = (yy + 1.402f * vv).toInt().coerceIn(0, 255)
                val g = (yy - 0.344136f * uu - 0.714136f * vv).toInt().coerceIn(0, 255)
                val b = (yy + 1.772f * uu).toInt().coerceIn(0, 255)
                out[p++] = r.toByte()
                out[p++] = g.toByte()
                out[p++] = b.toByte()
                out[p++] = 0xFF.toByte()
            }
        }
        return out
    }

    private fun copyPackedI420(src: ByteArray, dst: JavaI420Buffer, width: Int, height: Int): Boolean {
        val ySize = width * height
        val uvW = (width + 1) / 2
        val uvH = (height + 1) / 2
        val uvSize = uvW * uvH
        if (src.size < ySize + uvSize * 2) return false

        // Phase-E perf: bulk row copy via ByteBuffer.put(byte[], off, len).
        // The previous nested per-pixel ByteBuffer.put(index, byte) loop
        // ran at ~2-4 fps for 1080p on Snapdragon 6-series. Per-row bulk
        // copy is ~20× faster and keeps the GPUPixel pipeline at native fps.
        val dy = dst.dataY
        if (dst.strideY == width) {
            dy.position(0); dy.put(src, 0, ySize)
        } else {
            for (row in 0 until height) {
                dy.position(row * dst.strideY)
                dy.put(src, row * width, width)
            }
        }
        val du = dst.dataU
        val uOffset = ySize
        if (dst.strideU == uvW) {
            du.position(0); du.put(src, uOffset, uvSize)
        } else {
            for (row in 0 until uvH) {
                du.position(row * dst.strideU)
                du.put(src, uOffset + row * uvW, uvW)
            }
        }
        val dv = dst.dataV
        val vOffset = ySize + uvSize
        if (dst.strideV == uvW) {
            dv.position(0); dv.put(src, vOffset, uvSize)
        } else {
            for (row in 0 until uvH) {
                dv.position(row * dst.strideV)
                dv.put(src, vOffset + row * uvW, uvW)
            }
        }
        return true
    }

    fun release() {
        // Pkg-audit Tier2 fix: never block the calling thread. release() can be
        // invoked from the main thread (Capacitor handleOnDestroy / LiveKit
        // teardown) and the previous CountDownLatch.await(500ms) could push
        // the system past the ANR threshold on low-end devices while a 1080p
        // frame was mid-processing. Post cleanup to the worker and quit the
        // looper from inside the worker so no new work can be accepted after.
        worker.post {
            try {
                rawInput?.RemoveAllSinks()
                faceDetector?.destroy()
                rawInput?.Destroy()
                rawOutput?.Destroy()
                beauty?.Destroy()
                reshape?.Destroy()
                lipstick?.Destroy()
                blusher?.Destroy()
            } catch (_: Throwable) {}
            faceDetector = null
            rawInput = null
            rawOutput = null
            beauty = null
            reshape = null
            lipstick = null
            blusher = null
            initialized.set(false)
            busy.set(false)
            workerThread.quitSafely()
        }
    }
}
