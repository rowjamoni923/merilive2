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

        /** Pkg500 Phase B — broadcast that asks PrivateCallActivity to finish. */
        const val ACTION_CLOSE_PRIVATE_CALL_ACTIVITY =
            "com.merilive.app.ACTION_CLOSE_PRIVATE_CALL_ACTIVITY"

        /** Pkg500 Phase D — JS → PrivateCallActivity billing push. */
        const val ACTION_UPDATE_BILLING =
            "com.merilive.app.ACTION_UPDATE_BILLING"

        /** Pkg500 Phase D — PrivateCallActivity → JS recharge request. */
        const val ACTION_RECHARGE_REQUESTED =
            "com.merilive.app.ACTION_RECHARGE_REQUESTED"

        /** Pkg500 Phase E — PrivateCallEndActivity (or in-call gift btn) → JS. */
        const val ACTION_CALL_END_ACTION =
            "com.merilive.app.ACTION_CALL_END_ACTION"

        /** Pkg500 Phase G — JS → PrivateCallActivity: exit PIP + foreground. */
        const val ACTION_RESUME_PRIVATE_CALL =
            "com.merilive.app.ACTION_RESUME_PRIVATE_CALL"

        /**
         * Phase 2 — PrivateCallActivity → JS: the native in-call window
         * lifecycle (opened / closed). JS listens via the `native-call-window`
         * Capacitor event so React can stop hiding #root once the Activity
         * owns the screen, and re-wake the React side if the user dismisses
         * the Activity without ending the call (system back, force-close).
         * Extras: call_id (String), state (String: "opened" | "closed").
         */
        const val ACTION_PRIVATE_CALL_WINDOW =
            "com.merilive.app.ACTION_PRIVATE_CALL_WINDOW"

        /**
         * Phase 2 helper — fire the window lifecycle broadcast. Activity
         * calls this from onStart / onDestroy; the plugin re-emits as a
         * Capacitor event to JS listeners.
         */
        @JvmStatic
        fun broadcastWindowState(ctx: Context?, callId: String?, state: String) {
            val c = ctx ?: return
            try {
                val i = android.content.Intent(ACTION_PRIVATE_CALL_WINDOW).apply {
                    setPackage(c.packageName)
                    putExtra("call_id", callId ?: "")
                    putExtra("state", state)
                }
                c.sendBroadcast(i)
            } catch (_: Throwable) {}
        }

        @JvmStatic
        fun stopCallForegroundService(ctx: Context?) {
            val c = ctx ?: return
            try {
                val i = android.content.Intent(c, com.merilive.app.service.CallForegroundService::class.java).apply {
                    action = com.merilive.app.service.CallForegroundService.ACTION_STOP
                }
                c.startService(i)
            } catch (_: Throwable) {}
        }



        // Pending actions queued before JS attaches a listener (cold-start).
        private val pending = ConcurrentLinkedQueue<JSONObject>()

        // Pkg-audit fix: real dedup state for acknowledgeAction(). FCM
        // duplicate delivery (two pushes for same call) previously slipped
        // through because acknowledgeAction was a no-op.
        private val ackedActions = java.util.concurrent.ConcurrentHashMap<String, Long>()
        private const val ACK_TTL_MS = 10 * 60 * 1000L // 10 minutes

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
            // Pkg-audit fix: real dedup — FCM can deliver the same intent twice
            // (notification action + activity button race, retry on poor net).
            // Drop if we've already acked this (callId,action) pair recently.
            // Honest-private-call fix (X-1): never dedup the "presented" action.
            // IncomingCallActivity.onNewIntent re-fires "presented" when a new
            // call replaces an existing one in the same task, and the JS
            // countdown depends on receiving every "presented" to re-anchor
            // the timeout. Other actions (accept/decline/ended/timeout/busy)
            // remain deduped to defend against double FCM delivery.
            val cid = callId ?: ""
            if (cid.isNotEmpty() && action.isNotEmpty() && action != "presented") {
                val now = System.currentTimeMillis()
                // Opportunistic eviction of stale entries.
                val it = ackedActions.entries.iterator()
                while (it.hasNext()) {
                    val e = it.next()
                    if (now - e.value > ACK_TTL_MS) it.remove()
                }
                val key = "$cid:$action"
                val prev = ackedActions.putIfAbsent(key, now)
                if (prev != null) {
                    // Duplicate within TTL — collapse silently.
                    return
                }
            }


            val payload = JSONObject().apply {
                put("callId", cid)
                put("callerId", callerId ?: "")
                put("callerName", callerName ?: "")
                put("callType", callType ?: "video")
                put("action", action)
                put("ts", System.currentTimeMillis())
            }

            // Only queue when no live listener exists OR live delivery failed —
            // never both (would replay accepted actions on cold-start drain).
            val plugin = INSTANCE
            if (plugin != null) {
                try {
                    plugin.notifyListeners("call-action", JSObject.fromJSONObject(payload), true)
                    return
                } catch (_: Exception) {
                    // fall through to queue as safety net
                }
            }
            pending.offer(payload)
            trim()
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
        // Pkg-audit fix: do NOT auto-flush on load() — Capacitor's retain
        // buffer only holds events until ANY listener attaches (for any event
        // name), so flushing here can be consumed by an unrelated listener and
        // lost. Keep events in `pending`; JS drains them explicitly via
        // getLastAction() once usePrivateCall has mounted its listener.
        registerRechargeReceiver()
        registerCallEndActionReceiver()
        registerWindowStateReceiver()
    }


    override fun handleOnDestroy() {
        super.handleOnDestroy()
        rechargeReceiver?.let { runCatching { context.unregisterReceiver(it) } }
        rechargeReceiver = null
        callEndActionReceiver?.let { runCatching { context.unregisterReceiver(it) } }
        callEndActionReceiver = null
        windowStateReceiver?.let { runCatching { context.unregisterReceiver(it) } }
        windowStateReceiver = null
        if (INSTANCE === this) INSTANCE = null
    }

    // Pkg500 Phase D — listen for in-call Recharge taps from PrivateCallActivity
    // and forward to JS via the `recharge-requested` Capacitor event so the
    // existing recharge sheet can open behind the call surface.
    private var rechargeReceiver: android.content.BroadcastReceiver? = null
    private fun registerRechargeReceiver() {
        if (rechargeReceiver != null) return
        val r = object : android.content.BroadcastReceiver() {
            override fun onReceive(ctx: Context?, intent: android.content.Intent?) {
                val callId = intent?.getStringExtra("call_id").orEmpty()
                val payload = JSObject()
                payload.put("callId", callId)
                payload.put("ts", System.currentTimeMillis())
                try { notifyListeners("recharge-requested", payload, true) } catch (_: Throwable) {}
            }
        }
        val filter = android.content.IntentFilter(ACTION_RECHARGE_REQUESTED)
        try {
            if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.TIRAMISU) {
                context.registerReceiver(r, filter, Context.RECEIVER_NOT_EXPORTED)
            } else {
                @Suppress("UnspecifiedRegisterReceiverFlag")
                context.registerReceiver(r, filter)
            }
            rechargeReceiver = r
        } catch (_: Throwable) {}
    }

    // Pkg500 Phase E — PrivateCallEndActivity emits gift / recharge / rate /
    // close / wallet / go_live / gift_inline. Forward to JS as a single
    // `call-end-action` event so the existing in-app sheets can open behind.
    private var callEndActionReceiver: android.content.BroadcastReceiver? = null
    private fun registerCallEndActionReceiver() {
        if (callEndActionReceiver != null) return
        val r = object : android.content.BroadcastReceiver() {
            override fun onReceive(ctx: Context?, intent: android.content.Intent?) {
                intent ?: return
                val payload = JSObject()
                payload.put("callId", intent.getStringExtra("call_id").orEmpty())
                payload.put("peerId", intent.getStringExtra("peer_id").orEmpty())
                payload.put("action", intent.getStringExtra("action").orEmpty())
                if (intent.hasExtra("rating")) {
                    payload.put("rating", intent.getIntExtra("rating", 0))
                }
                payload.put("ts", System.currentTimeMillis())
                try { notifyListeners("call-end-action", payload, true) } catch (_: Throwable) {}
            }
        }
        val filter = android.content.IntentFilter(ACTION_CALL_END_ACTION)
        try {
            if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.TIRAMISU) {
                context.registerReceiver(r, filter, Context.RECEIVER_NOT_EXPORTED)
            } else {
                @Suppress("UnspecifiedRegisterReceiverFlag")
                context.registerReceiver(r, filter)
            }
            callEndActionReceiver = r
        } catch (_: Throwable) {}
    }

    /**
     * Phase 2 — bridge PrivateCallActivity window lifecycle into JS via the
     * `native-call-window` Capacitor event. CallProvider listens and toggles
     * the React-side overlay state in lockstep so the WebView never argues
     * with the native Activity over the visible call surface.
     */
    private var windowStateReceiver: android.content.BroadcastReceiver? = null
    private fun registerWindowStateReceiver() {
        if (windowStateReceiver != null) return
        val r = object : android.content.BroadcastReceiver() {
            override fun onReceive(ctx: Context?, intent: android.content.Intent?) {
                intent ?: return
                val payload = JSObject()
                payload.put("callId", intent.getStringExtra("call_id").orEmpty())
                payload.put("state", intent.getStringExtra("state").orEmpty())
                payload.put("ts", System.currentTimeMillis())
                try { notifyListeners("native-call-window", payload, true) } catch (_: Throwable) {}
            }
        }
        val filter = android.content.IntentFilter(ACTION_PRIVATE_CALL_WINDOW)
        try {
            if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.TIRAMISU) {
                context.registerReceiver(r, filter, Context.RECEIVER_NOT_EXPORTED)
            } else {
                @Suppress("UnspecifiedRegisterReceiverFlag")
                context.registerReceiver(r, filter)
            }
            windowStateReceiver = r
        } catch (_: Throwable) {}
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
        // Pkg-audit fix: actually record the ack so a subsequent dispatch with
        // the same (callId,action) is dropped at the source (see dispatch()).
        val callId = call.getString("callId") ?: ""
        val action = call.getString("action") ?: ""
        if (callId.isNotEmpty() && action.isNotEmpty()) {
            ackedActions["$callId:$action"] = System.currentTimeMillis()
        }
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
        val keepTelecomAlive = reason == "accepted" || reason == "answered"
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
        // Pkg208 — also tear down the Telecom Connection when the incoming call
        // is truly over. Section#5 pass-4: do NOT tear it down for accepted
        // calls; JS only wants to dismiss the heads-up/full-screen UI while the
        // self-managed Telecom call continues for BT audio + call log lifecycle.
        if (!keepTelecomAlive && android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.O) {
            try { com.merilive.app.telecom.TelecomBridge.reportEnded(callId, remote = false) } catch (_: Throwable) {}
        }
        if (!keepTelecomAlive) stopCallForegroundService(context)
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
        stopCallForegroundService(context)
        val ret = JSObject()
        ret.put("ok", true)
        ret.put("callId", callId)
        call.resolve(ret)
    }

    /**
     * Pkg211 — outgoing call: push into Telecom so caller-side BT End,
     * audio routing, and system call log work. Idempotent + safe (no-op
     * on pre-O / unsupported devices).
     */
    @PluginMethod
    fun reportOutgoingCall(call: PluginCall) {
        val callId = call.getString("callId") ?: ""
        val calleeId = call.getString("calleeId") ?: ""
        val calleeName = call.getString("calleeName") ?: "Calling…"
        val callType = call.getString("callType") ?: "video"
        val ok = if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.O) {
            try {
                com.merilive.app.telecom.TelecomBridge.placeOutgoing(
                    context, callId, calleeId, calleeName, callType
                )
            } catch (_: Throwable) { false }
        } else false
        val ret = JSObject()
        ret.put("reported", ok)
        ret.put("callId", callId)
        call.resolve(ret)
    }

    // ---- Pkg500 Phase B — Native PrivateCallActivity launcher --------------

    /**
     * Returns whether this APK has the native [com.merilive.app.activity.PrivateCallActivity].
     * JS uses this to decide whether to open the native in-call surface or
     * fall back to the existing web `/call/active` screen. Older APKs always
     * return false so they keep the web path.
     */
    @PluginMethod
    fun hasInCallActivity(call: PluginCall) {
        val ret = JSObject()
        // Owner directive: after Accept the user must stay inside the premium
        // React ActiveCallScreen.  The old native PrivateCallActivity looked
        // like an OEM/third-party call screen and hid chat/gifts, so never
        // advertise it to JS even if the class still ships for backward-safe
        // cleanup broadcasts.
        ret.put("available", false)
        call.resolve(ret)
    }

    /**
     * Launch the native PrivateCallActivity. Caller MUST have already
     * connected LiveKitPlugin to the call room — the Activity adopts the
     * existing Room via RtcEngineManager rather than opening its own
     * Camera2 (single-camera contract, Pkg416). If no Room is active, the
     * Activity bails out immediately and the JS web fallback keeps working.
     *
     * Required params:
     *   callId        String
     *   peerId        String  — peer's profile id
     *   peerName      String
     *   peerAvatar    String? — optional URL
     *   isCaller      Boolean — true on caller side, false on host side
     *   livekitUrl    String  — passed for telemetry / restart only
     *   livekitToken  String  — passed for telemetry / restart only
     */
    @PluginMethod
    fun openInCallActivity(call: PluginCall) {
        val callId = call.getString("callId").orEmpty()
        val peerId = call.getString("peerId").orEmpty()
        val peerName = call.getString("peerName") ?: "Calling…"
        val peerAvatar = call.getString("peerAvatar")
        val isCaller = call.getBoolean("isCaller") ?: true
        val livekitUrl = call.getString("livekitUrl").orEmpty()
        val livekitToken = call.getString("livekitToken").orEmpty()

        if (callId.isEmpty() || peerId.isEmpty() || livekitUrl.isEmpty() || livekitToken.isEmpty()) {
            call.reject("missing_required_params")
            return
        }
        try {
            // Honest-private-call fix (PA-1): start CallForegroundService
            // BEFORE launching PrivateCallActivity. On Android 10+ a non-
            // Activity context (this plugin call may originate while the
            // WebView is backgrounded by Capacitor) cannot start an Activity
            // without a foreground-service exemption. Starting the FGS first
            // grants that exemption AND keeps the LiveKit Room/audio focus
            // alive if the user backgrounds the call.
            try {
                val fgsIntent = android.content.Intent(context,
                    com.merilive.app.service.CallForegroundService::class.java).apply {
                    action = com.merilive.app.service.CallForegroundService.ACTION_START
                    putExtra("call_id", callId)
                    putExtra("caller_id", peerId)
                    putExtra("caller_name", peerName)
                    putExtra("caller_avatar", peerAvatar ?: "")
                    putExtra("call_type", "video")
                    putExtra("mode", "call")
                }
                if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.O) {
                    context.startForegroundService(fgsIntent)
                } else {
                    context.startService(fgsIntent)
                }
            } catch (t: Throwable) {
                android.util.Log.w("NativeCallPlugin",
                    "CallForegroundService start failed (BAL exemption may be lost): ${t.message}")
            }

            val ret = JSObject()
            ret.put("opened", false)
            ret.put("callId", callId)
            ret.put("reason", "react_call_ui_only")
            call.resolve(ret)
        } catch (t: Throwable) {
            call.reject("open_failed: ${t.message}")
        }
    }


    /**
     * Broadcast a request for the active PrivateCallActivity to finish
     * itself (server says call ended, peer hung up via web, etc). The
     * Activity listens for this and calls finishAndRemoveTask().
     */
    @PluginMethod
    fun closeInCallActivity(call: PluginCall) {
        val callId = call.getString("callId").orEmpty()
        try {
            val i = android.content.Intent(ACTION_CLOSE_PRIVATE_CALL_ACTIVITY).apply {
                setPackage(context.packageName)
                putExtra("call_id", callId)
            }
            context.sendBroadcast(i)
        } catch (_: Throwable) {}
        stopCallForegroundService(context)
        val ret = JSObject()
        ret.put("ok", true)
        call.resolve(ret)
    }

    /**
     * Pkg500 Phase G — bring the existing PrivateCallActivity back to the
     * foreground after an inline sheet (gift / recharge) opened in the
     * WebView. Broadcasts ACTION_RESUME_PRIVATE_CALL; the Activity
     * receives it and calls moveTaskToFront / exits PIP. Safe no-op when
     * no PrivateCallActivity is running.
     */
    @PluginMethod
    fun resumeInCallActivity(call: PluginCall) {
        try {
            val i = android.content.Intent(ACTION_RESUME_PRIVATE_CALL).apply {
                setPackage(context.packageName)
            }
            context.sendBroadcast(i)
        } catch (_: Throwable) {}
        val ret = JSObject()
        ret.put("ok", true)
        call.resolve(ret)
    }

    /**
     * Pkg500 Phase D — push the latest billing snapshot into the active
     * PrivateCallActivity. JS calls this every time the server bills
     * another minute, the caller recharges, or `viewer_rate_per_min`
     * changes mid-call. Activity stores the values + ticks down 1Hz
     * locally between pushes.
     *
     *   callId          String  — must match the active call
     *   balance         Long    — current caller wallet balance in coins
     *   ratePerMinute   Int     — coins charged per minute
     */
    @PluginMethod
    fun updateInCallBilling(call: PluginCall) {
        val callId = call.getString("callId").orEmpty()
        val balance = call.getLong("balance") ?: -1L
        val rate = call.getInt("ratePerMinute") ?: -1
        if (balance < 0 || rate < 0) {
            call.reject("missing_or_invalid_params")
            return
        }
        try {
            val i = android.content.Intent(ACTION_UPDATE_BILLING).apply {
                setPackage(context.packageName)
                putExtra("call_id", callId)
                putExtra("balance", balance)
                putExtra("rate_per_minute", rate)
            }
            context.sendBroadcast(i)
        } catch (_: Throwable) {}
        val ret = JSObject()
        ret.put("ok", true)
        call.resolve(ret)
    }

    /**
     * Pkg501 safety bridge — JS mirrors incoming call chat here when the native
     * call Activity covers the WebView. This APK has no native chat composer UI
     * yet, so return ok=false instead of throwing "method not implemented";
     * React falls back to the existing WebView chat overlay.
     */
    @PluginMethod
    fun pushChatMessage(call: PluginCall) {
        val ret = JSObject()
        ret.put("ok", false)
        ret.put("reason", "native_chat_ui_unavailable")
        call.resolve(ret)
    }
}




