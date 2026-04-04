package com.merilive.app.service

import android.app.Service
import android.content.Intent
import android.os.IBinder
import androidx.core.app.NotificationCompat
import com.merilive.app.R
import dagger.hilt.android.AndroidEntryPoint
import io.github.jan.supabase.auth.Auth
import io.github.jan.supabase.postgrest.Postgrest
import kotlinx.coroutines.*
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import java.util.TimeZone
import javax.inject.Inject

@AndroidEntryPoint
class PresenceService : Service() {

    @Inject lateinit var auth: Auth
    @Inject lateinit var postgrest: Postgrest

    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
    private var heartbeatJob: Job? = null

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        val notification = NotificationCompat.Builder(this, "system")
            .setSmallIcon(R.drawable.ic_notification)
            .setContentTitle("MeriLive")
            .setContentText("Online")
            .setPriority(NotificationCompat.PRIORITY_MIN)
            .setSilent(true)
            .build()

        startForeground(NOTIFICATION_ID, notification)
        startHeartbeat()

        return START_STICKY
    }

    private fun nowIso(): String {
        val sdf = SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'", Locale.US)
        sdf.timeZone = TimeZone.getTimeZone("UTC")
        return sdf.format(Date())
    }

    private fun startHeartbeat() {
        heartbeatJob?.cancel()
        heartbeatJob = scope.launch {
            while (isActive) {
                try {
                    val userId = auth.currentSessionOrNull()?.user?.id
                    if (userId != null) {
                        postgrest.from("profiles").update(
                            mapOf(
                                "is_online" to true,
                                "last_seen_at" to nowIso()
                            )
                        ) { filter { eq("id", userId) } }
                    }
                } catch (_: Exception) {}
                delay(30_000)
            }
        }
    }

    private fun setOffline() {
        scope.launch {
            try {
                val userId = auth.currentSessionOrNull()?.user?.id ?: return@launch
                postgrest.from("profiles").update(
                    mapOf("is_online" to false, "last_seen_at" to nowIso())
                ) { filter { eq("id", userId) } }
            } catch (_: Exception) {}
        }
    }

    override fun onDestroy() {
        heartbeatJob?.cancel()
        setOffline()
        super.onDestroy()
    }

    override fun onBind(intent: Intent?): IBinder? = null

    companion object {
        const val NOTIFICATION_ID = 9002
    }
}