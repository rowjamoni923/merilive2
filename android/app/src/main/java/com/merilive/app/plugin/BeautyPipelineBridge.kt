package com.merilive.app.plugin

import android.util.Log
import java.util.concurrent.atomic.AtomicBoolean

/**
 * Step 21 — Beauty Pipeline Bridge (DeepAR ↔ LiveKit).
 *
 * Singleton coordinator that arbitrates physical-camera ownership between
 * the LiveKit native publisher and the DeepAR beauty/AR pipeline. Only one
 * component may hold the Camera2 device at a time; this bridge is the
 * single source of truth for which is currently active.
 *
 * Lifecycle (driven from JS via NativeLiveKit + DeepAR plugins):
 *
 *   1. Beauty OFF (default):
 *      LiveKit owns the camera and publishes the raw 1080p capture.
 *
 *   2. JS calls NativeLiveKit.setBeautyPipelineEnabled({ enabled: true }):
 *      → LiveKitPlugin.setCameraEnabled(false) — releases camera.
 *      → BeautyPipelineBridge.setEnabled(true) — flips state flag.
 *      → JS calls DeepAR.startCamera() — DeepAR opens camera, runs GL
 *        beauty effects, and pushes processed NV21 frames into the bridge
 *        via pushProcessedFrame(...).
 *      → LiveKit's external VideoCapturer (registered when bridge is
 *        enabled) pulls those frames and publishes them as the broadcast
 *        video track. Viewers see the beauty-processed stream.
 *
 *   3. JS calls NativeLiveKit.setBeautyPipelineEnabled({ enabled: false }):
 *      → BeautyPipelineBridge.setEnabled(false) — drains pending frames.
 *      → JS calls DeepAR.stopCamera() — DeepAR releases camera.
 *      → LiveKitPlugin re-enables its own camera track — direct capture
 *        resumes.
 *
 * The bridge intentionally exposes a tiny surface so each plugin stays
 * decoupled. Frame-format negotiation (NV21 / GL texture id / timestamp)
 * is handled by the optional FrameSink registered by LiveKit's custom
 * capturer when present. When no sink is registered the pushed frames are
 * dropped — DeepAR continues running for preview only and viewers see the
 * raw LiveKit camera, which is the safe fallback.
 */
object BeautyPipelineBridge {
    private const val TAG = "BeautyPipelineBridge"

    /** True when beauty pipeline currently owns the camera. */
    private val enabled = AtomicBoolean(false)

    /** Optional frame consumer registered by LiveKit's external capturer. */
    @Volatile
    private var sink: FrameSink? = null

    fun isEnabled(): Boolean = enabled.get()

    fun setEnabled(value: Boolean) {
        val previous = enabled.getAndSet(value)
        if (previous != value) {
            Log.i(TAG, "Beauty pipeline → ${if (value) "ENABLED" else "DISABLED"}")
            if (!value) sink?.onPipelineStopped()
        }
    }

    /** Called by LiveKit's external capturer when it's ready to receive frames. */
    fun registerSink(s: FrameSink?) {
        sink = s
        Log.i(TAG, "Frame sink ${if (s != null) "registered" else "cleared"}")
    }

    /**
     * Called by DeepARPlugin every time a beauty-processed frame is ready.
     *
     * @param nv21        raw NV21 byte buffer (camera-native format)
     * @param width       frame width in pixels
     * @param height      frame height in pixels
     * @param rotationDeg device-relative rotation (0/90/180/270)
     * @param timestampNs monotonic capture timestamp in nanoseconds
     */
    fun pushProcessedFrame(
        nv21: ByteArray,
        width: Int,
        height: Int,
        rotationDeg: Int,
        timestampNs: Long,
    ) {
        if (!enabled.get()) return
        val s = sink ?: return
        try {
            s.onProcessedFrame(nv21, width, height, rotationDeg, timestampNs)
        } catch (e: Exception) {
            Log.e(TAG, "sink.onProcessedFrame failed", e)
        }
    }

    /** Frame consumer contract — implemented by LiveKit's custom capturer. */
    interface FrameSink {
        fun onProcessedFrame(
            nv21: ByteArray,
            width: Int,
            height: Int,
            rotationDeg: Int,
            timestampNs: Long,
        )
        fun onPipelineStopped() {}
    }
}
