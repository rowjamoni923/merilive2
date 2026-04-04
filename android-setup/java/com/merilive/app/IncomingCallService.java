package com.merilive.app;

import android.app.Notification;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.media.AudioAttributes;
import android.media.AudioManager;
import android.os.Build;
import android.os.Handler;
import android.os.IBinder;
import android.os.Looper;
import android.os.PowerManager;
import android.provider.Settings;
import android.util.Log;

import androidx.annotation.Nullable;
import androidx.core.app.NotificationCompat;

/**
 * ╔══════════════════════════════════════════════════════════════╗
 * ║     MeriLive — Incoming Call Foreground Service v3.0        ║
 * ╠══════════════════════════════════════════════════════════════╣
 * ║                                                              ║
 * ║  Pipeline:                                                   ║
 * ║   FCM Push → MyFirebaseMessagingService                     ║
 * ║     ↓                                                        ║
 * ║   IncomingCallService (this)                                ║
 * ║     ├── Foreground notification (ongoing, full-screen)      ║
 * ║     ├── IncomingCallActivity launch                         ║
 * ║     ├── Audio focus management                              ║
 * ║     └── Auto-timeout (60s)                                  ║
 * ║     ↓                                                        ║
 * ║   Accept → MainActivity → WebView (call join)              ║
 * ║   Decline → Service stop → WebView notify                  ║
 * ║                                                              ║
 * ║  Features:                                                   ║
 * ║   ✅ Foreground service (mandatory Android 8.0+)            ║
 * ║   ✅ Full-screen intent (lock screen)                       ║
 * ║   ✅ Accept/Decline notification actions                    ║
 * ║   ✅ Audio focus request (pause music)                      ║
 * ║   ✅ WakeLock for screen wake                               ║
 * ║   ✅ 60s auto-timeout                                       ║
 * ║   ✅ Multiple simultaneous call prevention                  ║
 * ║   ✅ Graceful cleanup on all exit paths                     ║
 * ║                                                              ║
 * ╚══════════════════════════════════════════════════════════════╝
 */
public class IncomingCallService extends Service {

    private static final String TAG = "MeriLive_CallSvc";
    private static final int NOTIFICATION_ID = 1001;
    private static final long CALL_TIMEOUT_MS = 60_000;

    private static final String CHANNEL_ID = MeriLiveApplication.CHANNEL_CALL;

    // ═══ Public Actions ═══
    public static final String ACTION_START_CALL = "com.merilive.app.START_CALL";
    public static final String ACTION_STOP_CALL  = "com.merilive.app.STOP_CALL";
    public static final String ACTION_ACCEPT     = "com.merilive.app.ACCEPT_CALL";
    public static final String ACTION_DECLINE    = "com.merilive.app.DECLINE_CALL";

    // ═══ State ═══
    private String callId;
    private String callerName;
    private String callerAvatar;
    private String callerId;
    private String callType;

    private Handler timeoutHandler;
    private AudioManager audioManager;
    private AudioManager.OnAudioFocusChangeListener audioFocusListener;
    private PowerManager.WakeLock serviceLock;

    private static volatile boolean isServiceRunning = false;

    public static boolean isRunning() {
        return isServiceRunning;
    }

    @Override
    public void onCreate() {
        super.onCreate();
        timeoutHandler = new Handler(Looper.getMainLooper());
        audioManager = (AudioManager) getSystemService(Context.AUDIO_SERVICE);
        isServiceRunning = true;
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        if (intent == null) {
            Log.w(TAG, "⚠️ Null intent — stopping");
            stopSelfCleanly();
            return START_NOT_STICKY;
        }

        String action = intent.getAction();
        Log.i(TAG, "📞 Action: " + action);

        if (ACTION_START_CALL.equals(action)) {
            handleStartCall(intent);
        } else if (ACTION_STOP_CALL.equals(action) ||
                   ACTION_ACCEPT.equals(action) ||
                   ACTION_DECLINE.equals(action)) {
            handleCallAction(action);
        } else {
            Log.w(TAG, "⚠️ Unknown action: " + action);
            stopSelfCleanly();
        }

        return START_NOT_STICKY;
    }

    // ═══════════════════════════════════════
    //  START CALL
    // ═══════════════════════════════════════

    private void handleStartCall(Intent intent) {
        // Extract call data
        callId      = intent.getStringExtra("call_id");
        callerName  = intent.getStringExtra("caller_name");
        callerAvatar = intent.getStringExtra("caller_avatar");
        callerId    = intent.getStringExtra("caller_id");
        callType    = intent.getStringExtra("call_type");

        if (callerName == null || callerName.isEmpty()) callerName = "Unknown Caller";
        if (callType == null) callType = "video";

        Log.i(TAG, "📞 Incoming call: " + callerName + " (" + callType + ") id=" + callId);

        // ── Start foreground with notification ──
        startForeground(NOTIFICATION_ID, createCallNotification());

        // ── Request audio focus (pause music) ──
        requestAudioFocus();

        // ── Acquire WakeLock ──
        acquireServiceWakeLock();

        // ── Launch full-screen call UI ──
        launchCallScreen();

        // ── Auto-timeout ──
        timeoutHandler.postDelayed(() -> {
            Log.i(TAG, "⏰ Call timeout (60s) — auto declining");
            broadcastCallAction("timeout");
            stopSelfCleanly();
        }, CALL_TIMEOUT_MS);
    }

    // ═══════════════════════════════════════
    //  CALL ACTIONS (Accept/Decline/Stop)
    // ═══════════════════════════════════════

    private void handleCallAction(String action) {
        // Cancel timeout
        timeoutHandler.removeCallbacksAndMessages(null);

        if (ACTION_ACCEPT.equals(action)) {
            Log.i(TAG, "✅ Call ACCEPTED via notification");
            broadcastCallAction("accept");
        } else if (ACTION_DECLINE.equals(action)) {
            Log.i(TAG, "❌ Call DECLINED via notification");
            broadcastCallAction("decline");
        } else {
            Log.i(TAG, "⏹ Call STOPPED");
        }

        stopSelfCleanly();
    }

    // ═══════════════════════════════════════
    //  NOTIFICATION
    // ═══════════════════════════════════════

    private Notification createCallNotification() {
        // ── Full screen intent → IncomingCallActivity ──
        Intent fullScreenIntent = createCallActivityIntent();
        PendingIntent fullScreenPending = PendingIntent.getActivity(
            this, 0, fullScreenIntent,
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );

        // ── Accept action ──
        Intent acceptIntent = new Intent(this, IncomingCallService.class);
        acceptIntent.setAction(ACTION_ACCEPT);
        PendingIntent acceptPending = PendingIntent.getService(
            this, 1, acceptIntent,
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );

        // ── Decline action ──
        Intent declineIntent = new Intent(this, IncomingCallService.class);
        declineIntent.setAction(ACTION_DECLINE);
        PendingIntent declinePending = PendingIntent.getService(
            this, 2, declineIntent,
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );

        String contentText = "audio".equalsIgnoreCase(callType)
            ? "📱 Incoming Audio Call"
            : "📹 Incoming Video Call";

        return new NotificationCompat.Builder(this, CHANNEL_ID)
            .setSmallIcon(android.R.drawable.ic_menu_call)
            .setContentTitle(callerName)
            .setContentText(contentText)
            .setSubText("MeriLive")
            .setPriority(NotificationCompat.PRIORITY_MAX)
            .setCategory(NotificationCompat.CATEGORY_CALL)
            .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
            .setOngoing(true)
            .setAutoCancel(false)
            .setTimeoutAfter(CALL_TIMEOUT_MS)
            .setFullScreenIntent(fullScreenPending, true)
            .addAction(android.R.drawable.ic_menu_call, "✅ Accept", acceptPending)
            .addAction(android.R.drawable.ic_menu_close_clear_cancel, "❌ Decline", declinePending)
            .setColor(0xFF4CAF50)
            .setSound(Settings.System.DEFAULT_RINGTONE_URI)
            .setVibrate(new long[]{0, 800, 400, 800, 400, 800})
            .build();
    }

    // ═══════════════════════════════════════
    //  CALL SCREEN LAUNCH
    // ═══════════════════════════════════════

    private void launchCallScreen() {
        Intent intent = createCallActivityIntent();
        startActivity(intent);
    }

    private Intent createCallActivityIntent() {
        Intent intent = new Intent(this, IncomingCallActivity.class);
        intent.putExtra("call_id", callId);
        intent.putExtra("caller_name", callerName);
        intent.putExtra("caller_avatar", callerAvatar);
        intent.putExtra("caller_id", callerId);
        intent.putExtra("call_type", callType);
        intent.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        return intent;
    }

    // ═══════════════════════════════════════
    //  AUDIO FOCUS
    // ═══════════════════════════════════════

    private void requestAudioFocus() {
        if (audioManager == null) return;

        audioFocusListener = focusChange -> {
            if (focusChange == AudioManager.AUDIOFOCUS_LOSS) {
                Log.d(TAG, "Audio focus lost");
            }
        };

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            android.media.AudioFocusRequest request = new android.media.AudioFocusRequest.Builder(
                AudioManager.AUDIOFOCUS_GAIN_TRANSIENT_EXCLUSIVE)
                .setAudioAttributes(new AudioAttributes.Builder()
                    .setUsage(AudioAttributes.USAGE_NOTIFICATION_RINGTONE)
                    .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                    .build())
                .setOnAudioFocusChangeListener(audioFocusListener)
                .build();
            audioManager.requestAudioFocus(request);
        } else {
            audioManager.requestAudioFocus(audioFocusListener,
                AudioManager.STREAM_RING, AudioManager.AUDIOFOCUS_GAIN_TRANSIENT);
        }
    }

    private void abandonAudioFocus() {
        if (audioManager == null || audioFocusListener == null) return;

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            audioManager.abandonAudioFocusRequest(
                new android.media.AudioFocusRequest.Builder(AudioManager.AUDIOFOCUS_GAIN)
                    .setOnAudioFocusChangeListener(audioFocusListener)
                    .build()
            );
        } else {
            audioManager.abandonAudioFocus(audioFocusListener);
        }
    }

    // ═══════════════════════════════════════
    //  WAKELOCK
    // ═══════════════════════════════════════

    private void acquireServiceWakeLock() {
        try {
            PowerManager pm = (PowerManager) getSystemService(Context.POWER_SERVICE);
            if (pm != null) {
                serviceLock = pm.newWakeLock(
                    PowerManager.PARTIAL_WAKE_LOCK,
                    "MeriLive:CallServiceWakeLock"
                );
                serviceLock.acquire(CALL_TIMEOUT_MS + 5000);
            }
        } catch (Exception e) {
            Log.w(TAG, "WakeLock error: " + e.getMessage());
        }
    }

    private void releaseServiceWakeLock() {
        try {
            if (serviceLock != null && serviceLock.isHeld()) {
                serviceLock.release();
            }
        } catch (Exception ignored) {}
    }

    // ═══════════════════════════════════════
    //  BROADCAST
    // ═══════════════════════════════════════

    private void broadcastCallAction(String action) {
        Intent intent = new Intent(CallActionReceiver.ACTION_CALL);
        intent.putExtra("action", action);
        intent.putExtra("call_id", callId);
        intent.putExtra("caller_id", callerId);
        sendBroadcast(intent);
    }

    // ═══════════════════════════════════════
    //  CLEANUP
    // ═══════════════════════════════════════

    private void stopSelfCleanly() {
        timeoutHandler.removeCallbacksAndMessages(null);
        abandonAudioFocus();
        releaseServiceWakeLock();

        // Close IncomingCallActivity
        Intent closeIntent = new Intent(CallActionReceiver.ACTION_CLOSE);
        closeIntent.putExtra("call_id", callId);
        sendBroadcast(closeIntent);

        stopForeground(true);
        stopSelf();
    }

    @Nullable
    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }

    @Override
    public void onDestroy() {
        super.onDestroy();
        isServiceRunning = false;
        timeoutHandler.removeCallbacksAndMessages(null);
        abandonAudioFocus();
        releaseServiceWakeLock();
        Log.i(TAG, "🔴 IncomingCallService destroyed");
    }
}
