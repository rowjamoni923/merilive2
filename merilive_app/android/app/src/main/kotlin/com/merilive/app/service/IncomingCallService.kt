package com.merilive.app.service

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Intent
import android.os.Build
import android.os.IBinder
import android.util.Log
import androidx.core.app.NotificationCompat
import com.merilive.app.R
import com.merilive.app.ui.call.IncomingCallActivity

class IncomingCallService : Service() {

    companion object {
        private const val TAG = "IncomingCallService"
        private const val CHANNEL_ID = "merilive_call_channel"
        private const val NOTIFICATION_ID = 1001

        const val ACTION_START_CALL = "com.merilive.app.START_CALL"
        const val ACTION_STOP_CALL = "com.merilive.app.STOP_CALL"
        const val ACTION_ACCEPT = "com.merilive.app.ACCEPT_CALL"
        const val ACTION_DECLINE = "com.merilive.app.DECLINE_CALL"
    }

    private var callId: String? = null
    private var callerName: String? = null
    private var callerAvatar: String? = null
    private var callerId: String? = null
    private var callType: String? = null

    override fun onCreate() {
        super.onCreate()
        createNotificationChannel()
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        if (intent == null) {
            stopSelf()
            return START_NOT_STICKY
        }

        Log.d(TAG, "Action: ${intent.action}")

        when (intent.action) {
            ACTION_START_CALL -> {
                callId = intent.getStringExtra("call_id")
                callerName = intent.getStringExtra("caller_name") ?: "Unknown"
                callerAvatar = intent.getStringExtra("caller_avatar")
                callerId = intent.getStringExtra("caller_id")
                callType = intent.getStringExtra("call_type") ?: "video"
                startForeground(NOTIFICATION_ID, createNotification())
                showIncomingCallScreen()
            }
            ACTION_STOP_CALL, ACTION_ACCEPT, ACTION_DECLINE -> {
                Log.d(TAG, "Stopping call service")
                stopForeground(true)
                stopSelf()
            }
        }

        return START_NOT_STICKY
    }

    private fun createNotificationChannel() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val channel = NotificationChannel(
                CHANNEL_ID, "Incoming Calls", NotificationManager.IMPORTANCE_HIGH
            ).apply {
                description = "Notifications for incoming calls"
                enableLights(true)
                enableVibration(true)
                lockscreenVisibility = Notification.VISIBILITY_PUBLIC
                setBypassDnd(true)
            }
            getSystemService(NotificationManager::class.java)?.createNotificationChannel(channel)
        }
    }

    private fun createNotification(): Notification {
        val fullScreenIntent = Intent(this, IncomingCallActivity::class.java).apply {
            putExtra("call_id", callId)
            putExtra("caller_name", callerName)
            putExtra("caller_avatar", callerAvatar)
            putExtra("caller_id", callerId)
            putExtra("call_type", callType)
            flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP
        }

        val fullScreenPendingIntent = PendingIntent.getActivity(
            this, 0, fullScreenIntent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )

        val acceptIntent = Intent(this, IncomingCallService::class.java).apply {
            action = ACTION_ACCEPT
        }
        val acceptPendingIntent = PendingIntent.getService(
            this, 1, acceptIntent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )

        val declineIntent = Intent(this, IncomingCallService::class.java).apply {
            action = ACTION_DECLINE
        }
        val declinePendingIntent = PendingIntent.getService(
            this, 2, declineIntent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )

        val contentText = if (callType == "audio") "Incoming Audio Call" else "Incoming Video Call"

        return NotificationCompat.Builder(this, CHANNEL_ID)
            .setSmallIcon(R.drawable.ic_notification)
            .setContentTitle(callerName ?: "Incoming Call")
            .setContentText(contentText)
            .setPriority(NotificationCompat.PRIORITY_MAX)
            .setCategory(NotificationCompat.CATEGORY_CALL)
            .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
            .setOngoing(true)
            .setAutoCancel(false)
            .setFullScreenIntent(fullScreenPendingIntent, true)
            .addAction(android.R.drawable.ic_menu_call, "Accept", acceptPendingIntent)
            .addAction(android.R.drawable.ic_menu_close_clear_cancel, "Decline", declinePendingIntent)
            .build()
    }

    private fun showIncomingCallScreen() {
        val intent = Intent(this, IncomingCallActivity::class.java).apply {
            putExtra("call_id", callId)
            putExtra("caller_name", callerName)
            putExtra("caller_avatar", callerAvatar)
            putExtra("caller_id", callerId)
            putExtra("call_type", callType)
            flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP
        }
        startActivity(intent)
    }

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onDestroy() {
        Log.d(TAG, "Service destroyed")
        super.onDestroy()
    }
}
