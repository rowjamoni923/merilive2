package com.merilive.app.worker

import android.app.NotificationManager
import android.content.Context
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import androidx.work.CoroutineWorker
import androidx.work.WorkerParameters
import com.merilive.app.MainActivity
import com.merilive.app.R
import com.merilive.app.util.NotificationHelper
import org.json.JSONArray
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL

/**
 * Pkg221 — M16 Background Data Sync.
 * Periodic WorkManager job (every ~15 min while the app is killed/backgrounded)
 * that calls Supabase RPC get_background_unread_total via REST using the
 * cached user JWT and updates a silent launcher-badge notification.
 */
class BackgroundSyncWorker(
    appContext: Context,
    params: WorkerParameters
) : CoroutineWorker(appContext, params) {

    private val TAG = "BgSyncWorker"
    private val BADGE_NOTIF_ID = 7777

    override suspend fun doWork(): Result {
        val ctx = applicationContext
        val prefs = ctx.getSharedPreferences("merilive_bg_sync", Context.MODE_PRIVATE)
        val supabaseUrl = prefs.getString("supabase_url", null) ?: return Result.success()
        val anonKey = prefs.getString("anon_key", null) ?: return Result.success()
        val jwt = prefs.getString("access_token", null) ?: return Result.success()
        val userId = prefs.getString("user_id", null) ?: return Result.success()

        return try {
            val total = fetchUnreadTotal(supabaseUrl, anonKey, jwt)
            if (total > 0) postBadgeNotification(ctx, total) else cancelBadge(ctx)
            prefs.edit()
                .putInt("last_unread_total", total)
                .putLong("last_sync_at", System.currentTimeMillis())
                .apply()
            // Pkg252 — push count to home-screen widget badge
            try {
                com.merilive.app.widget.QuickActionsWidget.updateUnreadCount(ctx, total)
            } catch (_: Exception) {}
            Result.success()
        } catch (e: Exception) {
            android.util.Log.w(TAG, "sync failed: ${e.message}")
            Result.retry()
        }
    }

    private fun fetchUnreadTotal(supabaseUrl: String, anonKey: String, jwt: String): Int {
        val url = URL("$supabaseUrl/rest/v1/rpc/get_background_unread_total")
        val conn = (url.openConnection() as HttpURLConnection).apply {
            requestMethod = "POST"
            setRequestProperty("Content-Type", "application/json")
            setRequestProperty("apikey", anonKey)
            setRequestProperty("Authorization", "Bearer $jwt")
            setRequestProperty("Accept", "application/json")
            connectTimeout = 10_000
            readTimeout = 10_000
            doOutput = true
            doInput = true
        }
        conn.outputStream.use { it.write("{}".toByteArray()) }
        val code = conn.responseCode
        if (code !in 200..299) {
            conn.disconnect()
            android.util.Log.w(TAG, "rpc HTTP $code")
            return 0
        }
        val body = conn.inputStream.bufferedReader().use { it.readText() }
        conn.disconnect()

        // Supabase RPC returns the bare number for scalar functions
        return try {
            body.trim().toInt()
        } catch (_: NumberFormatException) {
            try {
                JSONArray(body).optInt(0, 0)
            } catch (_: Exception) {
                try { JSONObject(body).optInt("total", 0) } catch (_: Exception) { 0 }
            }
        }
    }

    private fun postBadgeNotification(ctx: Context, total: Int) {
        val open = android.content.Intent(ctx, MainActivity::class.java).apply {
            flags = android.content.Intent.FLAG_ACTIVITY_CLEAR_TOP or
                    android.content.Intent.FLAG_ACTIVITY_SINGLE_TOP
            putExtra("route", "/notifications")
        }
        val pi = android.app.PendingIntent.getActivity(
            ctx, 0, open,
            android.app.PendingIntent.FLAG_UPDATE_CURRENT or android.app.PendingIntent.FLAG_IMMUTABLE
        )

        val notif = NotificationCompat.Builder(ctx, NotificationHelper.CHANNEL_SYSTEM)
            .setSmallIcon(R.drawable.ic_notification)
            .setColor(NotificationHelper.BRAND_COLOR)
            .setContentTitle("You have $total new ${if (total == 1) "update" else "updates"}")
            .setContentText("Tap to open MeriLive")
            .setNumber(total)
            .setPriority(NotificationCompat.PRIORITY_LOW)
            .setSilent(true)
            .setOnlyAlertOnce(true)
            .setAutoCancel(true)
            .setCategory(NotificationCompat.CATEGORY_STATUS)
            .setVisibility(NotificationCompat.VISIBILITY_SECRET)
            .setContentIntent(pi)
            .build()
        try {
            NotificationManagerCompat.from(ctx).notify(BADGE_NOTIF_ID, notif)
        } catch (_: SecurityException) { /* POST_NOTIFICATIONS denied */ }
    }

    private fun cancelBadge(ctx: Context) {
        try {
            (ctx.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager)
                .cancel(BADGE_NOTIF_ID)
        } catch (_: Exception) {}
    }
}
