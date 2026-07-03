package com.merilive.app.plugin

import android.util.Log
import io.livekit.android.renderer.TextureViewRenderer
import io.livekit.android.room.Room
import io.livekit.android.room.participant.RemoteParticipant
import io.livekit.android.room.track.RemoteVideoTrack
import io.livekit.android.room.track.Track
import io.livekit.android.room.track.VideoTrack
import java.util.concurrent.ConcurrentHashMap

/**
 * Phase 0 (Camera Rebuild Plan, 2026-06-14) — seat ↔ video-track binder.
 *
 * INDUSTRY PATTERN (Agora — Bigo/MICO Video Party):
 *   Each seat in a multi-seat party room maps a numeric `uid` (Agora) /
 *   string `identity` (LiveKit) to a `VideoCanvas` / `TextureViewRenderer`.
 *   When seats reshuffle, the binding is updated, NOT the camera.
 *
 *   `setupRemoteVideo(VideoCanvas(view, RENDER_MODE_HIDDEN, uid))`  // Agora
 *     ↓ translates to ↓
 *   `videoTrack.addRenderer(view, ViewVisibility(view))`            // LiveKit
 *
 * WHY THIS EXISTS:
 *   Video Party host seat shows black in production (failure F1 in
 *   `.lovable/plan.md`). Root cause: the React TextureView is never bound
 *   to the actual LiveKit camera track — the publish succeeds, but the
 *   `addRenderer` call is missing or fires before the track exists.
 *
 * THIS FILE IS PHASE 0 — COMPILE-ONLY:
 *   Public API surface defined; Phase 1 will wire it from
 *   `LiveKitPlugin` JS bridge + `usePartyRoomNativeLiveKit.ts`.
 *
 * CONTRACT:
 *   - `bindSeat(seatIndex, identity, renderer)` — idempotent; rebinding
 *     the same seat unsubscribes the previous renderer first.
 *   - `unbindSeat(seatIndex)` — removes renderer, leaves track intact.
 *   - `onTrackSubscribed` / `onLocalTrackPublished` — call from LiveKit
 *     event handlers to lazily attach renderers that were registered
 *     before the track existed.
 */
object SeatRendererBinder {
    private const val TAG = "SeatRendererBinder"

    private data class SeatBinding(
        val seatIndex: Int,
        val identity: String,
        val renderer: TextureViewRenderer,
        var attachedTrack: VideoTrack? = null,
    )

    private val bindings = ConcurrentHashMap<Int, SeatBinding>()

    /**
     * Register that [seatIndex] should display [identity]'s camera in [renderer].
     * If the track is already available it attaches immediately; otherwise it
     * waits for [onTrackSubscribed] / [onLocalTrackPublished] to be called.
     */
    @Synchronized
    fun bindSeat(
        room: Room?,
        seatIndex: Int,
        identity: String,
        renderer: TextureViewRenderer,
    ) {
        // Tear down any previous binding for this seat first.
        unbindSeat(seatIndex)

        val binding = SeatBinding(seatIndex, identity, renderer)
        bindings[seatIndex] = binding
        Log.d(TAG, "bindSeat seat=$seatIndex identity=$identity")

        // Try eager attach if the track already exists.
        val track = resolveTrack(room, identity)
        if (track != null) {
            attach(binding, track)
        }
    }

    @Synchronized
    fun unbindSeat(seatIndex: Int) {
        val prev = bindings.remove(seatIndex) ?: return
        prev.attachedTrack?.let { track ->
            try {
                track.removeRenderer(prev.renderer)
            } catch (t: Throwable) {
                Log.w(TAG, "removeRenderer failed for seat=$seatIndex: ${t.message}")
            }
        }
        Log.d(TAG, "unbindSeat seat=$seatIndex (was identity=${prev.identity})")
    }

    /** Called by LiveKitPlugin event handler when a remote video track is subscribed. */
    @Synchronized
    fun onTrackSubscribed(identity: String, track: VideoTrack) {
        bindings.values
            .filter { it.identity == identity && it.attachedTrack !== track }
            .forEach { attach(it, track) }
    }

    /** Called by LiveKitPlugin when the LOCAL participant publishes a camera track. */
    @Synchronized
    fun onLocalTrackPublished(localIdentity: String, track: VideoTrack) {
        onTrackSubscribed(localIdentity, track)
    }

    /** Called when a participant disconnects / unpublishes — detach renderers. */
    @Synchronized
    fun onTrackUnpublished(identity: String) {
        bindings.values
            .filter { it.identity == identity }
            .forEach { b ->
                b.attachedTrack?.let { t ->
                    try { t.removeRenderer(b.renderer) } catch (_: Throwable) {}
                }
                b.attachedTrack = null
            }
    }

    /** Drop all bindings (room disconnect). */
    @Synchronized
    fun clear() {
        bindings.values.forEach { b ->
            b.attachedTrack?.let { t ->
                try { t.removeRenderer(b.renderer) } catch (_: Throwable) {}
            }
        }
        bindings.clear()
        Log.d(TAG, "cleared all seat bindings")
    }

    private fun attach(binding: SeatBinding, track: VideoTrack) {
        try {
            // Detach prior track if different.
            binding.attachedTrack?.takeIf { it !== track }?.let { prev ->
                try { prev.removeRenderer(binding.renderer) } catch (_: Throwable) {}
            }
            track.addRenderer(binding.renderer)
            binding.attachedTrack = track
            Log.d(
                TAG,
                "attached track to seat=${binding.seatIndex} identity=${binding.identity}",
            )
        } catch (t: Throwable) {
            Log.e(TAG, "addRenderer failed for seat=${binding.seatIndex}: ${t.message}")
        }
    }

    private fun resolveTrack(room: Room?, identity: String): VideoTrack? {
        room ?: return null
        // Local participant
        if (room.localParticipant.identity?.value == identity) {
            val pub = room.localParticipant.getTrackPublication(Track.Source.CAMERA)
            return pub?.track as? VideoTrack
        }
        // Remote participant
        val remote: RemoteParticipant? = room.remoteParticipants.values
            .firstOrNull { it.identity?.value == identity }
        val pub = remote?.getTrackPublication(Track.Source.CAMERA)
        return pub?.track as? RemoteVideoTrack
    }
}
