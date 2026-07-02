package com.merilive.app.service

import android.annotation.SuppressLint
import android.app.ActivityManager
import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.os.Build
import android.util.Log
import androidx.core.app.NotificationCompat
import com.google.firebase.messaging.FirebaseMessagingService
import com.google.firebase.messaging.RemoteMessage
import com.merilive.app.MainActivity
import com.merilive.app.R
import java.net.HttpURLConnection
import java.net.URL

/**
 * MeriFirebaseMessagingService — Android push router.
 *
 * Incoming-call semantics (locked 2026-07-02):
 *
 *  • `incoming_call` (data-only) — payload arrives whether app is fg / bg /
 *    killed. We ALWAYS broadcast `com.merilive.app.CALL_ACTION` with
 *    `action=incoming` so a live Flutter isolate (IncomingCallBridgePlugin)
 *    can pre-warm the caller-profile fetch. We ALSO persist the payload
 *    into `merilive_incoming_pending` SharedPreferences so a cold-started
 *    Flutter engine can pull it via the `pending` MethodChannel call.
 *
 *    – If app is FOREGROUND: skip the native foreground service + full-screen
 *      activity. Dart-side ringer page owns the UX (no double ringer).
 *    – If app is BACKGROUND / KILLED: start `IncomingCallService` which fires
 *      the WhatsApp-style full-screen intent.
 *
 *  • `call_cancelled` / `call_ended` — broadcast + stop the native service
 *    + tell IncomingCallActivity to `finish()` so a caller-hangup while
 *    ringing tears everything down instantly (Chamet parity).
 *
 * All other notification types fall through to Chamet-style small
 * notifications with route deep-links.
 */
class MeriFirebaseMessagingService : FirebaseMessagingService() {

    companion object {
        private const val TAG = "MeriLiveFCM"

        private const val CHANNEL_CALL = "merilive_call_channel"
        private const val CHANNEL_MESSAGES = "merilive_messages"
        private const val CHANNEL_GIFTS = "merilive_gifts"
        private const val CHANNEL_STREAM = "merilive_stream"
        private const val CHANNEL_ADMIN = "merilive_admin"
        private const val CHANNEL_SYSTEM = "merilive_system"

        const val BROADCAST_ACTION = "com.merilive.app.CALL_ACTION"
        const val PENDING_PREFS = "merilive_incoming_pending"
        const val PENDING_KEY_ACTION = "action"
        const val PENDING_KEY_CALL_ID = "call_id"
        const val PENDING_KEY_CALLER_ID = "caller_id"
        const val PENDING_KEY_CALLER_NAME = "caller_name"
        const val PENDING_KEY_CALLER_AVATAR = "caller_avatar"
        const val PENDING_KEY_CALL_TYPE = "call_type"
        const val PENDING_KEY_TS = "ts"
    }

    override fun onCreate() {
        super.onCreate()
        createAllNotificationChannels()
    }

    override fun onNewToken(token: String) {
        super.onNewToken(token)
        Log.d(TAG, "New FCM token (Flutter will upsert on next attach)")
    }

    override fun onMessageReceived(message: RemoteMessage) {
        super.onMessageReceived(message)
        val data = message.data
        val type = data["type"] ?: data["event_type"] ?: "general"
        Log.d(TAG, "FCM received: type=$type")

        when (type) {
            "incoming_call" -> handleIncomingCall(data)
            "call_cancelled", "call_ended", "call_declined", "call_missed" ->
                handleCallTerminated(data)
            "new_message", "chat_message" -> showMessageNotification(data)
            "gift_received" -> showGiftNotification(data)
            "new_follower" -> showFollowerNotification(data)
            "stream_started", "live_started" -> showStreamNotification(data)
            "host_application_update" -> showHostApplicationNotification(data)
            "agency_update" -> showAgencyNotification(data)
            "withdrawal_update" -> showWithdrawalNotification(data)
            "admin_broadcast", "admin_notice" -> showAdminNotification(data)
            "party_invite" -> showPartyNotification(data)
            "wallet_update" -> showWalletNotification(data)
            else -> showGeneralNotification(data, message.notification)
        }
    }

    // ═══════════════════════════════════════════
    // INCOMING CALL — foreground-aware, cold-start safe
    // ═══════════════════════════════════════════

    private fun handleIncomingCall(data: Map<String, String>) {
        val callId = data["call_id"] ?: return
        Log.d(TAG, "📞 Incoming call $callId from: ${data["caller_name"]}")

        // (1) Persist for cold-start Bridge pickup.
        writePending("incoming", data)

        // (2) Broadcast for live isolate (foreground OR warm background).
        val broadcast = Intent(BROADCAST_ACTION).apply {
            setPackage(packageName)
            putExtra("action", "incoming")
            putExtra(PENDING_KEY_CALL_ID, callId)
            putExtra(PENDING_KEY_CALLER_ID, data["caller_id"])
            putExtra(PENDING_KEY_CALLER_NAME, data["caller_name"])
            putExtra(PENDING_KEY_CALLER_AVATAR, data["caller_avatar"])
            putExtra(PENDING_KEY_CALL_TYPE, data["call_type"] ?: "video")
        }
        sendBroadcast(broadcast)

        // (3) If app is foreground → Dart owns UI, don't fire native ringer.
        if (isAppForeground()) {
            Log.d(TAG, "App foreground — skipping native full-screen (Dart handles).")
            return
        }

        // (4) Background / killed → WhatsApp-style native ringer.
        val serviceIntent = Intent(this, IncomingCallService::class.java).apply {
            action = IncomingCallService.ACTION_START_CALL
            putExtra("call_id", callId)
            putExtra("caller_name", data["caller_name"] ?: "Unknown")
            putExtra("caller_avatar", data["caller_avatar"])
            putExtra("caller_id", data["caller_id"])
            putExtra("call_type", data["call_type"] ?: "video")
        }
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            startForegroundService(serviceIntent)
        } else {
            startService(serviceIntent)
        }
    }

    private fun handleCallTerminated(data: Map<String, String>) {
        val callId = data["call_id"] ?: return
        Log.d(TAG, "☎️ Call terminated → tearing down ringer for $callId")

        // Clear any stale pending record for this callId.
        clearPendingIfMatches(callId)

        // Broadcast to bridge (Dart will dismiss ringer page + mark ended).
        sendBroadcast(Intent(BROADCAST_ACTION).apply {
            setPackage(packageName)
            putExtra("action", "cancelled")
            putExtra(PENDING_KEY_CALL_ID, callId)
        })

        // Stop native service + activity.
        val stopIntent = Intent(this, IncomingCallService::class.java).apply {
            action = IncomingCallService.ACTION_STOP_CALL
            putExtra("call_id", callId)
        }
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                startForegroundService(stopIntent)
            } else {
                startService(stopIntent)
            }
        } catch (_: Exception) {
            stopService(stopIntent)
        }

        // Ask IncomingCallActivity to finish (handled by activity's own receiver).
        sendBroadcast(Intent("com.merilive.app.INCOMING_CALL_DISMISS").apply {
            setPackage(packageName)
            putExtra(PENDING_KEY_CALL_ID, callId)
        })
    }

    private fun writePending(action: String, data: Map<String, String>) {
        try {
            val prefs = getSharedPreferences(PENDING_PREFS, Context.MODE_PRIVATE)
            prefs.edit()
                .putString(PENDING_KEY_ACTION, action)
                .putString(PENDING_KEY_CALL_ID, data["call_id"])
                .putString(PENDING_KEY_CALLER_ID, data["caller_id"])
                .putString(PENDING_KEY_CALLER_NAME, data["caller_name"])
                .putString(PENDING_KEY_CALLER_AVATAR, data["caller_avatar"])
                .putString(PENDING_KEY_CALL_TYPE, data["call_type"] ?: "video")
                .putLong(PENDING_KEY_TS, System.currentTimeMillis())
                .apply()
        } catch (e: Exception) {
            Log.w(TAG, "writePending failed", e)
        }
    }

    private fun clearPendingIfMatches(callId: String) {
        try {
            val prefs = getSharedPreferences(PENDING_PREFS, Context.MODE_PRIVATE)
            if (prefs.getString(PENDING_KEY_CALL_ID, null) == callId) {
                prefs.edit().clear().apply()
            }
        } catch (_: Exception) {}
    }

    private fun isAppForeground(): Boolean {
        return try {
            val am = getSystemService(Context.ACTIVITY_SERVICE) as? ActivityManager
                ?: return false
            val processes = am.runningAppProcesses ?: return false
            val myPkg = packageName
            processes.any {
                it.processName == myPkg &&
                    it.importance == ActivityManager.RunningAppProcessInfo.IMPORTANCE_FOREGROUND
            }
        } catch (_: Exception) {
            false
        }
    }

    // ═══════════════════════════════════════════
    // NON-CALL NOTIFICATION BUILDERS (unchanged behaviour)
    // ═══════════════════════════════════════════

    private fun showMessageNotification(data: Map<String, String>) {
        val senderName = data["sender_name"] ?: data["title"] ?: "New Message"
        val messageText = data["message"] ?: data["body"] ?: "You have a new message"
        val route = data["route"] ?: data["navigate_to"] ?: "/chat"
        showNotification(CHANNEL_MESSAGES, senderName, messageText, route,
            data["sender_avatar"],
            (data["conversation_id"] ?: data["sender_id"] ?: "msg").hashCode())
    }

    private fun showGiftNotification(data: Map<String, String>) {
        val senderName = data["sender_name"] ?: "Someone"
        val giftName = data["gift_name"] ?: "a gift"
        showNotification(CHANNEL_GIFTS, "🎁 Gift Received!", "$senderName sent you $giftName",
            data["route"] ?: "/profile", null, System.currentTimeMillis().toInt())
    }

    private fun showFollowerNotification(data: Map<String, String>) {
        val followerName = data["follower_name"] ?: data["sender_name"] ?: "Someone"
        showNotification(CHANNEL_SYSTEM, "👤 New Follower", "$followerName started following you",
            data["route"] ?: "/profile", data["follower_avatar"],
            (data["follower_id"] ?: "follower").hashCode())
    }

    private fun showStreamNotification(data: Map<String, String>) {
        val hostName = data["host_name"] ?: data["sender_name"] ?: "Someone"
        showNotification(CHANNEL_STREAM, "🔴 Live Now!", "$hostName is now live",
            data["route"] ?: data["navigate_to"] ?: "/", null,
            (data["stream_id"] ?: "stream").hashCode())
    }

    private fun showHostApplicationNotification(data: Map<String, String>) {
        showNotification(CHANNEL_SYSTEM, data["title"] ?: "Host Application Update",
            data["message"] ?: data["body"] ?: "Your host application has been updated",
            data["route"] ?: "/profile", null, "host_app".hashCode())
    }

    private fun showAgencyNotification(data: Map<String, String>) {
        showNotification(CHANNEL_SYSTEM, data["title"] ?: "Agency Update",
            data["message"] ?: data["body"] ?: "You have an agency update",
            data["route"] ?: "/agency", null, "agency".hashCode())
    }

    private fun showWithdrawalNotification(data: Map<String, String>) {
        showNotification(CHANNEL_SYSTEM, data["title"] ?: "💰 Withdrawal Update",
            data["message"] ?: data["body"] ?: "Your withdrawal has been updated",
            data["route"] ?: "/wallet", null, "withdrawal".hashCode())
    }

    private fun showAdminNotification(data: Map<String, String>) {
        showNotification(CHANNEL_ADMIN, data["title"] ?: "MeriLive",
            data["message"] ?: data["body"] ?: "",
            data["route"] ?: data["link_url"] ?: "/", data["image_url"],
            (data["notice_id"] ?: System.currentTimeMillis().toString()).hashCode(),
            data["image_url"])
    }

    private fun showPartyNotification(data: Map<String, String>) {
        val inviterName = data["inviter_name"] ?: data["sender_name"] ?: "Someone"
        val roomName = data["room_name"] ?: "a party"
        showNotification(CHANNEL_SYSTEM, "🎉 Party Invitation",
            "$inviterName invited you to $roomName",
            data["route"] ?: data["navigate_to"] ?: "/", null,
            (data["room_id"] ?: "party").hashCode())
    }

    private fun showWalletNotification(data: Map<String, String>) {
        showNotification(CHANNEL_SYSTEM, "💰 Wallet Update",
            data["message"] ?: data["body"] ?: "Your balance has been updated",
            data["route"] ?: "/wallet", null, System.currentTimeMillis().toInt())
    }

    private fun showGeneralNotification(data: Map<String, String>, notification: RemoteMessage.Notification?) {
        showNotification(CHANNEL_SYSTEM,
            data["title"] ?: notification?.title ?: "MeriLive",
            data["body"] ?: data["message"] ?: notification?.body ?: "",
            data["route"] ?: data["navigate_to"] ?: data["link_url"] ?: "/",
            data["image_url"] ?: notification?.imageUrl?.toString(),
            System.currentTimeMillis().toInt(),
            data["image_url"] ?: notification?.imageUrl?.toString())
    }

    private fun showNotification(
        channelId: String,
        title: String,
        body: String,
        route: String = "/",
        imageUrl: String? = null,
        notificationId: Int,
        bigImage: String? = null,
    ) {
        val intent = Intent(this, MainActivity::class.java).apply {
            flags = Intent.FLAG_ACTIVITY_CLEAR_TOP or Intent.FLAG_ACTIVITY_SINGLE_TOP
            putExtra("navigate_to", route)
        }
        val pendingIntent = PendingIntent.getActivity(
            this, notificationId, intent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )
        val builder = NotificationCompat.Builder(this, channelId)
            .setSmallIcon(R.drawable.ic_notification)
            .setContentTitle(title)
            .setContentText(body)
            .setAutoCancel(true)
            .setContentIntent(pendingIntent)
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)

        if (!bigImage.isNullOrEmpty()) {
            val bitmap = loadBitmapFromUrl(bigImage)
            if (bitmap != null) {
                builder.setStyle(
                    NotificationCompat.BigPictureStyle()
                        .bigPicture(bitmap)
                        .bigLargeIcon(null as Bitmap?)
                )
                builder.setLargeIcon(bitmap)
            } else {
                builder.setStyle(NotificationCompat.BigTextStyle().bigText(body))
            }
        } else if (body.length > 40) {
            builder.setStyle(NotificationCompat.BigTextStyle().bigText(body))
        }
        val manager = getSystemService(NOTIFICATION_SERVICE) as NotificationManager
        manager.notify(notificationId, builder.build())
    }

    @SuppressLint("NewApi")
    private fun createAllNotificationChannels() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
        val manager = getSystemService(NotificationManager::class.java) ?: return
        val channels = listOf(
            NotificationChannel(CHANNEL_CALL, "Incoming Calls", NotificationManager.IMPORTANCE_HIGH).apply {
                description = "Incoming call notifications"
                enableLights(true); enableVibration(true)
                lockscreenVisibility = Notification.VISIBILITY_PUBLIC
                setBypassDnd(true)
            },
            NotificationChannel(CHANNEL_MESSAGES, "Messages", NotificationManager.IMPORTANCE_HIGH).apply {
                description = "Chat message notifications"
                enableLights(true); enableVibration(true)
            },
            NotificationChannel(CHANNEL_GIFTS, "Gifts", NotificationManager.IMPORTANCE_DEFAULT).apply {
                description = "Gift received notifications"
            },
            NotificationChannel(CHANNEL_STREAM, "Live Streams", NotificationManager.IMPORTANCE_DEFAULT).apply {
                description = "Live stream notifications"
            },
            NotificationChannel(CHANNEL_ADMIN, "Admin Notices", NotificationManager.IMPORTANCE_HIGH).apply {
                description = "Important admin announcements"
                enableLights(true); enableVibration(true)
            },
            NotificationChannel(CHANNEL_SYSTEM, "System", NotificationManager.IMPORTANCE_DEFAULT).apply {
                description = "General system notifications"
            }
        )
        channels.forEach { manager.createNotificationChannel(it) }
    }

    private fun loadBitmapFromUrl(urlString: String): Bitmap? {
        return try {
            val url = URL(urlString)
            val connection = url.openConnection() as HttpURLConnection
            connection.doInput = true
            connection.connectTimeout = 5000
            connection.readTimeout = 5000
            connection.connect()
            BitmapFactory.decodeStream(connection.inputStream)
        } catch (e: Exception) {
            Log.w(TAG, "Failed to load notification image: $urlString", e)
            null
        }
    }
}
