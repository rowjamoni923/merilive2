package com.merilive.app.util

import android.util.Log
import java.util.concurrent.atomic.AtomicReference

/**
 * Native Android camera arbiter for the standalone Kotlin app.
 * Live preview (CameraX) and LiveKit publishing must never open hardware
 * at the same time; that dual-owner race is the main blank-camera cause.
 */
object CameraOwnership {
    private const val TAG = "CameraOwnership"
    private const val OEM_RELEASE_GRACE_MS = 1_200L

    const val OWNER_PREVIEW = "preview"
    const val OWNER_LIVEKIT = "livekit"

    private val current = AtomicReference<String?>(null)
    @Volatile private var lastReleasedAtMs: Long = 0L
    @Volatile private var lastReleasedOwner: String? = null

    fun owner(): String? = current.get()

    fun acquire(owner: String, force: Boolean = false): Boolean {
        if (force) {
            val prev = current.getAndSet(owner)
            if (prev != null && prev != owner) Log.w(TAG, "forced $prev → $owner")
            return true
        }
        val ok = current.compareAndSet(null, owner) || current.get() == owner
        if (!ok) Log.w(TAG, "denied $owner, held by ${current.get()}")
        return ok
    }

    fun release(owner: String) {
        if (current.compareAndSet(owner, null)) {
            lastReleasedAtMs = System.currentTimeMillis()
            lastReleasedOwner = owner
        }
    }

    fun releaseGraceRemainingMs(): Long {
        lastReleasedOwner ?: return 0L
        val elapsed = System.currentTimeMillis() - lastReleasedAtMs
        return (OEM_RELEASE_GRACE_MS - elapsed).coerceAtLeast(0L)
    }
}