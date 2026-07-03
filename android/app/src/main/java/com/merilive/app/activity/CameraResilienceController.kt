package com.merilive.app.activity

import android.app.Activity
import android.view.View
import android.widget.Button
import android.widget.ImageView
import android.widget.LinearLayout
import android.widget.TextView
import org.webrtc.SurfaceViewRenderer

/**
 * CameraResilienceController — STUB (2026-06-14 rebuild).
 *
 * The original resilience layer (freeze detection, auto-retry, banner
 * UI orchestration) was deleted with the over-engineered camera stack.
 * The new minimal LiveKit plugin relies on the SDK's built-in
 * reconnection + adaptive streaming — no app-level coordinator needed.
 *
 * This stub keeps `PrivateCallActivity` compiling. `attach()` and
 * `detach()` are safe no-ops; the resilience overlay views simply
 * stay hidden (their default XML state).
 */
class CameraResilienceController(
    @Suppress("UNUSED_PARAMETER") activity: Activity,
    @Suppress("UNUSED_PARAMETER") remoteVideoContainer: View? = null,
    @Suppress("UNUSED_PARAMETER") localPreviewContainer: View? = null,
    @Suppress("UNUSED_PARAMETER") freezeOverlay: ImageView? = null,
    @Suppress("UNUSED_PARAMETER") resilienceBanner: LinearLayout? = null,
    @Suppress("UNUSED_PARAMETER") resilienceText: TextView? = null,
    @Suppress("UNUSED_PARAMETER") resilienceRetry: Button? = null,
    @Suppress("UNUSED_PARAMETER") remotePoorOverlay: View? = null,
    @Suppress("UNUSED_PARAMETER") localRendererProvider: () -> SurfaceViewRenderer? = { null },
) {
    fun attach() { /* no-op */ }
    fun detach() { /* no-op */ }
}
