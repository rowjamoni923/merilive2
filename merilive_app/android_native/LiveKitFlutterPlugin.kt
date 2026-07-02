/**
 * LiveKitFlutterPlugin.kt — Flutter host of the native LiveKit renderer.
 *
 * Mirrors android-setup/plugins/LiveKitNativePlugin.kt (Capacitor) so Flutter
 * screens hit the exact same code path as the web build: 1440×1920 sensor
 * capture, 6.5 Mbps base layer, 3-layer simulcast, SCALE_ASPECT_FILL,
 * hardware zoom clamp, transparent surface behind Flutter, zero-black-frame
 * prejoin → broadcast handoff, camera flip without republish flicker.
 *
 * Destination: android/app/src/main/kotlin/com/merilive/app/plugins/
 * MethodChannel: "app.merilive/livekit" (must match LiveKitBridge in Dart).
 *
 * ════════════════════════════════════════════════════════════════════════
 * M6 — PUBLISH LOCK CONSTANTS (match src/lib/livekitPublishLock.ts EXACTLY)
 * ════════════════════════════════════════════════════════════════════════
 *
 *   LOCK_CAPTURE_WIDTH  = 1440
 *   LOCK_CAPTURE_HEIGHT = 1920
 *   LOCK_CAPTURE_FPS    = 30
 *   LOCK_MAX_BITRATE    = 6_500_000
 *   LOCK_MAX_FPS        = 30
 *   LOCK_SIMULCAST      = true   (3 layers: 1440, 720, 540)
 *
 * When you change a number in livekitPublishLock.ts, change the matching
 * LOCK_* below IN THE SAME COMMIT and rebuild the APK. Mismatched values
 * cause sender/receiver drift and visible pumping. Base layer must NEVER
 * be silently down-tuned by the SDK — adaptation happens VIEWER-side via
 * simulcast layer switching only.
 *
 * ════════════════════════════════════════════════════════════════════════
 * Scaffold status
 * ════════════════════════════════════════════════════════════════════════
 * This file is intentionally kept minimal — the heavy lifting (room events,
 * subscribe/publish, renderer attach) lives in the shared implementation the
 * Capacitor plugin already ships. When the Android host is scaffolded via
 * `flutter create`, port the private helpers from LiveKitNativePlugin.kt
 * (initialize/connect/attach/setMirror/setScalingType/disconnect/getStatus,
 * startLocalPreview/stopLocalPreview, setMicEnabled/switchCamera/
 * setBeautyEnabled/getStats) into the matching methods below. Do NOT
 * re-derive encoder settings — always read LOCK_* from the companion.
 */
package com.merilive.app.plugins

import android.app.Activity
import android.graphics.Color
import android.util.Log
import android.view.View
import android.view.ViewGroup
import android.widget.FrameLayout
import io.flutter.embedding.engine.FlutterEngine
import io.flutter.plugin.common.MethodCall
import io.flutter.plugin.common.MethodChannel

class LiveKitFlutterPlugin private constructor(
    private val activity: Activity,
) : MethodChannel.MethodCallHandler {

    companion object {
        private const val TAG = "MeriLive_LiveKitFlutter"
        private const val CHANNEL = "app.merilive/livekit"

        // ── M6 publish lock (mirror src/lib/livekitPublishLock.ts) ──────
        const val LOCK_CAPTURE_WIDTH = 1440
        const val LOCK_CAPTURE_HEIGHT = 1920
        const val LOCK_CAPTURE_FPS = 30
        const val LOCK_MAX_BITRATE = 6_500_000
        const val LOCK_MAX_FPS = 30
        const val LOCK_SIMULCAST = true
        // Simulcast relays: base 1440×1920 @ 6.5 Mbps, mid 720p @ 2.8 Mbps,
        // low 540p @ 900 kbps. Layers configured at publish time in the
        // ported connect() body; do not override viewer adaptive stream.

        @JvmStatic
        fun register(engine: FlutterEngine, activity: Activity) {
            val channel = MethodChannel(engine.dartExecutor.binaryMessenger, CHANNEL)
            channel.setMethodCallHandler(LiveKitFlutterPlugin(activity))
            Log.i(
                TAG,
                "LiveKitFlutterPlugin registered on $CHANNEL " +
                    "(lock ${LOCK_CAPTURE_WIDTH}x${LOCK_CAPTURE_HEIGHT}@${LOCK_MAX_FPS} " +
                    "${LOCK_MAX_BITRATE / 1000}kbps simulcast=$LOCK_SIMULCAST)"
            )
        }
    }

    private var videoContainer: FrameLayout? = null

    override fun onMethodCall(call: MethodCall, result: MethodChannel.Result) {
        when (call.method) {
            "initialize" -> initialize(result)
            "startLocalPreview" -> startLocalPreview(call.argument("front") ?: true, result)
            "stopLocalPreview" -> stopLocalPreview(result)
            "connect" -> connect(
                call.argument("wsUrl") ?: "",
                call.argument("token") ?: "",
                call.argument("publishVideo") ?: false,
                call.argument("publishAudio") ?: false,
                result,
            )
            "disconnect" -> disconnect(result)
            "attachLocal" -> ok(result, mapOf("attached" to false, "reason" to "port_pending"))
            "detachLocal" -> ok(result, mapOf("success" to true))
            "setMirror" -> ok(result, mapOf("success" to true))
            "setScalingType" -> ok(
                result,
                mapOf("success" to true, "mode" to (call.argument<String>("mode") ?: "fill"))
            )
            "setVideoVisible" -> ok(result, mapOf("success" to true))
            "getStatus" -> ok(result, mapOf("connected" to false))

            // ── M5/M6 — HUD + camera controls ────────────────────────────
            "setMicEnabled" -> ok(
                result,
                mapOf("success" to true, "enabled" to (call.argument<Boolean>("enabled") ?: true))
            )
            "switchCamera" -> ok(
                // Port must reuse the existing capturer — DO NOT republish
                // or the base layer will drop to 0 kbps for ~600ms.
                result,
                mapOf("success" to true, "flipped" to true)
            )
            "setBeautyEnabled" -> ok(
                result,
                mapOf("success" to true, "enabled" to (call.argument<Boolean>("enabled") ?: true))
            )
            "getStats" -> ok(result, mapOf("success" to false, "reason" to "unimplemented"))

            else -> result.notImplemented()
        }
    }

    // ─── Placeholders (port body from LiveKitNativePlugin.kt) ───────────

    private fun initialize(result: MethodChannel.Result) {
        activity.runOnUiThread {
            if (videoContainer == null) {
                videoContainer = FrameLayout(activity).apply {
                    layoutParams = FrameLayout.LayoutParams(
                        ViewGroup.LayoutParams.MATCH_PARENT,
                        ViewGroup.LayoutParams.MATCH_PARENT,
                    )
                    setBackgroundColor(Color.BLACK)
                    visibility = View.GONE
                }
                val root = activity.findViewById<ViewGroup>(android.R.id.content)
                root.addView(videoContainer, 0)
            }
            ok(result, mapOf("success" to true, "message" to "surface_ready"))
        }
    }

    private fun startLocalPreview(front: Boolean, result: MethodChannel.Result) {
        // TODO: port body from LiveKitNativePlugin.startLocalPreview
        //  - LiveKit.create() standalone Room
        //  - CameraCapturer(front) with hardware minZoomRatio
        //    (Camera2 CONTROL_ZOOM_RATIO clamp — no digital zoom)
        //  - Enforce LOCK_CAPTURE_WIDTH × LOCK_CAPTURE_HEIGHT sensor mode
        //  - Attach to SurfaceViewRenderer inside videoContainer
        //  - SCALE_ASPECT_FILL (no letterbox)
        //  - Reused across GoLive → LiveStream handoff = zero black frame
        ok(result, mapOf("success" to true, "pending" to true, "front" to front))
    }

    private fun stopLocalPreview(result: MethodChannel.Result) {
        ok(result, mapOf("success" to true))
    }

    private fun connect(
        wsUrl: String,
        token: String,
        publishVideo: Boolean,
        publishAudio: Boolean,
        result: MethodChannel.Result,
    ) {
        if (wsUrl.isEmpty() || token.isEmpty()) {
            result.error("bad_args", "wsUrl and token required", null); return
        }
        // TODO: port body from LiveKitNativePlugin.connect
        //  - Reuse the CameraCapturer created in startLocalPreview
        //    (do NOT re-open the sensor — that flashes a black frame)
        //  - VideoTrackPublishOptions with:
        //        videoEncoding = VideoEncoding(LOCK_MAX_BITRATE, LOCK_MAX_FPS)
        //        simulcast     = LOCK_SIMULCAST
        //        videoCodec    = VP8   (Chamet/Bigo parity — H.264 fallback)
        //  - Publish base + 720p + 540p simulcast layers
        //  - Enable adaptiveStream + dynacast on VIEWER-side rooms only
        ok(result, mapOf("success" to true, "pending" to true))
    }

    private fun disconnect(result: MethodChannel.Result) {
        ok(result, mapOf("success" to true))
    }

    private fun ok(result: MethodChannel.Result, payload: Map<String, Any?>) {
        result.success(payload)
    }
}
