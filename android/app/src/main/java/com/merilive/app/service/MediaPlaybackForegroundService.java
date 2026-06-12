package com.merilive.app.service;

import android.app.Notification;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Intent;
import android.content.pm.ServiceInfo;
import android.os.Build;
import android.os.IBinder;
import android.os.PowerManager;
import android.util.Log;

import androidx.annotation.Nullable;
import androidx.core.app.NotificationCompat;
import androidx.core.app.ServiceCompat;

import com.merilive.app.MainActivity;
import com.merilive.app.R;
import com.merilive.app.util.NotificationHelper;

/**
 * Pkg-bgcontinuity — VIEWER-side foreground service.
 *
 * Started when the user is WATCHING a live stream or sitting in a party
 * room WITHOUT publishing camera/mic (i.e. not a host / not a speaker).
 *
 * Goals (matches Bigo / Chamet / TikTok Live viewer behaviour):
 *   - Audio keeps playing when the app is minimized or the screen turns off
 *   - LiveKit subscriber connection is not terminated by Doze / OEM kills
 *   - WebView background-throttling cannot suspend the playback thread
 *     because a PARTIAL_WAKE_LOCK is held for the lifetime of the session
 *
 * It is intentionally lightweight:
 *   - FGS type = MEDIA_PLAYBACK only (no camera / mic permissions claimed)
 *   - LOW-priority notification, never heads-up
 *   - Tap the notification → return to MainActivity
 *
 * The HOST path (publisher) is handled separately by CallForegroundService
 * which already claims CAMERA + MICROPHONE FGS types. These two services
 * are mutually exclusive in practice — the page knows whether the local
 * user is a host or a viewer and only starts ONE of them.
 */
public class MediaPlaybackForegroundService extends Service {

    private static final String TAG = "MediaPlaybackFGS";
    public static final String ACTION_START = "com.merilive.app.START_MEDIA_PLAYBACK";
    public static final String ACTION_STOP = "com.merilive.app.STOP_MEDIA_PLAYBACK";
    public static final String EXTRA_TITLE = "title";
    public static final String EXTRA_SUBTITLE = "subtitle";
    public static final String EXTRA_KIND = "kind"; // "live" | "party"

    private static final int FOREGROUND_NOTIFICATION_ID = 9020;
    private static final String WAKE_LOCK_TAG = "MeriLive:MediaPlaybackFGS";

    @Nullable private PowerManager.WakeLock wakeLock;

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        if (intent == null) {
            // OS restart with null intent — bail cleanly so we don't ghost.
            stopForeground(Build.VERSION.SDK_INT >= Build.VERSION_CODES.N
                ? Service.STOP_FOREGROUND_REMOVE : 1);
            stopSelf();
            return START_NOT_STICKY;
        }
        if (ACTION_STOP.equals(intent.getAction())) {
            releaseWakeLock();
            stopForeground(Build.VERSION.SDK_INT >= Build.VERSION_CODES.N
                ? Service.STOP_FOREGROUND_REMOVE : 1);
            stopSelf();
            return START_NOT_STICKY;
        }

        String title = intent.getStringExtra(EXTRA_TITLE);
        String subtitle = intent.getStringExtra(EXTRA_SUBTITLE);
        String kind = intent.getStringExtra(EXTRA_KIND);
        if (title == null || title.isEmpty()) {
            title = "party".equals(kind) ? "In party room" : "Watching live";
        }
        if (subtitle == null) subtitle = "Tap to return";

        Notification notification = buildNotification(title, subtitle);

        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                ServiceCompat.startForeground(
                    this,
                    FOREGROUND_NOTIFICATION_ID,
                    notification,
                    ServiceInfo.FOREGROUND_SERVICE_TYPE_MEDIA_PLAYBACK
                );
            } else {
                startForeground(FOREGROUND_NOTIFICATION_ID, notification);
            }
        } catch (Throwable t) {
            Log.w(TAG, "startForeground failed: " + t.getMessage());
            stopSelf();
            return START_NOT_STICKY;
        }

        acquireWakeLock();
        return START_NOT_STICKY;
    }

    private Notification buildNotification(String title, String subtitle) {
        Intent returnIntent = new Intent(this, MainActivity.class);
        returnIntent.setFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        PendingIntent returnPI = PendingIntent.getActivity(
            this, 0, returnIntent,
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);

        return new NotificationCompat.Builder(this, NotificationHelper.CHANNEL_LIVE)
            .setSmallIcon(R.drawable.ic_notification)
            .setContentTitle(title)
            .setContentText(subtitle)
            .setOngoing(true)
            .setShowWhen(false)
            .setOnlyAlertOnce(true)
            .setPriority(NotificationCompat.PRIORITY_LOW)
            .setCategory(NotificationCompat.CATEGORY_SERVICE)
            .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
            .setContentIntent(returnPI)
            .build();
    }

    private void acquireWakeLock() {
        if (wakeLock != null && wakeLock.isHeld()) return;
        try {
            PowerManager pm = (PowerManager) getSystemService(POWER_SERVICE);
            if (pm == null) return;
            wakeLock = pm.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, WAKE_LOCK_TAG);
            wakeLock.setReferenceCounted(false);
            // 6h ceiling — covers the longest realistic viewing session.
            // The plugin always issues an explicit STOP long before this fires.
            wakeLock.acquire(6L * 60L * 60L * 1000L);
        } catch (Throwable t) {
            Log.w(TAG, "acquireWakeLock failed: " + t.getMessage());
        }
    }

    private void releaseWakeLock() {
        try {
            if (wakeLock != null && wakeLock.isHeld()) wakeLock.release();
        } catch (Throwable ignored) {
        } finally {
            wakeLock = null;
        }
    }

    @Nullable
    @Override
    public IBinder onBind(Intent intent) { return null; }

    @Override
    public void onDestroy() {
        releaseWakeLock();
        super.onDestroy();
    }
}
