package com.merilive.app.plugin

import android.util.Log
import java.util.concurrent.atomic.AtomicReference

/**
 * Pkg415 / Pkg416 — Cross-plugin Camera2 hardware arbiter.
 *
 * Both `NativeCameraPlugin` (CameraX preview for Face Verification) and
 * `LiveKitPlugin` (Camera2Capturer for live broadcasts / private calls /
 * video party / game party) try to open the same front camera. If both
 * hold the hardware at the same time, Android Camera2 raises
 * `CAMERA_IN_USE` and the second opener's surface stays blank — that's
 * the user-visible WHITE SCREEN.
 *
 * Single-camera contract (Pkg416):
 *   - LiveKit is the ONE professional camera for all four streaming
 *     features. All four reuse the same Camera2 capture session via the
 *     same LiveKitPlugin instance; there is no per-feature camera open.
 *   - NativeCamera is reserved EXCLUSIVELY for Face Verification.
 *   - GPUPixelBeauty NEVER opens the camera — it consumes LiveKit frames.
 *
 * Callers MUST:
 *   1. acquire(owner)   — true on success, false if another owner holds it
 *   2. ...open camera...
 *   3. release(owner)   — on stop / disconnect / error
 *
 * Ownership is advisory: it does NOT physically lock Camera2 (impossible
 * across packages). It only coordinates between OUR plugins so we never
 * fight ourselves.
 */
object CameraOwnership {
    private const val TAG = "CameraOwnership"

    const val OWNER_NATIVE_CAMERA = "native-camera"     // face verification only
    const val OWNER_LIVEKIT = "livekit"                 // ALL streaming
    @Deprecated("Pkg416: WebView LiveKit fallback no longer opens camera independently")
    const val OWNER_WEBVIEW_LIVEKIT = "webview-livekit"
    @Deprecated("Pkg416: GPUPixel must not own the camera; it consumes LiveKit frames")
    const val OWNER_GPUPIXEL = "gpupixel"

    private val current = AtomicReference<String?>(null)

    /** Returns the current owner, or null if free. */
    fun owner(): String? = current.get()

    /**
     * Attempt to take ownership. If [force] is true, an existing owner is
     * displaced (used by hard-reconnect flows). Returns true on success.
     *
     * Pkg416: rejects deprecated GPUPIXEL acquisitions outright — they
     * indicate a regression to the old "everyone opens the camera" model.
     */
    @JvmStatic
    @JvmOverloads
    fun acquire(owner: String, force: Boolean = false): Boolean {
        if (owner == OWNER_GPUPIXEL) {
            Log.e(TAG, "REJECTED acquire by '$owner' — GPUPixel must not own the camera (Pkg416). Current owner=${current.get()}")
            return false
        }
        if (force) {
            val prev = current.getAndSet(owner)
            if (prev != null && prev != owner) {
                Log.w(TAG, "FORCED ownership '$prev' → '$owner'")
            }
            return true
        }
        val ok = current.compareAndSet(null, owner) || current.get() == owner
        if (!ok) {
            Log.w(TAG, "DENIED acquire by '$owner' — held by '${current.get()}'")
        }
        return ok
    }

    /** Release ownership only if [owner] currently holds it. */
    @JvmStatic
    fun release(owner: String) {
        if (current.compareAndSet(owner, null)) {
            Log.d(TAG, "released '$owner'")
        }
    }

    /** Force-release regardless of owner (use on activity destroy). */
    @JvmStatic
    fun forceRelease() {
        val prev = current.getAndSet(null)
        if (prev != null) Log.w(TAG, "force-released '$prev'")
    }
}
