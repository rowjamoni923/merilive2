package com.merilive.app.plugin

/**
 * CameraOwnership — STUB (2026-06-14 rebuild).
 *
 * The previous full arbiter (5 owner constants, grace timers, eviction)
 * was deleted along with the over-engineered LiveKit plugin. Only one
 * camera owner exists today (LiveKit SDK's built-in Camera2 capturer),
 * so there is no contention to arbitrate.
 *
 * This stub preserves the API surface used by the remaining callers
 * (NativeCameraPlugin for Face Verification, AudioRecorderPlugin) so
 * the Android module compiles without rewriting them.
 */
object CameraOwnership {
    const val OWNER_LIVEKIT = "livekit"
    const val OWNER_NATIVE_CAMERA = "native-camera"
    const val OWNER_PREVIEW = "preview"

    fun owner(): String? = null
    fun acquire(owner: String, force: Boolean = false): Boolean = true
    fun acquireOrEvictStale(owner: String, force: Boolean = false): Boolean = true
    fun release(owner: String) { /* no-op */ }
    fun forceRelease() { /* no-op */ }
    fun releaseGraceRemainingMs(owner: String = ""): Long = 0L
}
