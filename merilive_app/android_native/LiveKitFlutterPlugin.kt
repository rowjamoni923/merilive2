/**
 * LiveKitFlutterPlugin.kt — Flutter host of the native LiveKit renderer.
 *
 * Mirrors android-setup/plugins/LiveKitNativePlugin.kt (Capacitor) so Flutter
 * screens hit the exact same code path as the web build: 1080p publish lock,
 * SCALE_ASPECT_FILL, hardware zoom clamp, transparent surface behind Flutter.
 *
 * Destination: android/app/src/main/kotlin/com/merilive/app/plugins/
 * MethodChannel: "app.merilive/livekit" (must match LiveKitBridge in Dart).
 *
 * This file is intentionally kept minimal — the heavy lifting (room events,
 * subscribe/publish, renderer attach) lives in the shared implementation the
 * Capacitor plugin already ships. When the Android host is scaffolded via
 * `flutter create`, port the private helpers from LiveKitNativePlugin.kt
 * (initialize/connect/attach/setMirror/setScalingType/disconnect/getStatus,
 * startLocalPreview/stopLocalPreview) into the matching methods below.
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

        @JvmStatic
        fun register(engine: FlutterEngine, activity: Activity) {
            val channel = MethodChannel(engine.dartExecutor.binaryMessenger, CHANNEL)
            channel.setMethodCallHandler(LiveKitFlutterPlugin(activity))
            Log.i(TAG, "LiveKitFlutterPlugin registered on $CHANNEL")
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
            "setScalingType" -> ok(result, mapOf("success" to true, "mode" to "fill"))
            "setVideoVisible" -> ok(result, mapOf("success" to true))
            "getStatus" -> ok(result, mapOf("connected" to false))
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
        //  - Attach to SurfaceViewRenderer inside videoContainer
        //  - Enforce 1080p sensor + SCALE_ASPECT_FILL
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
        ok(result, mapOf("success" to true, "pending" to true))
    }

    private fun disconnect(result: MethodChannel.Result) {
        ok(result, mapOf("success" to true))
    }

    private fun ok(result: MethodChannel.Result, payload: Map<String, Any?>) {
        result.success(payload)
    }
}
