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
            // Pkg-audit Tier-3: self-managed connections must NOT advertise
            // CAPABILITY_HOLD / CAPABILITY_SUPPORT_HOLD — Telecom rejects
            // those caps for PROPERTY_SELF_MANAGED on strict AOSP devices
            // (API 28+) with SecurityException. Only CAPABILITY_MUTE is
            // safe here. We don't expose hold to JS anyway.
            connectionCapabilities = Connection.CAPABILITY_MUTE
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
        // Surface as decline so JS state machine ends the call.
        NativeCallPlugin.dispatch(applicationContext, callId, "", "", "video", "decline")
        remove(callId)
    }

    override fun onCreateOutgoingConnection(
        connectionManagerPhoneAccount: PhoneAccountHandle?,
        request: ConnectionRequest?,
    ): Connection {
        // Self-managed outgoing — currently not used (we initiate calls
        // from JS first, then call reportOutgoingCall in Pkg208a). Stub
        // out a basic connection so Telecom doesn't crash if invoked.
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
        }
        if (callId.isNotEmpty()) put(callId, conn)
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
}
