package com.merilive.app.activity

import androidx.lifecycle.ViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow

/**
 * Pkg500 Phase A — PrivateCallViewModel
 *
 * Holds the lifecycle-bound state for [PrivateCallActivity]. Phase A scope is
 * STATE ONLY — no LiveKit, no Realtime, no billing subscription. Those are
 * wired in Phases B, D respectively. This file exists so the Activity can
 * already render its layout against real StateFlows, so Phase B/D/E only have
 * to wire data sources without touching the UI surface.
 *
 * Why a ViewModel instead of holding state in the Activity:
 *  - The LiveKit `Room` (Phase B) will live here so it survives configuration
 *    changes (orientation, keyboardHidden) and is torn down exactly once in
 *    [onCleared]. Activity-held Rooms leak on every rotation.
 *  - StateFlow + collect-in-lifecycle gives us a clean, cancellable bridge to
 *    the XML layout without re-creating subscriptions on every onStart.
 *  - Memory-leak research (Stream Video, LiveKit issue #545): the single
 *    safest pattern is "Room in ViewModel, disconnect in onCleared".
 */
class PrivateCallViewModel : ViewModel() {

    /**
     * High-level state machine. Phase B will drive transitions from LiveKit
     * RoomEvents; Phase D will drive ENDING from server billing realtime.
     */
    enum class CallState {
        IDLE,        // Activity created, intent parsed, nothing connected yet
        CONNECTING,  // Phase B: room.connect() in flight
        CONNECTED,   // Phase B: ICE done, remote video flowing
        RECONNECTING,// Phase B: network blip; LiveKit auto-recover
        ENDING,      // Phase D/E: insufficient balance / user hang-up grace
        ENDED        // Finalised — Activity should finish() after end-screen
    }

    /** Call identity passed in from intent — immutable for the Activity lifetime. */
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

    /** Seconds since call CONNECTED. Phase B will start the ticker; Phase D mirrors server. */
    private val _durationSec = MutableStateFlow(0)
    val durationSec: StateFlow<Int> = _durationSec.asStateFlow()

    /** Caller-side wallet balance in coins (server-authoritative; Phase D). 0 when unknown. */
    private val _balanceCoins = MutableStateFlow<Long?>(null)
    val balanceCoins: StateFlow<Long?> = _balanceCoins.asStateFlow()

    /** Per-minute deduction rate (server-provided). Phase D sets this. */
    private val _ratePerMinute = MutableStateFlow(0)
    val ratePerMinute: StateFlow<Int> = _ratePerMinute.asStateFlow()

    /** UI toggles — survive rotation. */
    private val _micEnabled = MutableStateFlow(true)
    val micEnabled: StateFlow<Boolean> = _micEnabled.asStateFlow()

    private val _cameraEnabled = MutableStateFlow(true)
    val cameraEnabled: StateFlow<Boolean> = _cameraEnabled.asStateFlow()

    private val _cameraFront = MutableStateFlow(true)
    val cameraFront: StateFlow<Boolean> = _cameraFront.asStateFlow()

    /** Reason set by the side that initiated the hang-up. Read by end-screen (Phase E). */
    private var _endReason: String? = null
    val endReason: String? get() = _endReason

    // ---- Setters used by the Activity / future phases -------------------

    fun bindIdentity(id: CallIdentity) {
        if (_identity.value == null) _identity.value = id
    }

    fun setState(next: CallState) {
        _state.value = next
    }

    fun setDuration(seconds: Int) {
        _durationSec.value = seconds.coerceAtLeast(0)
    }

    fun setBalance(coins: Long?) {
        _balanceCoins.value = coins
    }

    fun setRatePerMinute(rate: Int) {
        _ratePerMinute.value = rate.coerceAtLeast(0)
    }

    fun toggleMic(): Boolean {
        val next = !_micEnabled.value
        _micEnabled.value = next
        // Phase B will route to localParticipant.setMicrophoneEnabled(next).
        return next
    }

    fun toggleCamera(): Boolean {
        val next = !_cameraEnabled.value
        _cameraEnabled.value = next
        // Phase B will route to localParticipant.setCameraEnabled(next).
        return next
    }

    fun flipCamera() {
        _cameraFront.value = !_cameraFront.value
        // Phase C will route to localParticipant.setCameraPosition(...).
    }

    /** Marks the call as ending with a reason; final teardown happens in [onCleared]. */
    fun markEnding(reason: String) {
        if (_state.value == CallState.ENDED) return
        _endReason = reason
        _state.value = CallState.ENDING
    }

    fun markEnded() {
        _state.value = CallState.ENDED
    }

    override fun onCleared() {
        // Phase B will:
        //   - room?.disconnect()
        //   - room = null
        //   - cancel billing/realtime subscriptions
        // Phase A leaves this empty by design; no resources are held yet.
        super.onCleared()
    }
}
