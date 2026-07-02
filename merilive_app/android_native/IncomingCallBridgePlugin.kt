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
 * M13 — IncomingCallBridgePlugin
 *
 * Flutter ↔ Kotlin bridge for the incoming-call surface.
 *
 * Direction 1 (native → Flutter):
 *   `IncomingCallActivity` sends a system broadcast `com.merilive.app.CALL_ACTION`
 *   with `{action: accept|decline, call_id, caller_id}` whenever the user
 *   taps Accept/Decline on the full-screen ringer (used when the app was
 *   killed / in background). This plugin listens for that broadcast and
 *   invokes `accept` / `decline` on MethodChannel `app.merilive/incoming_call`,
 *   which is picked up by Dart `IncomingCallListener._onNativeCall`.
 *
 *   `MeriFirebaseMessagingService` also forwards a fresh incoming FCM
 *   payload through the same broadcast (action=`incoming`) so a running
 *   Flutter isolate can pre-warm the caller profile fetch in parallel
 *   with the Kotlin `IncomingCallService` spinning up the foreground
 *   notification.
 *
 *   If Flutter isn't attached yet (cold-start via IncomingCallActivity),
 *   the latest broadcast is cached and delivered via `pending`
 *   MethodChannel call issued by Dart on attach.
 *
 * Direction 2 (Flutter → native):
 *   `dismiss` — Dart tells us the ringer resolved (accept/decline/timeout).
 *   We fire `ACTION_STOP_CALL` on `IncomingCallService` so any lingering
 *   foreground notification / full-screen intent is torn down.
 */
class IncomingCallBridgePlugin : FlutterPlugin, MethodChannel.MethodCallHandler {

    companion object {
        private const val TAG = "IncomingCallBridge"
        private const val CHANNEL = "app.merilive/incoming_call"
        const val ACTION_BROADCAST = "com.merilive.app.CALL_ACTION"
    }

    private var channel: MethodChannel? = null
    private var context: Context? = null
    private var receiver: BroadcastReceiver? = null

    // Cached pending event delivered to Flutter on `pending` invocation
    // (cold-start ordering: native fires before Flutter isolate is ready).
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
            "pending" -> {
                val p = pending
                pending = null
                result.success(p)
            }
            "dismiss" -> {
                try {
                    val ctx = context
                    if (ctx != null) {
                        val intent = Intent().apply {
                            setClassName(
                                ctx,
                                "com.merilive.app.service.IncomingCallService",
                            )
                            action = "com.merilive.app.STOP_CALL"
                        }
                        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                            ctx.startForegroundService(intent)
                        } else {
                            ctx.startService(intent)
                        }
                    }
                    result.success(true)
                } catch (e: Exception) {
                    Log.w(TAG, "dismiss failed", e)
                    result.success(false)
                }
            }
            else -> result.notImplemented()
        }
    }

    private fun registerReceiver(ctx: Context) {
        receiver = object : BroadcastReceiver() {
            override fun onReceive(context: Context?, intent: Intent?) {
                if (intent?.action != ACTION_BROADCAST) return
                val payload = mapOf(
                    "call_id" to intent.getStringExtra("call_id"),
                    "caller_id" to intent.getStringExtra("caller_id"),
                    "caller_name" to intent.getStringExtra("caller_name"),
                    "caller_avatar" to intent.getStringExtra("caller_avatar"),
                    "call_type" to intent.getStringExtra("call_type"),
                )
                val action = intent.getStringExtra("action") ?: "incoming"
                val ch = channel
                if (ch == null) {
                    // Flutter not attached yet — cache for `pending` fetch.
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
