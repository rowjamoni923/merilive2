package com.merilive.app.plugin

import android.util.Log
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock

/**
 * Phase 0 (Camera Rebuild Plan, 2026-06-14) — single-camera authority.
 *
 * INDUSTRY PATTERN (Agora — Bigo/MICO/Chamet/Olamet):
 *   One `CameraAuthority` singleton serializes all features that need the
 *   front camera. Live / Private Call / Video Party / Game Party all share
 *   ONE Camera2 capturer (owned by LiveKit Room). Face Verify uses native
 *   CameraX and is mutually exclusive with the streaming family — it
 *   queues / is rejected while a stream owner holds the camera, and vice
 *   versa.
 *
 * LIVEKIT TRANSLATION:
 *   On API ≥ 29 Android enforces single-client Camera2 access. Opening a
 *   second `Room` (or a CameraX `Preview`) while one is live throws
 *   `CameraAccessException: CAMERA_IN_USE` — this is the user-visible
 *   blank/white preview and crash root cause.
 *
 * THIS FILE IS PHASE 0 — COMPILE-ONLY:
 *   No call site is wired yet. Phase 6 in `.lovable/plan.md` will wrap
 *   every camera-opening path with `request(owner) { ... }`. The legacy
 *   advisory `CameraOwnership` arbiter stays in place until then; this
 *   manager will eventually subsume it.
 *
 * CONTRACT:
 *   - `request(owner) { block }` suspends until camera is free, runs the
 *     critical section, and releases in `finally` even on cancellation.
 *   - Streaming owners (LIVE_STREAM / PRIVATE_CALL / VIDEO_PARTY /
 *     GAME_PARTY) all map to the same physical capturer. Re-entrant
 *     acquires within the streaming family are reference-counted: the
 *     camera is held as long as ≥1 streaming owner is active.
 *   - FACE_VERIFY is exclusive — cannot acquire while streaming family
 *     holds, and vice versa.
 *
 * Why a separate manager from `CameraOwnership.kt`?
 *   `CameraOwnership` is a fire-and-forget advisory boolean; it does not
 *   serialize concurrent acquires or expose a coroutine-safe surface.
 *   This manager provides the suspending serialization Bigo/MICO use to
 *   avoid CAMERA_IN_USE on hot transitions (e.g. exit-live → enter-call
 *   within 200 ms).
 */
object CameraAuthorityManager {
    private const val TAG = "CameraAuthority"

    enum class Owner {
        NONE,
        LIVE_STREAM,
        PRIVATE_CALL,
        VIDEO_PARTY,
        GAME_PARTY,
        FACE_VERIFY,
    }

    enum class Family { NONE, STREAMING, VERIFICATION }

    private fun Owner.family(): Family = when (this) {
        Owner.NONE -> Family.NONE
        Owner.LIVE_STREAM, Owner.PRIVATE_CALL, Owner.VIDEO_PARTY, Owner.GAME_PARTY -> Family.STREAMING
        Owner.FACE_VERIFY -> Family.VERIFICATION
    }

    private val mutex = Mutex()
    private val _state = MutableStateFlow<Set<Owner>>(emptySet())
    val state: StateFlow<Set<Owner>> = _state.asStateFlow()

    /** Current family holding the camera, or NONE if free. */
    fun currentFamily(): Family =
        _state.value.firstOrNull()?.family() ?: Family.NONE

    /** True if [owner] currently holds the camera. */
    fun isHeldBy(owner: Owner): Boolean = _state.value.contains(owner)

    /**
     * Acquire the camera for [owner], run [block], release on completion
     * (success, exception, or cancellation).
     *
     * Suspends if a different family holds the camera. Streaming family
     * acquires within the same family proceed immediately (shared capturer).
     */
    suspend fun <T> request(owner: Owner, block: suspend () -> T): T {
        require(owner != Owner.NONE) { "Cannot request NONE owner" }

        // Wait until either free or held by the same family.
        val targetFamily = owner.family()
        _state.first { current ->
            current.isEmpty() || current.first().family() == targetFamily
        }

        mutex.withLock {
            val current = _state.value
            if (current.isNotEmpty() && current.first().family() != targetFamily) {
                // Family changed while we were waiting — recurse to re-wait.
                Log.w(TAG, "family changed during acquire, retrying for $owner")
                return request(owner, block)
            }
            _state.value = current + owner
            Log.d(TAG, "acquired $owner — holders=${_state.value}")
        }

        return try {
            block()
        } finally {
            release(owner)
        }
    }

    /**
     * Manual release — only call this if you used [tryAcquire] instead of
     * [request]. The `request { ... }` path releases automatically.
     */
    fun release(owner: Owner) {
        val next = _state.value - owner
        _state.value = next
        Log.d(TAG, "released $owner — holders=$next")
    }

    /**
     * Non-suspending best-effort acquire. Returns false if a different
     * family currently holds. Caller is responsible for [release] in
     * `finally`. Prefer [request] in coroutine contexts.
     */
    fun tryAcquire(owner: Owner): Boolean {
        require(owner != Owner.NONE) { "Cannot tryAcquire NONE owner" }
        val current = _state.value
        if (current.isNotEmpty() && current.first().family() != owner.family()) {
            Log.w(TAG, "tryAcquire DENIED $owner — held by ${current.first()}")
            return false
        }
        _state.value = current + owner
        Log.d(TAG, "tryAcquire OK $owner — holders=${_state.value}")
        return true
    }

    /** Emergency reset — only from app-wide error recovery / onDestroy. */
    fun forceReleaseAll() {
        val prev = _state.value
        _state.value = emptySet()
        if (prev.isNotEmpty()) Log.w(TAG, "forceReleaseAll — was $prev")
    }
}
