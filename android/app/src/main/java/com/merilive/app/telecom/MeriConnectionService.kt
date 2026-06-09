package com.merilive.app.telecom

import android.net.Uri
import android.os.Build
import android.telecom.Connection
import android.telecom.ConnectionRequest
import android.telecom.ConnectionService
import android.telecom.DisconnectCause
import android.telecom.PhoneAccountHandle
import android.telecom.TelecomManager
import android.util.Log
import androidx.annotation.RequiresApi
import com.merilive.app.plugin.NativeCallPlugin
import java.util.concurrent.ConcurrentHashMap
import kotlinx.coroutines.GlobalScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch

/**
 * Pkg208 — Self-Managed ConnectionService.
 *
 * Registers MeriLive calls with the Android Telecom framework so:
 *   • Bluetooth headset Answer / End button taps actually answer or end
 *     the in-app call (otherwise the BT button is swallowed by the
 *     system dialer).
 *   • Calls show up in the system call log.
 *   • The OS routes audio to the right output (BT > wired > speaker)
 *     and pauses media playback while a call is active.
 *   • Wear OS / Android Auto see the call as a first-class telephony
 *     event without us having to write extra integrations.
 *
 * "Self-managed" means we keep our own UI (IncomingCallActivity +
 * heads-up CallStyle notification) — Telecom only handles audio
 * focus + hardware buttons. This is the WhatsApp / Signal pattern.
 *
 * Lifecycle:
 *   1. App boot → NativeCallPlugin.registerPhoneAccount() once.
 *   2. FCM call push arrives → NativeCallPlugin.reportIncomingCall()
 *      → TelecomManager.addNewIncomingCall() → onCreateIncomingConnection
 *      below → MeriConnection instance per call.
 *   3. User taps Accept (in our UI OR on BT headset) → Connection.onAnswer()
 *      fires → dispatches "accept" back into JS via NativeCallPlugin.
 *   4. Call ends → NativeCallPlugin.reportCallEnded() → Connection.setDisconnected.
 */
@RequiresApi(Build.VERSION_CODES.O)
class MeriConnectionService : ConnectionService() {

    companion object {
        private const val TAG = "MeriConnectionService"

        /** Active connections keyed by our internal callId. */
        private val active = ConcurrentHashMap<String, MeriConnection>()

        @JvmStatic
        fun getConnection(callId: String?): MeriConnection? =
            if (callId.isNullOrEmpty()) null else active[callId]

        @JvmStatic
        fun put(callId: String, c: MeriConnection) {
            active[callId] = c
        }

        @JvmStatic
        fun remove(callId: String?) {
            if (!callId.isNullOrEmpty()) active.remove(callId)
        }
    }

    override fun onCreateIncomingConnection(
        connectionManagerPhoneAccount: PhoneAccountHandle?,
        request: ConnectionRequest?,
    ): Connection {
        val extras = request?.extras
        val callId = extras?.getString(TelecomBridge.EXTRA_CALL_ID).orEmpty()
        val callerId = extras?.getString(TelecomBridge.EXTRA_CALLER_ID).orEmpty()
        val callerName = extras?.getString(TelecomBridge.EXTRA_CALLER_NAME) ?: "Caller"
        val callType = extras?.getString(TelecomBridge.EXTRA_CALL_TYPE) ?: "video"

        Log.d(TAG, "onCreateIncomingConnection callId=$callId from=$callerName")

        val conn = MeriConnection(applicationContext, callId, callerId, callerName, callType).apply {
            setRinging()
            setCallerDisplayName(callerName, TelecomManager.PRESENTATION_ALLOWED)
            setAddress(Uri.fromParts("merilive", callerId.ifEmpty { callerName }, null),
                TelecomManager.PRESENTATION_ALLOWED)
            connectionProperties = Connection.PROPERTY_SELF_MANAGED
            audioModeIsVoip = true
            // Telecom hold support — required so OS can pause our VoIP call when a
            // PSTN call comes in (call-waiting) and resume after the PSTN call ends.
            // Some strict OEMs reject HOLD caps for SELF_MANAGED — try/catch keeps
            // the call alive even if the cap is refused (we just lose system-driven
            // hold on that device).
            connectionCapabilities = try {
                Connection.CAPABILITY_MUTE or
                    Connection.CAPABILITY_HOLD or
                    Connection.CAPABILITY_SUPPORT_HOLD
            } catch (_: Throwable) {
                Connection.CAPABILITY_MUTE
            }
        }
        if (callId.isNotEmpty()) put(callId, conn)
        return conn
    }

    override fun onCreateIncomingConnectionFailed(
        connectionManagerPhoneAccount: PhoneAccountHandle?,
        request: ConnectionRequest?,
    ) {
        val callId = request?.extras?.getString(TelecomBridge.EXTRA_CALL_ID).orEmpty()
        Log.w(TAG, "onCreateIncomingConnectionFailed callId=$callId")
        // Honest-private-call fix (C-1): this is system-side rejection (another
        // PSTN call in progress, no PhoneAccount enabled, OEM block) — NOT a
        // user decline. Dispatching "decline" would record a user-initiated
        // rejection on the server. Use a distinct "busy" action so JS can
        // route to the failed-incoming path without billing/penalising the user.
        NativeCallPlugin.dispatch(applicationContext, callId, "", "", "video", "busy")
        remove(callId)
    }

    override fun onCreateOutgoingConnection(
        connectionManagerPhoneAccount: PhoneAccountHandle?,
        request: ConnectionRequest?,
    ): Connection {
        // Self-managed outgoing: JS owns the LiveKit connect flow and will
        // call TelecomBridge.reportConnected() once the callee accepts. We
        // mint a Connection in DIALING, then arm a safety timer so an
        // abandoned dial doesn't sit in Telecom's state machine forever
        // (audit C-3 — previous build never reached setActive on outgoing).
        val extras = request?.extras
        val callId = extras?.getString(TelecomBridge.EXTRA_CALL_ID).orEmpty()
        val callerId = extras?.getString(TelecomBridge.EXTRA_CALLER_ID).orEmpty()
        val callerName = extras?.getString(TelecomBridge.EXTRA_CALLER_NAME) ?: "Calling…"
        val callType = extras?.getString(TelecomBridge.EXTRA_CALL_TYPE) ?: "video"
        val conn = MeriConnection(applicationContext, callId, callerId, callerName, callType).apply {
            setDialing()
            setCallerDisplayName(callerName, TelecomManager.PRESENTATION_ALLOWED)
            connectionProperties = Connection.PROPERTY_SELF_MANAGED
            audioModeIsVoip = true
            connectionCapabilities = try {
                Connection.CAPABILITY_MUTE or
                    Connection.CAPABILITY_HOLD or
                    Connection.CAPABILITY_SUPPORT_HOLD
            } catch (_: Throwable) {
                Connection.CAPABILITY_MUTE
            }
        }
        if (callId.isNotEmpty()) put(callId, conn)
        // C-3: arm a 90s outgoing-dial watchdog. If JS never promotes to
        // ACTIVE (callee never accepts / ringer times out), tear down the
        // Telecom connection cleanly so it doesn't show as "dialing forever"
        // in the system call log or strand audio focus.
        try {
            android.os.Handler(android.os.Looper.getMainLooper()).postDelayed({
                val c = getConnection(callId) ?: return@postDelayed
                if (c.state == Connection.STATE_DIALING) {
                    try { c.setDisconnected(DisconnectCause(DisconnectCause.CANCELED)) } catch (_: Throwable) {}
                    try { c.destroy() } catch (_: Throwable) {}
                    remove(callId)
                    Log.w(TAG, "Outgoing dial watchdog fired — torn down callId=$callId")
                }
            }, 90_000L)
        } catch (_: Throwable) {}
        return conn
    }
}


/**
 * Per-call Connection. Forwards hardware button events (BT headset
 * Answer / End, headset hook) into NativeCallPlugin so they reach JS
 * the same way the in-app Accept / Decline buttons do.
 */
@RequiresApi(Build.VERSION_CODES.O)
class MeriConnection(
    private val ctx: android.content.Context,
    val callId: String,
    val callerId: String,
    val callerName: String,
    val callType: String,
) : Connection() {

    override fun onAnswer() {
        super.onAnswer()
        setActive()
        NativeCallPlugin.dispatch(ctx, callId, callerId, callerName, callType, "accept")
    }

    override fun onAnswer(videoState: Int) {
        // Pkg-audit Tier-3: do NOT call onAnswer() (which calls super.onAnswer())
        // — that would invoke the framework super twice on the same Connection
        // and cycles the Telecom state machine on some OEMs. Inline the work.
        super.onAnswer(videoState)
        setActive()
        NativeCallPlugin.dispatch(ctx, callId, callerId, callerName, callType, "accept")
    }

    override fun onReject() {
        super.onReject()
        setDisconnected(DisconnectCause(DisconnectCause.REJECTED))
        destroy()
        MeriConnectionService.remove(callId)
        NativeCallPlugin.dispatch(ctx, callId, callerId, callerName, callType, "decline")
    }

    override fun onReject(replyMessage: String?) {
        onReject()
    }

    override fun onDisconnect() {
        super.onDisconnect()
        setDisconnected(DisconnectCause(DisconnectCause.LOCAL))
        destroy()
        MeriConnectionService.remove(callId)
        // Pkg-audit Tier-3: this fires when the user hangs up an ALREADY-active
        // call (e.g. BT End button mid-call). Dispatching "decline" here would
        // re-run the reject-path in JS on a connected call. Use "ended" so JS
        // can route to the active-call teardown path instead. JS receives the
        // event via NativeCallPlugin and falls through to its terminal cleanup.
        NativeCallPlugin.dispatch(ctx, callId, callerId, callerName, callType, "ended")
    }

    override fun onAbort() {
        super.onAbort()
        setDisconnected(DisconnectCause(DisconnectCause.CANCELED))
        destroy()
        MeriConnectionService.remove(callId)
    }

    override fun onShowIncomingCallUi() {
        // Self-managed — Android tells us "go show your full-screen UI now".
        // No-op: MeriFirebaseMessagingService already launched
        // IncomingCallActivity + posted the CallStyle notification.
    }

    /**
     * Telecom asks us to hold (typical trigger: a PSTN call comes in while
     * our VoIP call is active — call-waiting). We must:
     *   1) Mark the Connection HELD so the system can route audio to the
     *      other call.
     *   2) Mute local mic + camera so the held call stops uploading media.
     *   3) Notify JS so the in-call UI can reflect the held state.
     * Remote media keeps flowing — LiveKit handles the subscriber side.
     */
    override fun onHold() {
        super.onHold()
        try { setOnHold() } catch (_: Throwable) {}
        try {
            val room = com.merilive.app.rtc.RtcEngineManager.currentRoom()
            val lp = room?.localParticipant
            if (lp != null) {
                kotlinx.coroutines.GlobalScope.launch(kotlinx.coroutines.Dispatchers.Main) {
                    runCatching { lp.setMicrophoneEnabled(false) }
                    if (callType == "video") {
                        runCatching { lp.setCameraEnabled(false) }
                    }
                }
            }
        } catch (_: Throwable) {}
        NativeCallPlugin.dispatch(ctx, callId, callerId, callerName, callType, "hold")
    }

    /**
     * Telecom resumes us after the interrupting call ends or the user manually
     * unholds from system controls. Restore mic (and camera for video calls)
     * and tell JS to re-enable any UI state we toggled on hold.
     */
    override fun onUnhold() {
        super.onUnhold()
        try { setActive() } catch (_: Throwable) {}
        try {
            val room = com.merilive.app.rtc.RtcEngineManager.currentRoom()
            val lp = room?.localParticipant
            if (lp != null) {
                kotlinx.coroutines.GlobalScope.launch(kotlinx.coroutines.Dispatchers.Main) {
                    runCatching { lp.setMicrophoneEnabled(true) }
                    if (callType == "video") {
                        runCatching { lp.setCameraEnabled(true) }
                    }
                }
            }
        } catch (_: Throwable) {}
        NativeCallPlugin.dispatch(ctx, callId, callerId, callerName, callType, "unhold")
    }
}
