package com.merilive.app.rtc

/**
 * Phase 2B — Centralized permission helper.
 *
 * Single source of truth for "which routes have the native LiveKit
 * engine as the canonical camera/mic owner". Used by
 * [WebViewPermissionGate] to decide whether to deny WebView
 * `getUserMedia` requests (which otherwise trigger the Chamet-class
 * Android-16 permission loop).
 *
 * Keep the substring list aligned with the React router tree.
 */
object PermissionHelper {
    private val NATIVE_MEDIA_ROUTE_SUBSTRINGS = listOf(
        "/live",            // matches /live, /live-stream, /live-feed
        "/go-live",
        "/golive",
        "/private-call",
        "/privatecall",
        "/call/",
        "/party",           // matches /party-room, /parties, /create-party, /game-party
        "/stream",          // matches /livestream, /obsstreamsetup
        "/face-verification",
    )

    /**
     * True when the URL's path segment matches a route where the native
     * LiveKit / NativeCamera plugins own the physical camera. WebView
     * `getUserMedia` on these routes is a regression — deny it.
     */
    fun isNativeOwnedMediaRoute(url: String?): Boolean {
        if (url.isNullOrBlank()) return false
        val lower = url.lowercase()
        return NATIVE_MEDIA_ROUTE_SUBSTRINGS.any { lower.contains(it) }
    }
}
