package com.merilive.app.plugin

import android.content.Context
import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin
import org.json.JSONObject
import java.util.concurrent.ConcurrentLinkedQueue

/**
 * NativeCallPlugin — Step 31.
 *
 * CallKit-style bridge between the native incoming-call surface
 * (full-screen IncomingCallActivity + heads-up notification) and the
 * JS layer. Three concerns:
 *
 *  1. Forward user actions (accept / decline / timeout / dismissed)
 *     from the Activity + BroadcastReceiver into JS as a single
 *     `call-action` event so the existing usePrivateCall hook can
 *     resolve the call deterministically without polling Supabase.
 *
 *  2. Buffer actions that fire BEFORE JS subscribes (cold-start path:
 *     user taps Accept on the lock screen → MainActivity boots → JS
 *     loads → only then can it `addListener`). Actions are stored in
 *     a static queue and flushed on the first listener attach.
 *
 *  3. Expose `endIncomingUi({callId})` so JS can dismiss the heads-up
 *     notification + finish() the IncomingCallActivity once the call
 *     is settled (caller cancelled, picked up on another device, etc).
 *
 * JS API (see src/plugins/NativeCall.ts):
 *   getLastAction()                  — drain pending actions
 *   acknowledgeAction({callId,action})
 *   endIncomingUi({callId, reason?}) — dismiss notification + activity
 *
 * Events emitted to JS:
 *   "call-action" { callId, callerId, callerName, callType, action, ts }
 *     where action ∈ "accept" | "decline" | "timeout" | "dismissed" | "presented"
 */
@CapacitorPlugin(name = "NativeCall")
class NativeCallPlugin : Plugin() {

    companion object {
        private const val TAG = "NativeCallPlugin"

        // Pending actions queued before JS attaches a listener (cold-start).
        private val pending = ConcurrentLinkedQueue<JSONObject>()

        @Volatile
        private var INSTANCE: NativeCallPlugin? = null

        @JvmStatic
        fun dispatch(
            ctx: Context?,
            callId: String?,
            callerId: String?,
            callerName: String?,
            callType: String?,
            action: String,
        ) {
            val payload = JSONObject().apply {
                put("callId", callId ?: "")
                put("callerId", callerId ?: "")
                put("callerName", callerName ?: "")
                put("callType", callType ?: "video")
                put("action", action)
                put("ts", System.currentTimeMillis())
            }
            pending.offer(payload)
            trim()

            val plugin = INSTANCE
            if (plugin != null) {
                try {
                    plugin.notifyListeners("call-action", JSObject.fromJSONObject(payload), true)
                    return
                } catch (_: Exception) {}
            }
        }

        /** Cap the queue so we don't OOM if many calls fire while app is dead. */
        private const val MAX_PENDING = 32

        @JvmStatic
        fun trim() {
            while (pending.size > MAX_PENDING) pending.poll()
        }
    }

    override fun load() {
        super.load()
        INSTANCE = this
        flushPending()
    }

    override fun handleOnDestroy() {
        super.handleOnDestroy()
        if (INSTANCE === this) INSTANCE = null
    }

    private fun flushPending() {
        if (pending.isEmpty()) return
        try {
            while (true) {
                val next = pending.poll() ?: break
                notifyListeners("call-action", JSObject.fromJSONObject(next), true)
            }
        } catch (_: Exception) {}
    }

    @PluginMethod
    fun isAvailable(call: PluginCall) {
        val ret = JSObject()
        ret.put("available", true)
        ret.put("backend", "android-callkit-style")
        call.resolve(ret)
    }

    /**
     * Drain and return any actions that fired before JS could attach a
     * listener. Useful as a fallback at app start: call once after
     * mounting your CallProvider.
     */
    @PluginMethod
    fun getLastAction(call: PluginCall) {
        val arr = org.json.JSONArray()
        while (true) {
            val n = pending.poll() ?: break
            arr.put(n)
        }
        val ret = JSObject()
        ret.put("actions", arr)
        call.resolve(ret)
    }

    /**
     * Mark an action as handled so any duplicate native dispatch (e.g.
     * notification action + activity button race) is collapsed in JS.
     * Pure book-keeping; native side has no extra state to clear.
     */
    @PluginMethod
    fun acknowledgeAction(call: PluginCall) {
        val ret = JSObject()
        ret.put("ack", true)
        call.resolve(ret)
    }

    /**
     * Dismiss the heads-up call notification + finish any visible
     * IncomingCallActivity. JS calls this when the call is resolved
     * server-side (caller cancelled, answered on another device,
     * 30 s timeout already settled, etc).
     */
    @PluginMethod
    fun endIncomingUi(call: PluginCall) {
        val callId = call.getString("callId") ?: ""
        val reason = call.getString("reason") ?: "ended"
        try {
            val nm = context.getSystemService(Context.NOTIFICATION_SERVICE)
                as? android.app.NotificationManager
            nm?.cancel(com.merilive.app.util.NotificationHelper.NOTIFICATION_CALL)
        } catch (_: Exception) {}
        try {
            val intent = android.content.Intent("com.merilive.app.ACTION_END_INCOMING_UI")
            intent.setPackage(context.packageName)
            intent.putExtra("call_id", callId)
            intent.putExtra("reason", reason)
            context.sendBroadcast(intent)
        } catch (_: Exception) {}
        // Pkg208 — also tear down the Telecom Connection so the system
        // call log / audio focus is released even if the user dismissed
        // from JS without going through the receiver.
        if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.O) {
            try { com.merilive.app.telecom.TelecomBridge.reportEnded(callId, remote = false) } catch (_: Throwable) {}
        }
        val ret = JSObject()
        ret.put("dismissed", true)
        ret.put("callId", callId)
        call.resolve(ret)
    }

    // ---- Pkg208 — Self-managed ConnectionService bridge ----------------

    /** Whether the device + API level support Telecom self-managed calls. */
    @PluginMethod
    fun isTelecomSupported(call: PluginCall) {
        val ret = JSObject()
        ret.put("supported", com.merilive.app.telecom.TelecomBridge.isSupported())
        call.resolve(ret)
    }

    /**
     * Idempotent — registers our SELF_MANAGED PhoneAccount with the OS
     * once. Returns `{registered:true}` if Telecom accepted it (or it
     * was already registered).
     */
    @PluginMethod
    fun registerPhoneAccount(call: PluginCall) {
        val ok = com.merilive.app.telecom.TelecomBridge.ensurePhoneAccount(context)
        val ret = JSObject()
        ret.put("registered", ok)
        ret.put("supported", com.merilive.app.telecom.TelecomBridge.isSupported())
        call.resolve(ret)
    }

    /**
     * Push an incoming call into the Telecom framework so BT headset
     * buttons + system call log + OS audio routing kick in. Our own
     * heads-up notification + IncomingCallActivity remain the visible
     * surface (self-managed).
     */
    @PluginMethod
    fun reportIncomingCall(call: PluginCall) {
        val callId = call.getString("callId") ?: ""
        val callerId = call.getString("callerId") ?: ""
        val callerName = call.getString("callerName") ?: "Caller"
        val callType = call.getString("callType") ?: "video"
        val ok = com.merilive.app.telecom.TelecomBridge.reportIncoming(
            context, callId, callerId, callerName, callType
        )
        val ret = JSObject()
        ret.put("reported", ok)
        ret.put("callId", callId)
        call.resolve(ret)
    }

    /** Mark the active Telecom connection as connected (call answered + media flowing). */
    @PluginMethod
    fun reportCallConnected(call: PluginCall) {
        val callId = call.getString("callId") ?: ""
        if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.O) {
            try { com.merilive.app.telecom.TelecomBridge.reportConnected(callId) } catch (_: Throwable) {}
        }
        val ret = JSObject()
        ret.put("ok", true)
        ret.put("callId", callId)
        call.resolve(ret)
    }

    /** Tear down the Telecom connection — releases audio focus + closes the system call log entry. */
    @PluginMethod
    fun reportCallEnded(call: PluginCall) {
        val callId = call.getString("callId") ?: ""
        val remote = call.getBoolean("remote") ?: false
        if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.O) {
            try { com.merilive.app.telecom.TelecomBridge.reportEnded(callId, remote) } catch (_: Throwable) {}
        }
        val ret = JSObject()
        ret.put("ok", true)
        ret.put("callId", callId)
        call.resolve(ret)
    }
}

