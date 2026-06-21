package com.merilive.app.activity

import android.content.Context
import android.util.Log
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.merilive.app.rtc.RtcEngineManager
import io.livekit.android.events.RoomEvent
import io.livekit.android.events.collect
import io.livekit.android.room.Room
import io.livekit.android.room.participant.LocalParticipant
import io.livekit.android.room.participant.Participant
import io.livekit.android.room.participant.RemoteParticipant
import io.livekit.android.room.track.Track
import io.livekit.android.room.track.VideoTrack
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch

/**
 * Pkg500 PrivateCallViewModel — Phase A scaffold + Phase B LiveKit binding.
 *
 * Phase B contract (does NOT open its own Room — that would violate the
 * single-camera contract in Pkg416 / CameraOwnership):
 *  - Adopts the Room that `LiveKitPlugin` already connected before the
 *    Activity was launched. JS layer is responsible for the connect
 *    sequence (token issue → LiveKitPlugin.connect → NativeCall.openInCallActivity).
 *  - Observes RoomEvents to surface remote/local video tracks and the
 *    connection state to the Activity via StateFlow.
 *  - When the remote peer disconnects, starts a 5-second grace timer
 *    (handles ICE blips) then marks the call as ENDING. The Activity
 *    finishes after the end-screen (Phase E).
 *  - Does NOT call `room.disconnect()` in `onCleared` — Room lifetime is
 *    owned by LiveKitPlugin / RtcEngineManager. We only release our
 *    Activity-side observer + render attachments.
 *
 * Why this split:
 *  - One process, one Camera2 owner (LiveKit). Avoids the white-screen
 *    bug Pkg415/416 fixed.
 *  - Existing reconnect / network-callback / stall watchdog logic in
 *    `LiveKitPlugin` already covers the ICE / wifi-reconnect cases
 *    flagged by the research subagent (LiveKit issue #545). No need to
 *    duplicate.
 *  - End-of-call settle (`settle_private_call` RPC) is dispatched by
 *    JS via existing `usePrivateCall` hook, kept off the native path
 *    so server contract changes don't force an APK rebuild.
 */
class PrivateCallViewModel : ViewModel() {

    companion object {
        private const val TAG = "PrivateCallVM"
        /** Grace window after the peer disappears before we end the call. */
        private const val PEER_DISCONNECT_GRACE_MS = 5_000L
    }

    enum class CallState { IDLE, CONNECTING, CONNECTED, RECONNECTING, ENDING, ENDED }

    data class CallIdentity(
        val callId: String,
        val peerId: String,
        val peerName: String,
        val peerAvatar: String?,
        val isCaller: Boolean,
        val livekitUrl: String,
        val livekitToken: String,
    )

    private val _identity = MutableStateFlow<CallIdentity?>(null)
    val identity: StateFlow<CallIdentity?> = _identity.asStateFlow()

    private val _state = MutableStateFlow(CallState.IDLE)
    val state: StateFlow<CallState> = _state.asStateFlow()

    private val _durationSec = MutableStateFlow(0)
    val durationSec: StateFlow<Int> = _durationSec.asStateFlow()

    private val _balanceCoins = MutableStateFlow<Long?>(null)
    val balanceCoins: StateFlow<Long?> = _balanceCoins.asStateFlow()

    private val _ratePerMinute = MutableStateFlow(0)
    val ratePerMinute: StateFlow<Int> = _ratePerMinute.asStateFlow()

    /**
     * Pkg500 Phase D — seconds caller can still afford at the current rate.
     * Computed locally as `floor(balance / rate * 60)` and ticked down 1Hz
     * between JS resyncs (which arrive each time the server bills another
     * minute). When the server rebills we resync from the JS push and the
     * local ticker realigns — never drifts more than one server interval.
     */
    private val _secondsRemaining = MutableStateFlow<Int?>(null)
    val secondsRemaining: StateFlow<Int?> = _secondsRemaining.asStateFlow()

    enum class WarningLevel { NONE, SIXTY, THIRTY, TEN, CRITICAL }

    private val _warningLevel = MutableStateFlow(WarningLevel.NONE)
    val warningLevel: StateFlow<WarningLevel> = _warningLevel.asStateFlow()

    private val _micEnabled = MutableStateFlow(true)
    val micEnabled: StateFlow<Boolean> = _micEnabled.asStateFlow()

    private val _cameraEnabled = MutableStateFlow(true)
    val cameraEnabled: StateFlow<Boolean> = _cameraEnabled.asStateFlow()

    private val _cameraFront = MutableStateFlow(true)
    val cameraFront: StateFlow<Boolean> = _cameraFront.asStateFlow()

    /** Phase B — remote peer's video track, null until subscribed. */
    private val _remoteVideo = MutableStateFlow<VideoTrack?>(null)
    val remoteVideo: StateFlow<VideoTrack?> = _remoteVideo.asStateFlow()

    /** Phase B — local participant's published camera track, null until published. */
    private val _localVideo = MutableStateFlow<VideoTrack?>(null)
    val localVideo: StateFlow<VideoTrack?> = _localVideo.asStateFlow()

    private var _endReason: String? = null
    val endReason: String? get() = _endReason

    // --- Phase B internals ---------------------------------------------------

    private var room: Room? = null
    private var eventsJob: Job? = null
    private var durationJob: Job? = null
    private var peerGraceJob: Job? = null
    @Volatile private var peerEverSeen: Boolean = false

    // -------------------------------------------------------------------
    // Phase A setters preserved
    // -------------------------------------------------------------------

    fun bindIdentity(id: CallIdentity) {
        if (_identity.value == null) _identity.value = id
    }

    fun setState(next: CallState) { _state.value = next }
    fun setDuration(seconds: Int) { _durationSec.value = seconds.coerceAtLeast(0) }
    fun setBalance(coins: Long?) { _balanceCoins.value = coins; recomputeRemaining() }
    fun setRatePerMinute(rate: Int) { _ratePerMinute.value = rate.coerceAtLeast(0); recomputeRemaining() }

    /**
     * Pkg500 Phase D — single update from JS for every billing-relevant
     * change (per-minute server tick, manual recharge, refund). Resyncs
     * balance + rate atomically and re-anchors the local 1Hz ticker so the
     * banner countdown never drifts.
     */
    fun setBilling(balanceCoins: Long, ratePerMinute: Int) {
        _balanceCoins.value = balanceCoins.coerceAtLeast(0)
        _ratePerMinute.value = ratePerMinute.coerceAtLeast(0)
        recomputeRemaining()
        startBillingTickerIfNeeded()
    }

    private fun recomputeRemaining() {
        val bal = _balanceCoins.value ?: return
        val rate = _ratePerMinute.value
        if (rate <= 0) {
            _secondsRemaining.value = null
            _warningLevel.value = WarningLevel.NONE
            return
        }
        val secs = ((bal.toDouble() / rate.toDouble()) * 60.0).toInt().coerceAtLeast(0)
        _secondsRemaining.value = secs
        _warningLevel.value = when {
            secs <= 0 -> WarningLevel.CRITICAL
            secs <= 10 -> WarningLevel.TEN
            secs <= 30 -> WarningLevel.THIRTY
            secs <= 60 -> WarningLevel.SIXTY
            else -> WarningLevel.NONE
        }
    }

    private var billingTickerJob: Job? = null
    private fun startBillingTickerIfNeeded() {
        if (billingTickerJob?.isActive == true) return
        billingTickerJob = viewModelScope.launch {
            while (true) {
                delay(1_000)
                val secs = _secondsRemaining.value ?: continue
                val rate = _ratePerMinute.value
                if (rate <= 0) continue
                if (_state.value != CallState.CONNECTED) continue
                val next = (secs - 1).coerceAtLeast(0)
                _secondsRemaining.value = next
                _warningLevel.value = when {
                    next <= 0 -> WarningLevel.CRITICAL
                    next <= 10 -> WarningLevel.TEN
                    next <= 30 -> WarningLevel.THIRTY
                    next <= 60 -> WarningLevel.SIXTY
                    else -> WarningLevel.NONE
                }
            }
        }
    }

    fun toggleMic(): Boolean {
        val next = !_micEnabled.value
        _micEnabled.value = next
        try {
            room?.localParticipant?.let { lp ->
                viewModelScope.launch { runCatching { lp.setMicrophoneEnabled(next) } }
            }
        } catch (t: Throwable) { Log.w(TAG, "toggleMic: ${t.message}") }
        return next
    }

    fun toggleCamera(): Boolean {
        val next = !_cameraEnabled.value
        _cameraEnabled.value = next
        try {
            room?.localParticipant?.let { lp ->
                viewModelScope.launch { runCatching { lp.setCameraEnabled(next) } }
            }
        } catch (t: Throwable) { Log.w(TAG, "toggleCamera: ${t.message}") }
        return next
    }

    fun flipCamera() {
        // Phase C — actually flip the physical camera via LiveKit's
        // LocalVideoTrack.switchCamera(). We route through the LiveKitPlugin
        // static helper so the same camera-ownership / Camera2 retry plumbing
        // that JS uses applies here, instead of opening Camera2 ourselves.
        _cameraFront.value = !_cameraFront.value
        try {
            com.merilive.app.plugin.LiveKitPlugin.switchCameraFromNative()
        } catch (t: Throwable) {
            Log.w(TAG, "flipCamera: ${t.message}")
        }
    }

    fun markEnding(reason: String) {
        if (_state.value == CallState.ENDED || _state.value == CallState.ENDING) return
        _endReason = reason
        _state.value = CallState.ENDING
    }

    fun markEnded() { _state.value = CallState.ENDED }

    // -------------------------------------------------------------------
    // Phase B — attach to the Room LiveKitPlugin already connected.
    // -------------------------------------------------------------------

    /**
     * Look up the active Room from RtcEngineManager and start observing.
     * Returns false if no Room is currently bound — caller (Activity) should
     * finish itself in that case because we have nothing to render.
     */
    fun attachToCurrentRoom(@Suppress("unused") appContext: Context): Boolean {
        if (room != null) return true
        val r = RtcEngineManager.currentRoom()
        if (r == null) {
            Log.w(TAG, "attachToCurrentRoom: no Room bound — LiveKitPlugin must connect first")
            return false
        }
        room = r
        _state.value = if (peerHasVideo(r)) CallState.CONNECTED else CallState.CONNECTING
        observeRoom(r)
        captureInitialTracks(r)
        // Pkg501 (Defect #6, Chamet/Bigo/WhatsApp pattern): caller MUST see
        // their own self-preview during DIALING / RINGING, not a black frame.
        // If the local camera publication hasn't started yet, kick it off so
        // `_localVideo` resolves and `attachLocal` mounts the renderer before
        // the callee answers. Idempotent — no-ops if already enabled.
        viewModelScope.launch {
            try {
                if (r.localParticipant.getTrackPublication(Track.Source.CAMERA) == null) {
                    r.localParticipant.setCameraEnabled(true)
                }
            } catch (t: Throwable) {
                Log.w(TAG, "attachToCurrentRoom: early camera enable failed: ${t.message}")
            }
        }
        startDurationTicker()
        return true
    }

    private fun observeRoom(r: Room) {
        eventsJob?.cancel()
        eventsJob = viewModelScope.launch {
            runCatching {
                r.events.collect { ev ->
                    when (ev) {
                        is RoomEvent.ParticipantConnected -> {
                            if (ev.participant.identity?.value == _identity.value?.peerId) {
                                cancelPeerGrace()
                            }
                        }

                        is RoomEvent.ParticipantDisconnected -> {
                            if (ev.participant.identity?.value == _identity.value?.peerId) {
                                _remoteVideo.value = null
                                startPeerGrace()
                            }
                        }

                        is RoomEvent.TrackSubscribed -> {
                            val track = ev.track
                            if (track is VideoTrack &&
                                ev.participant.identity?.value == _identity.value?.peerId
                            ) {
                                peerEverSeen = true
                                _remoteVideo.value = track
                                cancelPeerGrace()
                                if (_state.value == CallState.CONNECTING ||
                                    _state.value == CallState.RECONNECTING
                                ) {
                                    _state.value = CallState.CONNECTED
                                }
                            }
                        }

                        is RoomEvent.TrackUnsubscribed -> {
                            if (ev.participant.identity?.value == _identity.value?.peerId &&
                                _remoteVideo.value === ev.track
                            ) {
                                _remoteVideo.value = null
                            }
                        }

                        is RoomEvent.TrackPublished -> {
                            // Local participant publishing camera → mirror to localVideo.
                            captureLocalTrackIfPossible(r)
                        }

                        is RoomEvent.TrackUnpublished -> {
                            captureLocalTrackIfPossible(r)
                        }

                        is RoomEvent.Reconnecting -> {
                            cancelPeerGrace()
                            if (_state.value != CallState.ENDED &&
                                _state.value != CallState.ENDING
                            ) {
                                _state.value = CallState.RECONNECTING
                            }
                        }

                        is RoomEvent.Reconnected -> {
                            cancelPeerGrace()
                            _state.value = if (peerHasVideo(r)) {
                                CallState.CONNECTED
                            } else {
                                CallState.CONNECTING
                            }
                        }

                        is RoomEvent.Disconnected -> Unit

                        else -> Unit
                    }
                }
            }.onFailure { Log.w(TAG, "observeRoom: ${it.message}") }
        }
    }

    private fun captureInitialTracks(r: Room) {
        // Peer may have already been in the room when we attached.
        val peerId = _identity.value?.peerId ?: return
        val peer = r.remoteParticipants.values.firstOrNull { it.identity?.value == peerId }
        if (peer != null) {
            val track = peer.getTrackPublication(Track.Source.CAMERA)?.track as? VideoTrack
            if (track != null) {
                peerEverSeen = true
                _remoteVideo.value = track
                _state.value = CallState.CONNECTED
            }
        }
        captureLocalTrackIfPossible(r)
    }

    private fun captureLocalTrackIfPossible(r: Room) {
        val track = r.localParticipant.getTrackPublication(Track.Source.CAMERA)?.track as? VideoTrack
        if (track !== _localVideo.value) _localVideo.value = track
    }

    private fun peerHasVideo(r: Room): Boolean {
        val peerId = _identity.value?.peerId ?: return false
        val peer = r.remoteParticipants.values.firstOrNull { it.identity?.value == peerId }
        return peer?.getTrackPublication(Track.Source.CAMERA)?.track is VideoTrack
    }

    private fun startPeerGrace() {
        if (peerGraceJob?.isActive == true) return
        // Honest-private-call fix (X-3): if we're already in RECONNECTING
        // state, the peer's ParticipantDisconnected is almost certainly a
        // transient ICE restart rather than a real hangup. LiveKit's reconnect
        // window can take 3-10s on weak networks; the 5s grace was too narrow
        // and ended the call prematurely. Defer the grace timer until either
        // (a) we leave RECONNECTING or (b) Reconnected fires with no peer.
        if (_state.value == CallState.RECONNECTING) {
            android.util.Log.i(TAG, "startPeerGrace deferred — in RECONNECTING state")
            return
        }
        peerGraceJob = viewModelScope.launch {
            delay(PEER_DISCONNECT_GRACE_MS)
            if (_state.value != CallState.ENDED && _state.value != CallState.ENDING) {
                markEnding("peer_left")
                markEnded()
            }
        }
    }

    private fun cancelPeerGrace() {
        peerGraceJob?.cancel()
        peerGraceJob = null
    }


    private fun startDurationTicker() {
        if (durationJob?.isActive == true) return
        durationJob = viewModelScope.launch {
            // 1 Hz local ticker — Phase D will overwrite from server billing
            // events so this is only the "connecting/idle" display.
            var s = 0
            while (true) {
                if (_state.value == CallState.CONNECTED) {
                    s += 1
                    _durationSec.value = s
                }
                delay(1_000)
            }
        }
    }

    override fun onCleared() {
        eventsJob?.cancel()
        durationJob?.cancel()
        peerGraceJob?.cancel()
        billingTickerJob?.cancel()
        eventsJob = null
        durationJob = null
        peerGraceJob = null
        billingTickerJob = null
        // Honest-private-call fix (L-3): null the published track flows BEFORE
        // releasing the room reference. Otherwise PrivateCallActivity.onDestroy
        // races with GC of `room` and may call removeRenderer on a tombstoned
        // VideoTrack (NPE in native WebRTC on Pixel 6+).
        _remoteVideo.value = null
        _localVideo.value = null
        // DO NOT room?.disconnect() — Room is owned by LiveKitPlugin.
        // Activity will detach its renderers from tracks in onDestroy.
        room = null
        super.onCleared()
    }


    /** Exposed so the Activity can call track.add/removeRenderer directly. */
    fun currentRoom(): Room? = room
    fun currentLocalParticipant(): LocalParticipant? = room?.localParticipant
    fun currentRemoteParticipant(): RemoteParticipant? {
        val r = room ?: return null
        val peerId = _identity.value?.peerId ?: return null
        return r.remoteParticipants.values.firstOrNull { it.identity?.value == peerId }
    }
    @Suppress("unused")
    fun anyParticipant(): Participant? = currentRemoteParticipant() ?: currentLocalParticipant()
}
