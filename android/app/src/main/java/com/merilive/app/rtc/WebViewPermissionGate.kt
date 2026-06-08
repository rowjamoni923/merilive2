package com.merilive.app.rtc

import android.util.Log
import android.webkit.PermissionRequest
import com.getcapacitor.Bridge
import com.getcapacitor.BridgeWebChromeClient
import com.merilive.app.plugin.CameraOwnership

/**
 * Phase 2B — WebView permission gate.
 *
 * Chamet-class bug (documented at bittopup.com Dec 2025 for Android 16):
 * when the React app sits on a live / private-call / party route, any
 * stray `getUserMedia()` call inside the WebView (analytics ping, third-
 * party `<iframe>`, mis-firing legacy hook) triggers the WebChromeClient
 * permission request flow. On Android 16 this races with the native
 * Camera2 owner (LiveKitPlugin) and deadlocks Camera2 in a permission
 * loop until the app is force-stopped.
 *
 * Fix: subclass Capacitor's [BridgeWebChromeClient] and short-circuit
 * the request:
 *   1. If the request targets `VIDEO_CAPTURE` / `AUDIO_CAPTURE` AND
 *      the current page is a native-owned media route AND the native
 *      side already holds the camera → `request.deny()`.
 *   2. Everything else (notifications, geolocation, mic on non-call
 *      routes, etc.) → delegate to super so Capacitor's default path
 *      handles it.
 *
 * Safe on Android < 16 — `deny()` is a documented public API since
 * API 21 and simply prevents the WebView from opening media devices it
 * was never supposed to own in our architecture.
 */
class WebViewPermissionGate(bridge: Bridge) : BridgeWebChromeClient(bridge) {
    companion object {
        private const val TAG = "WebViewPermGate"
    }

    private val bridgeRef = bridge

    override fun onPermissionRequest(request: PermissionRequest) {
        val resources = request.resources ?: emptyArray()
        val needsCamera = resources.any { it == PermissionRequest.RESOURCE_VIDEO_CAPTURE }
        val needsMic    = resources.any { it == PermissionRequest.RESOURCE_AUDIO_CAPTURE }

        if (!needsCamera && !needsMic) {
            super.onPermissionRequest(request)
            return
        }

        val url = try { bridgeRef.webView?.url } catch (_: Throwable) { null }
        val nativeRoute = PermissionHelper.isNativeOwnedMediaRoute(url)
        val nativeHoldsCamera = CameraOwnership.owner() == CameraOwnership.OWNER_LIVEKIT ||
            CameraOwnership.owner() == CameraOwnership.OWNER_NATIVE_CAMERA

        if (nativeRoute && nativeHoldsCamera) {
            Log.w(
                TAG,
                "DENY WebView getUserMedia on native-owned route — url=$url owner=${CameraOwnership.owner()} " +
                    "resources=${resources.joinToString()} (Chamet/Android-16 perm-loop guard)",
            )
            try { request.deny() } catch (e: Exception) {
                Log.w(TAG, "request.deny() threw: ${e.message}")
            }
            return
        }

        // Non-media-route OR native side is not holding the hardware
        // (e.g. user explicitly on a WebView-fallback screen). Let
        // Capacitor's default flow handle the prompt.
        super.onPermissionRequest(request)
    }
}
