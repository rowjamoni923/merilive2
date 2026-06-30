package com.merilive.app.service;

import android.app.Notification;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Intent;
import android.content.pm.ServiceInfo;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.os.Build;
import android.os.IBinder;
import android.util.Log;

import androidx.annotation.Nullable;
import androidx.core.app.NotificationCompat;
import androidx.core.app.NotificationManagerCompat;
import androidx.core.app.ServiceCompat;

import com.merilive.app.MainActivity;
import com.merilive.app.R;
import com.merilive.app.receiver.CallActionReceiver;
import com.merilive.app.util.NotificationHelper;

import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;

/**
 * Active-call foreground service.
 * The accepted-call screen is React ActiveCallScreen only; this service keeps
 * camera/mic alive quietly and never posts Android CallStyle/OEM in-call UI.
 * Hang-up routes through CallActionReceiver so JS learns about the end.
 */
public class CallForegroundService extends Service {

    private static final String TAG = "CallFGS";
    public static final String ACTION_START = "com.merilive.app.START_CALL_SERVICE";
    public static final String ACTION_STOP = "com.merilive.app.STOP_CALL_SERVICE";
    public static final int FOREGROUND_NOTIFICATION_ID = 9001;

    // 🚨 Ghost-notification fix (2026-06-30): the avatar enrichment thread
    // could finish AFTER stopForeground()/cancel() ran and re-post the
    // notification under the same id — leaving a "Call in progress" entry
    // in the shade even though JS endCall() had torn everything down.
    // Two-layer guard: (a) generation counter so a stale thread's re-notify
    // is dropped, (b) explicit cancel + re-cancel-after-delay after stop.
    private static volatile int sGeneration = 0;
    private static volatile boolean sServiceStopped = true;

    private void stopAndRemoveForegroundNotification() {
        sServiceStopped = true;
        sGeneration++; // any in-flight avatar thread is now stale
        try {
            stopForeground(Build.VERSION.SDK_INT >= Build.VERSION_CODES.N
                ? Service.STOP_FOREGROUND_REMOVE : 1 /* legacy true */);
        } catch (Throwable ignored) {}
        try {
            NotificationManagerCompat.from(getApplicationContext()).cancel(FOREGROUND_NOTIFICATION_ID);
        } catch (Throwable ignored) {}
        try {
            NotificationManagerCompat.from(getApplicationContext()).cancel(NotificationHelper.NOTIFICATION_CALL);
        } catch (Throwable ignored) {}
        // Belt-and-braces: re-cancel after the avatar thread's worst-case
        // completion window so any race-window re-notify is wiped instantly.
        new android.os.Handler(android.os.Looper.getMainLooper()).postDelayed(() -> {
            try {
                NotificationManagerCompat.from(getApplicationContext()).cancel(FOREGROUND_NOTIFICATION_ID);
                NotificationManagerCompat.from(getApplicationContext()).cancel(NotificationHelper.NOTIFICATION_CALL);
            } catch (Throwable ignored) {}
        }, 900);
    }


    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        // Honest-private-call fix (S-1): OS-restart with null intent must NOT
        // re-post a stale "Call in progress" ghost notification. Bail cleanly
        // and switch the service to non-sticky so the OS won't keep relaunching.
        if (intent == null) {
            Log.w(TAG, "onStartCommand: null intent (OS restart) — stopping service");
            stopAndRemoveForegroundNotification();
            stopSelf();
            return START_NOT_STICKY;
        }
        if (ACTION_STOP.equals(intent.getAction())) {
            stopAndRemoveForegroundNotification();
            stopSelf();
            return START_NOT_STICKY;
        }


        String callerName = intent != null ? intent.getStringExtra("caller_name") : null;
        String callType = intent != null ? intent.getStringExtra("call_type") : null;
        String callerAvatar = intent != null ? intent.getStringExtra("caller_avatar") : null;
        String callId = intent != null ? intent.getStringExtra("call_id") : null;
        String callerId = intent != null ? intent.getStringExtra("caller_id") : null;
        // Phase I — "live" → Bigo/Chamet host-broadcast notification.
        String mode = intent != null ? intent.getStringExtra("mode") : null;
        if (mode == null || mode.isEmpty()) mode = "call";
        int viewerCount = intent != null ? intent.getIntExtra("viewer_count", -1) : -1;
        long coinCount = intent != null ? intent.getLongExtra("coin_count", -1L) : -1L;

        if (callerName == null || callerName.isEmpty()) {
            callerName = "live".equals(mode) ? "Live broadcast" : "Live session";
        }
        if (callType == null || callType.isEmpty()) callType = "Call";
        if (callId == null) callId = "";
        if (callerId == null) callerId = "";

        try { NotificationHelper.createNotificationChannels(getApplicationContext()); } catch (Throwable ignored) {}

        Notification notification = "live".equals(mode)
            ? buildLiveNotification(callerName, viewerCount, coinCount)
            : buildNotification(callerName, callType, callId, callerId, null);

        // Pkg229 — typed startForeground required since API 29 for camera/mic FGS
        // started from background. Android 14+ enforces type match against manifest;
        // ServiceCompat handles the version branching internally.
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            int fgsType = "live".equals(mode)
                // Live broadcast: camera + mic only (no phoneCall — Bigo/Chamet
                // never claim CallStyle for hosts; avoids "Call in progress" leak).
                ? ServiceInfo.FOREGROUND_SERVICE_TYPE_CAMERA
                    | ServiceInfo.FOREGROUND_SERVICE_TYPE_MICROPHONE
                // Private/random calls also stay camera+mic only.  We do not
                // claim PHONE_CALL because Samsung/MIUI can surface a system
                // in-call chip/chronometer that visually survives after React
                // hangup. MeriLive's ActiveCallScreen is the only call UI.
                : ServiceInfo.FOREGROUND_SERVICE_TYPE_MICROPHONE
                    | ServiceInfo.FOREGROUND_SERVICE_TYPE_CAMERA;
            ServiceCompat.startForeground(this, FOREGROUND_NOTIFICATION_ID, notification, fgsType);
        } else {
            startForeground(FOREGROUND_NOTIFICATION_ID, notification);
        }

        // Async-load avatar then re-issue the same notification id so the
        // ongoing call heads-up upgrades to the avatar-rich CallStyle render.
        // Skip avatar enrichment for live mode (broadcast notification uses a
        // text-only template — no Person/CallStyle).
        if (!"live".equals(mode) && callerAvatar != null && !callerAvatar.isEmpty()) {
            final String avatarUrl = callerAvatar;
            final String snapName = callerName;
            final String snapType = callType;
            final String snapCallId = callId;
            final String snapCallerId = callerId;
            new Thread(() -> {
                Bitmap bmp = loadBitmapFromUrl(avatarUrl);
                if (bmp == null) return;
                try {
                    Notification withAvatar = buildNotification(
                        snapName, snapType, snapCallId, snapCallerId, bmp);
                    NotificationManagerCompat.from(getApplicationContext())
                        .notify(FOREGROUND_NOTIFICATION_ID, withAvatar);
                } catch (Throwable t) {
                    Log.w(TAG, "avatar re-notify failed: " + t.getMessage());
                }
            }, "CallFGS-avatar").start();
        }

        // Honest-private-call fix (S-1): non-sticky → OS won't relaunch with
        // a null intent and re-post a phantom "Call in progress" notification.
        return START_NOT_STICKY;

    }

    /**
     * Phase I — Bigo / Chamet host-broadcast foreground notification.
     * "🔴 LIVE" title + "{viewers} watching · 💎 {coins}" subtitle +
     * chronometer + "End Live" action. Does NOT use CallStyle so users
     * never see "Call in progress" while live (the #1 hybrid leak).
     */
    private Notification buildLiveNotification(String title, int viewerCount, long coinCount) {
        Intent returnIntent = new Intent(this, MainActivity.class);
        returnIntent.setFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        PendingIntent returnPI = PendingIntent.getActivity(
            this, 0, returnIntent,
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);

        // "End Live" routes through CallActionReceiver DECLINE so JS tears
        // down the broadcast cleanly (same path as call hangup).
        Intent endIntent = new Intent(this, CallActionReceiver.class);
        endIntent.setAction(CallActionReceiver.ACTION_DECLINE);
        endIntent.putExtra("call_type", "Live broadcast");
        PendingIntent endPI = PendingIntent.getBroadcast(
            this, "endLive".hashCode(), endIntent,
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);

        String subtitle;
        if (viewerCount >= 0 && coinCount >= 0L) {
            subtitle = formatViewers(viewerCount) + " watching · " + formatCoins(coinCount) + " coins";
        } else if (viewerCount >= 0) {
            subtitle = formatViewers(viewerCount) + " watching";
        } else {
            subtitle = "You are live";
        }

        String safeTitle = (title == null || title.isEmpty()) ? "LIVE" : title;

        return new NotificationCompat.Builder(this, NotificationHelper.CHANNEL_CALL_SERVICE)
            .setSmallIcon(R.drawable.ic_notification)
            .setColor(0xFFE53935) // LIVE red — matches Bigo/Chamet palette
            .setColorized(true)
            .setContentTitle("🔴 LIVE · " + safeTitle)
            .setContentText(subtitle)
            .setOngoing(true)
            // Owner fix: no Android/OEM status-bar timer for live/party/call.
            // The app UI owns all counters; OEM chronometers can visually
            // survive teardown and look like the call/live is still running.
            .setUsesChronometer(false)
            .setShowWhen(false)
            .setPriority(NotificationCompat.PRIORITY_LOW) // never heads-up for live (user is the host)
            .setCategory(NotificationCompat.CATEGORY_SERVICE)
            .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
            .setOnlyAlertOnce(true)
            .setSilent(true)
            .setContentIntent(returnPI)
            .addAction(R.drawable.ic_call_decline, "End Live", endPI)
            .build();
    }

    private static String formatViewers(int n) {
        if (n >= 1_000_000) return String.format(java.util.Locale.US, "%.1fM", n / 1_000_000.0);
        if (n >= 1_000) return String.format(java.util.Locale.US, "%.1fK", n / 1_000.0);
        return String.valueOf(n);
    }

    private static String formatCoins(long n) {
        if (n >= 1_000_000) return String.format(java.util.Locale.US, "%.1fM", n / 1_000_000.0);
        if (n >= 1_000) return String.format(java.util.Locale.US, "%.1fK", n / 1_000.0);
        return String.valueOf(n);
    }

    private Notification buildNotification(String callerName, String callType,
                                           String callId, String callerId, @Nullable Bitmap avatar) {
        Intent returnIntent = new Intent(this, MainActivity.class);
        returnIntent.setFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        PendingIntent returnPI = PendingIntent.getActivity(
            this, 0, returnIntent,
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);

        // Hang-up routes through CallActionReceiver (DECLINE path) so JS and
        // Telecom are notified — not just the FGS stopped.
        Intent hangupIntent = new Intent(this, CallActionReceiver.class);
        hangupIntent.setAction(CallActionReceiver.ACTION_DECLINE);
        hangupIntent.putExtra("call_id", callId);
        hangupIntent.putExtra("caller_id", callerId);
        hangupIntent.putExtra("caller_name", callerName);
        hangupIntent.putExtra("call_type", callType);
        PendingIntent hangupPI = PendingIntent.getBroadcast(
            this, ("hangup:" + callId).hashCode(), hangupIntent,
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);

        NotificationCompat.Builder builder = new NotificationCompat.Builder(this, NotificationHelper.CHANNEL_CALL_SERVICE)
            .setSmallIcon(R.drawable.ic_notification)
            .setColor(NotificationHelper.BRAND_COLOR)
            .setColorized(true)
            .setContentTitle("MeriLive private call")
            .setContentText(callType + " with " + callerName)
            .setOngoing(true)
            .setUsesChronometer(false)
            .setShowWhen(false)
            // Our React ActiveCallScreen is the only visible in-call UI.  Keep
            // this as a quiet foreground-service requirement instead of a
            // CallStyle heads-up/chip that looks like an OEM/World-Cup overlay
            // and can visually outlive the app UI on some Android 12+ skins.
            .setPriority(NotificationCompat.PRIORITY_LOW)
            .setCategory(NotificationCompat.CATEGORY_SERVICE)
            .setVisibility(NotificationCompat.VISIBILITY_PRIVATE)
            .setOnlyAlertOnce(true)
            .setSilent(true)
            .setContentIntent(returnPI);

        builder.addAction(R.drawable.ic_call_decline, "End Call", hangupPI);
        if (avatar != null) builder.setLargeIcon(avatar);

        return builder.build();
    }

    private Bitmap loadBitmapFromUrl(String urlString) {
        // Pkg-audit Tier-3: always close InputStream + disconnect HttpURLConnection,
        // otherwise burst call-notification updates leak file descriptors and
        // sockets until SocketException: Too many open files.
        // Pkg-audit Tier-12 (Medium): also subsample large remote avatars —
        // a 4000×4000 JPEG previously decoded to ~64MB heap on the avatar
        // thread, OOM-killing the FGS process during call notifications.
        HttpURLConnection conn = null;
        InputStream input = null;
        try {
            URL url = new URL(urlString);
            conn = (HttpURLConnection) url.openConnection();
            conn.setInstanceFollowRedirects(true);
            conn.setDoInput(true);
            conn.setConnectTimeout(8000);
            conn.setReadTimeout(8000);
            conn.connect();
            input = conn.getInputStream();
            java.io.ByteArrayOutputStream baos = new java.io.ByteArrayOutputStream();
            byte[] buf = new byte[8192];
            int total = 0, n;
            while ((n = input.read(buf)) > 0) {
                total += n;
                if (total > 4 * 1024 * 1024) return null;
                baos.write(buf, 0, n);
            }
            byte[] raw = baos.toByteArray();
            if (raw.length == 0) return null;
            BitmapFactory.Options bounds = new BitmapFactory.Options();
            bounds.inJustDecodeBounds = true;
            BitmapFactory.decodeByteArray(raw, 0, raw.length, bounds);
            int maxEdge = Math.max(bounds.outWidth, bounds.outHeight);
            int sample = 1;
            while (maxEdge / sample > 512) sample *= 2;
            BitmapFactory.Options opts = new BitmapFactory.Options();
            opts.inSampleSize = sample;
            opts.inPreferredConfig = Bitmap.Config.ARGB_8888;
            return BitmapFactory.decodeByteArray(raw, 0, raw.length, opts);
        } catch (Exception e) {
            Log.w(TAG, "loadBitmapFromUrl failed: " + e.getMessage());
            return null;
        } finally {
            try { if (input != null) input.close(); } catch (Exception ignored) {}
            try { if (conn != null) conn.disconnect(); } catch (Exception ignored) {}
        }
    }

    @Nullable
    @Override
    public IBinder onBind(Intent intent) { return null; }

    @Override
    public void onDestroy() {
        stopAndRemoveForegroundNotification();
        super.onDestroy();
    }
}
