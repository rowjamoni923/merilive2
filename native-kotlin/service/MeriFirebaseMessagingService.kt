package com.merilive.app.service

import android.annotation.SuppressLint
import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
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
 * MyFirebaseMessagingService — Handles ALL push notifications and incoming calls.
 *
 * Notification Types:
 * - incoming_call → Foreground Service + Full-Screen UI (WhatsApp-style)
 * - new_message → Chat notification with route
 * - gift_received → Gift notification
 * - new_follower → Follower notification
 * - stream_started → Live stream notification
 * - host_application_update → Host status notification
 * - agency_update → Agency notification
 * - withdrawal_update → Withdrawal notification
 * - admin_broadcast → Admin broadcast with optional image
 * - general → Default notification
 */
class MeriFirebaseMessagingService : FirebaseMessagingService() {

    companion object {
        private const val TAG = "MeriLiveFCM"

        // Notification Channel IDs
        private const val CHANNEL_CALL = "merilive_call_channel"
        private const val CHANNEL_MESSAGES = "merilive_messages"
        private const val CHANNEL_GIFTS = "merilive_gifts"
        private const val CHANNEL_STREAM = "merilive_stream"
        private const val CHANNEL_ADMIN = "merilive_admin"
        private const val CHANNEL_SYSTEM = "merilive_system"
    }

    override fun onCreate() {
        super.onCreate()
        createAllNotificationChannels()
    }

    override fun onNewToken(token: String) {
        super.onNewToken(token)
        Log.d(TAG, "New FCM token: $token")
        // Token will be saved to Supabase by the web layer via Capacitor
    }

    override fun onMessageReceived(message: RemoteMessage) {
        super.onMessageReceived(message)
        Log.d(TAG, "FCM received: type=${message.data["type"]}")

        val data = message.data
        val type = data["type"] ?: data["event_type"] ?: "general"

        when (type) {
            "incoming_call" -> handleIncomingCall(data)
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
    // INCOMING CALL — WhatsApp-style foreground
    // ═══════════════════════════════════════════

    private fun handleIncomingCall(data: Map<String, String>) {
        Log.d(TAG, "📞 Incoming call from: ${data["caller_name"]}")

        val serviceIntent = Intent(this, IncomingCallService::class.java).apply {
            action = IncomingCallService.ACTION_START_CALL
            putExtra("call_id", data["call_id"])
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

    // ═══════════════════════════════════════════
    // NOTIFICATION BUILDERS
    // ═══════════════════════════════════════════

    private fun showMessageNotification(data: Map<String, String>) {
        val senderName = data["sender_name"] ?: data["title"] ?: "New Message"
        val messageText = data["message"] ?: data["body"] ?: "You have a new message"
        val route = data["route"] ?: data["navigate_to"] ?: "/chat"

        showNotification(
            channelId = CHANNEL_MESSAGES,
            title = senderName,
            body = messageText,
            route = route,
            imageUrl = data["sender_avatar"],
            notificationId = (data["conversation_id"] ?: data["sender_id"] ?: "msg").hashCode()
        )
    }

    private fun showGiftNotification(data: Map<String, String>) {
        val senderName = data["sender_name"] ?: "Someone"
        val giftName = data["gift_name"] ?: "a gift"

        showNotification(
            channelId = CHANNEL_GIFTS,
            title = "🎁 Gift Received!",
            body = "$senderName sent you $giftName",
            route = data["route"] ?: "/profile",
            notificationId = System.currentTimeMillis().toInt()
        )
    }

    private fun showFollowerNotification(data: Map<String, String>) {
        val followerName = data["follower_name"] ?: data["sender_name"] ?: "Someone"

        showNotification(
            channelId = CHANNEL_SYSTEM,
            title = "👤 New Follower",
            body = "$followerName started following you",
            route = data["route"] ?: "/profile",
            imageUrl = data["follower_avatar"],
            notificationId = (data["follower_id"] ?: "follower").hashCode()
        )
    }

    private fun showStreamNotification(data: Map<String, String>) {
        val hostName = data["host_name"] ?: data["sender_name"] ?: "Someone"

        showNotification(
            channelId = CHANNEL_STREAM,
            title = "🔴 Live Now!",
            body = "$hostName is now live",
            route = data["route"] ?: data["navigate_to"] ?: "/",
            notificationId = (data["stream_id"] ?: "stream").hashCode()
        )
    }

    private fun showHostApplicationNotification(data: Map<String, String>) {
        showNotification(
            channelId = CHANNEL_SYSTEM,
            title = data["title"] ?: "Host Application Update",
            body = data["message"] ?: data["body"] ?: "Your host application has been updated",
            route = data["route"] ?: "/profile",
            notificationId = "host_app".hashCode()
        )
    }

    private fun showAgencyNotification(data: Map<String, String>) {
        showNotification(
            channelId = CHANNEL_SYSTEM,
            title = data["title"] ?: "Agency Update",
            body = data["message"] ?: data["body"] ?: "You have an agency update",
            route = data["route"] ?: "/agency",
            notificationId = "agency".hashCode()
        )
    }

    private fun showWithdrawalNotification(data: Map<String, String>) {
        showNotification(
            channelId = CHANNEL_SYSTEM,
            title = data["title"] ?: "💰 Withdrawal Update",
            body = data["message"] ?: data["body"] ?: "Your withdrawal has been updated",
            route = data["route"] ?: "/wallet",
            notificationId = "withdrawal".hashCode()
        )
    }

    private fun showAdminNotification(data: Map<String, String>) {
        showNotification(
            channelId = CHANNEL_ADMIN,
            title = data["title"] ?: "MeriLive",
            body = data["message"] ?: data["body"] ?: "",
            route = data["route"] ?: data["link_url"] ?: "/",
            imageUrl = data["image_url"],
            notificationId = (data["notice_id"] ?: System.currentTimeMillis().toString()).hashCode(),
            bigImage = data["image_url"]
        )
    }

    private fun showPartyNotification(data: Map<String, String>) {
        val inviterName = data["inviter_name"] ?: data["sender_name"] ?: "Someone"
        val roomName = data["room_name"] ?: "a party"

        showNotification(
            channelId = CHANNEL_SYSTEM,
            title = "🎉 Party Invitation",
            body = "$inviterName invited you to $roomName",
            route = data["route"] ?: data["navigate_to"] ?: "/",
            notificationId = (data["room_id"] ?: "party").hashCode()
        )
    }

    private fun showWalletNotification(data: Map<String, String>) {
        showNotification(
            channelId = CHANNEL_SYSTEM,
            title = "💰 Wallet Update",
            body = data["message"] ?: data["body"] ?: "Your balance has been updated",
            route = data["route"] ?: "/wallet",
            notificationId = System.currentTimeMillis().toInt()
        )
    }

    private fun showGeneralNotification(data: Map<String, String>, notification: RemoteMessage.Notification?) {
        showNotification(
            channelId = CHANNEL_SYSTEM,
            title = data["title"] ?: notification?.title ?: "MeriLive",
            body = data["body"] ?: data["message"] ?: notification?.body ?: "",
            route = data["route"] ?: data["navigate_to"] ?: data["link_url"] ?: "/",
            imageUrl = data["image_url"] ?: notification?.imageUrl?.toString(),
            notificationId = System.currentTimeMillis().toInt(),
            bigImage = data["image_url"] ?: notification?.imageUrl?.toString()
        )
    }

    // ═══════════════════════════════════════════
    // CORE NOTIFICATION DISPLAY
    // ═══════════════════════════════════════════

    private fun showNotification(
        channelId: String,
        title: String,
        body: String,
        route: String = "/",
        imageUrl: String? = null,
        notificationId: Int,
        bigImage: String? = null
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

        // Load big image for admin broadcasts / banners
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

    // ═══════════════════════════════════════════
    // NOTIFICATION CHANNELS
    // ═══════════════════════════════════════════

    @SuppressLint("NewApi")
    private fun createAllNotificationChannels() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return

        val manager = getSystemService(NotificationManager::class.java) ?: return

        val channels = listOf(
            NotificationChannel(CHANNEL_CALL, "Incoming Calls", NotificationManager.IMPORTANCE_HIGH).apply {
                description = "Incoming call notifications"
                enableLights(true)
                enableVibration(true)
                lockscreenVisibility = Notification.VISIBILITY_PUBLIC
                setBypassDnd(true)
            },
            NotificationChannel(CHANNEL_MESSAGES, "Messages", NotificationManager.IMPORTANCE_HIGH).apply {
                description = "Chat message notifications"
                enableLights(true)
                enableVibration(true)
            },
            NotificationChannel(CHANNEL_GIFTS, "Gifts", NotificationManager.IMPORTANCE_DEFAULT).apply {
                description = "Gift received notifications"
            },
            NotificationChannel(CHANNEL_STREAM, "Live Streams", NotificationManager.IMPORTANCE_DEFAULT).apply {
                description = "Live stream notifications"
            },
            NotificationChannel(CHANNEL_ADMIN, "Admin Notices", NotificationManager.IMPORTANCE_HIGH).apply {
                description = "Important admin announcements"
                enableLights(true)
                enableVibration(true)
            },
            NotificationChannel(CHANNEL_SYSTEM, "System", NotificationManager.IMPORTANCE_DEFAULT).apply {
                description = "General system notifications"
            }
        )

        channels.forEach { manager.createNotificationChannel(it) }
    }

    // ═══════════════════════════════════════════
    // IMAGE LOADING HELPER
    // ═══════════════════════════════════════════

    private fun loadBitmapFromUrl(urlString: String): Bitmap? {
        return try {
            val url = URL(urlString)
            val connection = url.openConnection() as HttpURLConnection
            connection.doInput = true
            connection.connectTimeout = 5000
            connection.readTimeout = 5000
            connection.connect()
            val input = connection.inputStream
            BitmapFactory.decodeStream(input)
        } catch (e: Exception) {
            Log.w(TAG, "Failed to load notification image: $urlString", e)
            null
        }
    }
}
