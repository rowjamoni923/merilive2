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
import org.webrtc.JavaI420Buffer
import org.webrtc.VideoFrame
import org.webrtc.VideoProcessor
import org.webrtc.VideoSink
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
 *   2. GPUPixelSourceRawInput.uploadBytes(...) into the GPU filter
 *      chain (beauty → reshape → lipstick).
 *   3. source.captureAProcessedFrameData(lastFilter, cb) returns
 *      processed RGBA bytes.
 *   4. Convert back to I420, emit as new VideoFrame to LiveKit sink.
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
        if (initialized.get()) return
        try {
            GPUPixel.Init(context.applicationContext)
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
        Log.i(TAG, "onCapturerStopped")
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

    private fun i420ToRgba(i420: VideoFrame.I420Buffer, width: Int, height: Int): ByteArray {
        val out = ByteArray(width * height * 4)
        var p = 0
        for (y in 0 until height) {
            val yRow = y * i420.strideY
            val uvRow = (y / 2)
            for (x in 0 until width) {
                val yy = (i420.dataY.get(yRow + x).toInt() and 0xFF)
                val uu = (i420.dataU.get(uvRow * i420.strideU + x / 2).toInt() and 0xFF) - 128
                val vv = (i420.dataV.get(uvRow * i420.strideV + x / 2).toInt() and 0xFF) - 128
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

        for (row in 0 until height) {
            for (col in 0 until width) {
                dst.dataY.put(row * dst.strideY + col, src[row * width + col])
            }
        }
        var uOffset = ySize
        var vOffset = ySize + uvSize
        for (row in 0 until uvH) {
            for (col in 0 until uvW) {
                dst.dataU.put(row * dst.strideU + col, src[uOffset++])
                dst.dataV.put(row * dst.strideV + col, src[vOffset++])
            }
        }
        return true
    }

    fun release() {
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
        }
        workerThread.quitSafely()
    }
}
