package com.merilive.app.flutter

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.os.Build
import android.util.Log
import io.flutter.embedding.engine.plugins.FlutterPlugin
import io.flutter.plugin.common.MethodCall
import io.flutter.plugin.common.MethodChannel

/**
 * IncomingCallBridgePlugin — Flutter ↔ native handoff for the ringer.
 *
 * Native → Flutter (MethodChannel `app.merilive/incoming_call`):
 *   • `incoming` — pushed by MeriFirebaseMessagingService for a fresh call
 *     (Dart pre-warms profile / opens ringer page if fg).
 *   • `accept`   — pushed by IncomingCallActivity after user taps Accept.
 *   • `decline`  — pushed by IncomingCallActivity after user taps Decline.
 *   • `cancelled` — pushed by MFMS when caller hangs up mid-ring.
 *
 * Flutter → native:
 *   • `pending` — Dart pulls the last event queued while no engine was
 *     alive. Reads (in order): in-memory `pending` field, then
 *     SharedPreferences `merilive_incoming_pending` (cold-start survivor).
 *   • `dismiss` — Dart resolved the ringer (accept / decline / timeout).
 *     Stops `IncomingCallService` AND broadcasts a dismiss intent so
 *     `IncomingCallActivity` closes if still on top.
 *
 * Cold-start ordering guarantee: MFMS + IncomingCallActivity persist
 * accept/decline into SharedPreferences BEFORE broadcasting, so the very
 * first Dart `pending` call after engine attach always sees the event
 * even if the broadcast fires before the receiver is registered.
 */
class IncomingCallBridgePlugin : FlutterPlugin, MethodChannel.MethodCallHandler {

    companion object {
        private const val TAG = "IncomingCallBridge"
        private const val CHANNEL = "app.merilive/incoming_call"
        const val ACTION_BROADCAST = "com.merilive.app.CALL_ACTION"
        const val ACTION_DISMISS = "com.merilive.app.INCOMING_CALL_DISMISS"

        // Mirrors MeriFirebaseMessagingService constants.
        private const val PREFS = "merilive_incoming_pending"
        private const val KEY_ACTION = "action"
        private const val KEY_CALL_ID = "call_id"
        private const val KEY_CALLER_ID = "caller_id"
        private const val KEY_CALLER_NAME = "caller_name"
        private const val KEY_CALLER_AVATAR = "caller_avatar"
        private const val KEY_CALL_TYPE = "call_type"
        private const val KEY_TS = "ts"

        // Anything older than this is stale and gets dropped.
        private const val STALE_MS = 60_000L
    }

    private var channel: MethodChannel? = null
    private var context: Context? = null
    private var receiver: BroadcastReceiver? = null

    // In-memory queue for broadcasts that arrive while engine is attached
    // but Dart hasn't asked for `pending` yet (extremely rare).
    private var pending: Map<String, Any?>? = null

    override fun onAttachedToEngine(binding: FlutterPlugin.FlutterPluginBinding) {
        context = binding.applicationContext
        channel = MethodChannel(binding.binaryMessenger, CHANNEL).also {
            it.setMethodCallHandler(this)
        }
        registerReceiver(binding.applicationContext)
    }

    override fun onDetachedFromEngine(binding: FlutterPlugin.FlutterPluginBinding) {
        channel?.setMethodCallHandler(null)
        channel = null
        unregisterReceiver()
        context = null
    }

    override fun onMethodCall(call: MethodCall, result: MethodChannel.Result) {
        when (call.method) {
            "pending" -> result.success(readPending())
            "dismiss" -> {
                dismissNativeRinger()
                result.success(true)
            }
            else -> result.notImplemented()
        }
    }

    private fun readPending(): Map<String, Any?>? {
        // Prefer in-memory (freshest), fall back to SharedPreferences.
        pending?.let {
            pending = null
            clearPersistedPending()
            return it
        }
        val ctx = context ?: return null
        return try {
            val prefs = ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
            val callId = prefs.getString(KEY_CALL_ID, null) ?: return null
            val ts = prefs.getLong(KEY_TS, 0L)
            if (ts > 0 && System.currentTimeMillis() - ts > STALE_MS) {
                prefs.edit().clear().apply()
                return null
            }
            val out = mapOf(
                "action" to (prefs.getString(KEY_ACTION, "incoming") ?: "incoming"),
                "call_id" to callId,
                "caller_id" to prefs.getString(KEY_CALLER_ID, null),
                "caller_name" to prefs.getString(KEY_CALLER_NAME, null),
                "caller_avatar" to prefs.getString(KEY_CALLER_AVATAR, null),
                "call_type" to prefs.getString(KEY_CALL_TYPE, "video"),
            )
            prefs.edit().clear().apply()
            out
        } catch (e: Exception) {
            Log.w(TAG, "readPending failed", e)
            null
        }
    }

    private fun clearPersistedPending() {
        try {
            context?.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
                ?.edit()?.clear()?.apply()
        } catch (_: Exception) {}
    }

    private fun dismissNativeRinger() {
        val ctx = context ?: return
        try {
            val stop = Intent().apply {
                setClassName(ctx, "com.merilive.app.service.IncomingCallService")
                action = "com.merilive.app.STOP_CALL"
            }
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                ctx.startForegroundService(stop)
            } else {
                ctx.startService(stop)
            }
        } catch (e: Exception) {
            Log.w(TAG, "stop service failed", e)
        }
        try {
            ctx.sendBroadcast(Intent(ACTION_DISMISS).setPackage(ctx.packageName))
        } catch (_: Exception) {}
        clearPersistedPending()
    }

    private fun registerReceiver(ctx: Context) {
        receiver = object : BroadcastReceiver() {
            override fun onReceive(context: Context?, intent: Intent?) {
                if (intent?.action != ACTION_BROADCAST) return
                val action = intent.getStringExtra("action") ?: "incoming"
                val payload = mapOf(
                    "call_id" to intent.getStringExtra("call_id"),
                    "caller_id" to intent.getStringExtra("caller_id"),
                    "caller_name" to intent.getStringExtra("caller_name"),
                    "caller_avatar" to intent.getStringExtra("caller_avatar"),
                    "call_type" to intent.getStringExtra("call_type"),
                )
                val ch = channel
                if (ch == null) {
                    pending = payload + mapOf("action" to action)
                } else {
                    ch.invokeMethod(action, payload)
                }
            }
        }
        val filter = IntentFilter(ACTION_BROADCAST)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            ctx.registerReceiver(receiver, filter, Context.RECEIVER_NOT_EXPORTED)
        } else {
            @Suppress("UnspecifiedRegisterReceiverFlag")
            ctx.registerReceiver(receiver, filter)
        }
    }

    private fun unregisterReceiver() {
        try {
            receiver?.let { context?.unregisterReceiver(it) }
        } catch (_: Exception) {}
        receiver = null
    }
}
