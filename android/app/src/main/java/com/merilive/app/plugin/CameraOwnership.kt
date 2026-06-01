package com.merilive.app.plugin

import java.util.concurrent.atomic.AtomicReference

/**
 * Pkg415 — Cross-plugin Camera2 hardware arbiter.
 *
 * Both `NativeCameraPlugin` (CameraX preview for GoLive / Face verification)
 * and `LiveKitPlugin` (Camera2Capturer for live broadcasts and private calls)
 * try to open the same front camera. If both hold the hardware at the same
 * time, Android Camera2 raises `CAMERA_IN_USE` and the second opener's
 * surface stays blank — that's the user-visible 2-second WHITE SCREEN.
 *
 * This object enforces single ownership at process scope. Callers MUST:
 *   1. acquire(owner)   — true on success, false if another owner holds it
 *   2. ...open camera...
 *   3. release(owner)   — on stop / disconnect / error
 *
 * Ownership is advisory: it does NOT physically lock Camera2 (impossible
 * across packages). It only coordinates between OUR plugins so we never
 * fight ourselves.
 */
object CameraOwnership {
    const val OWNER_NATIVE_CAMERA = "native-camera"
    const val OWNER_LIVEKIT = "livekit"
    const val OWNER_GPUPIXEL = "gpupixel"

    private val current = AtomicReference<String?>(null)

    /** Returns the current owner, or null if free. */
    fun owner(): String? = current.get()

    /**
     * Attempt to take ownership. If [force] is true, an existing owner is
     * displaced (used by hard-reconnect flows). Returns true on success.
     */
    @JvmStatic
    fun acquire(owner: String, force: Boolean = false): Boolean {
        if (force) {
            current.set(owner)
            return true
        }
        return current.compareAndSet(null, owner) || current.get() == owner
    }

    /** Release ownership only if [owner] currently holds it. */
    @JvmStatic
    fun release(owner: String) {
        current.compareAndSet(owner, null)
    }

    /** Force-release regardless of owner (use on activity destroy). */
    @JvmStatic
    fun forceRelease() {
        current.set(null)
    }
}
