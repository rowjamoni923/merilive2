package com.merilive.app

import android.app.Application
import android.app.NotificationChannel
import android.app.NotificationManager
import android.os.Build
import coil.ImageLoader
import coil.ImageLoaderFactory
import coil.disk.DiskCache
import coil.memory.MemoryCache
import com.merilive.app.data.sync.AdminSyncManager
import dagger.hilt.android.HiltAndroidApp
import javax.inject.Inject

@HiltAndroidApp
class MeriLiveApplication : Application(), ImageLoaderFactory {

    @Inject lateinit var adminSyncManager: AdminSyncManager

    override fun onCreate() {
        super.onCreate()
        createNotificationChannels()
        adminSyncManager.initialize()
    }

    private fun createNotificationChannels() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val manager = getSystemService(NotificationManager::class.java)

            val channels = listOf(
                NotificationChannel("calls", "Incoming Calls", NotificationManager.IMPORTANCE_HIGH).apply {
                    description = "Incoming video/audio call notifications"
                    setSound(null, null) // Custom ringtone handled in service
                    enableVibration(true)
                    setBypassDnd(true)
                },
                NotificationChannel("chat", "Chat Messages", NotificationManager.IMPORTANCE_HIGH).apply {
                    description = "New chat message notifications"
                },
                NotificationChannel("gifts", "Gift Notifications", NotificationManager.IMPORTANCE_DEFAULT).apply {
                    description = "Gift received notifications"
                },
                NotificationChannel("wallet", "Wallet & Transactions", NotificationManager.IMPORTANCE_DEFAULT).apply {
                    description = "Diamond/Beans balance changes"
                },
                NotificationChannel("live", "Live Streams", NotificationManager.IMPORTANCE_DEFAULT).apply {
                    description = "Live stream notifications from followed users"
                },
                NotificationChannel("party", "Party Rooms", NotificationManager.IMPORTANCE_DEFAULT).apply {
                    description = "Party room invitations"
                },
                NotificationChannel("system", "System", NotificationManager.IMPORTANCE_LOW).apply {
                    description = "System notifications and updates"
                },
                NotificationChannel("admin", "Admin Notices", NotificationManager.IMPORTANCE_HIGH).apply {
                    description = "Important admin announcements"
                },
                NotificationChannel("followers", "Followers", NotificationManager.IMPORTANCE_DEFAULT).apply {
                    description = "New follower notifications"
                },
            )

            channels.forEach { manager.createNotificationChannel(it) }
        }
    }

    override fun newImageLoader(): ImageLoader {
        return ImageLoader.Builder(this)
            .memoryCache {
                MemoryCache.Builder(this)
                    .maxSizePercent(0.25) // 25% of app memory
                    .build()
            }
            .diskCache {
                DiskCache.Builder()
                    .directory(cacheDir.resolve("image_cache"))
                    .maxSizeBytes(100 * 1024 * 1024) // 100MB
                    .build()
            }
            .crossfade(true)
            .build()
    }
}
