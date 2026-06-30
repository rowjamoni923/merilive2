package com.merilive.app.activity;

import android.app.KeyguardManager;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.media.AudioAttributes;
import android.media.Ringtone;
import android.media.RingtoneManager;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.os.VibrationEffect;
import android.os.Vibrator;
import android.os.VibratorManager;
import android.view.WindowManager;
import android.widget.ImageButton;
import android.widget.ImageView;
import android.widget.TextView;
import androidx.appcompat.app.AppCompatActivity;
import com.merilive.app.MainActivity;
import com.merilive.app.R;
import com.merilive.app.plugin.NativeCallPlugin;
import com.merilive.app.util.NotificationHelper;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

public class IncomingCallActivity extends AppCompatActivity {

    private static final String ACTION_END_INCOMING_UI = "com.merilive.app.ACTION_END_INCOMING_UI";

    private Ringtone ringtone;
    private Vibrator vibrator;
    private Handler timeoutHandler;
    private Runnable timeoutRunnable;
    private String callId, callerId, callerName, callerAvatar, callType;
    private boolean actionDispatched = false;
    private BroadcastReceiver endReceiver;
    private final ExecutorService io = Executors.newSingleThreadExecutor();

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        // Show over lock screen
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O_MR1) {
            setShowWhenLocked(true);
            setTurnScreenOn(true);
            KeyguardManager km = (KeyguardManager) getSystemService(Context.KEYGUARD_SERVICE);
            if (km != null) km.requestDismissKeyguard(this, null);
            // Honest-private-call fix (I-1): API 27+ path was missing
            // FLAG_KEEP_SCREEN_ON, so a 15-30s screen-timeout could blank
            // the display mid-ring before the user could answer.
            getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        } else {
            getWindow().addFlags(
                WindowManager.LayoutParams.FLAG_SHOW_WHEN_LOCKED
                | WindowManager.LayoutParams.FLAG_TURN_SCREEN_ON
                | WindowManager.LayoutParams.FLAG_DISMISS_KEYGUARD
                | WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        }


        // Security - block screenshots
        getWindow().setFlags(WindowManager.LayoutParams.FLAG_SECURE,
            WindowManager.LayoutParams.FLAG_SECURE);

        setContentView(R.layout.activity_incoming_call);

        Intent intent = getIntent();
        callId = intent.getStringExtra("call_id");
        callerId = intent.getStringExtra("caller_id");
        callerName = intent.getStringExtra("caller_name");
        callerAvatar = intent.getStringExtra("caller_avatar");
        callType = intent.getStringExtra("call_type");
        // Pkg-audit Tier-3: a null callId previously short-circuited the
        // ACTION_END_INCOMING_UI broadcast guard (other-id mismatch became
        // false, falling through to finish()), so any unrelated end-broadcast
        // could dismiss this activity. Coerce to "" + tighten the guard below.
        if (callId == null) callId = "";
        if (callerId == null) callerId = "";
        if (callerName == null) callerName = "Unknown Caller";
        if (callType == null) callType = "video";

        TextView tvCallerName = findViewById(R.id.tvCallerName);
        TextView tvCallType = findViewById(R.id.tvCallType);
        ImageButton btnAccept = findViewById(R.id.btnAccept);
        ImageButton btnDecline = findViewById(R.id.btnDecline);
        final ImageView ivAvatar = findViewById(R.id.ivCallerAvatar);

        tvCallerName.setText(callerName);
        tvCallType.setText("video".equals(callType) ? "Incoming Video Call 📹" : "Incoming Audio Call 📞");

        // Step 31 — load remote avatar off the main thread.
        if (callerAvatar != null && !callerAvatar.isEmpty() && ivAvatar != null) {
            io.execute(() -> {
                final Bitmap bmp = loadBitmapFromUrl(callerAvatar);
                if (bmp == null) return;
                // Pkg-audit fix: don't post to a destroyed activity.
                runOnUiThread(() -> {
                    if (isDestroyed() || isFinishing()) return;
                    ivAvatar.setImageBitmap(bmp);
                });
            });
        }


        btnAccept.setOnClickListener(v -> {
            stopRinging();
            dispatchAction("accept");
            // Pkg-audit Tier-12 (High): promote Telecom Connection to ACTIVE
            // so audio routing (BT > wired > speaker) and the system call log
            // reflect the accepted state. Mirrors CallActionReceiver.
            try {
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                    com.merilive.app.telecom.TelecomBridge.reportConnected(callId);
                }
            } catch (Throwable ignored) {}
            cancelCallNotification();
            Intent mainIntent = new Intent(this, MainActivity.class);
            mainIntent.setFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP | Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_REORDER_TO_FRONT);
            mainIntent.putExtra("action", "accept_call");
            mainIntent.putExtra("open_call", true);
            mainIntent.putExtra("call_id", callId);
            mainIntent.putExtra("caller_id", callerId);
            mainIntent.putExtra("call_type", callType);
            startActivity(mainIntent);
            finish();
        });

        btnDecline.setOnClickListener(v -> {
            stopRinging();
            dispatchAction("decline");
            // Pkg-audit Tier-12 (High): tear down the Telecom Connection so
            // it's removed from ConnectionService map (otherwise audio focus
            // stays grabbed and the BT End button on the NEXT call no-ops).
            try {
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                    com.merilive.app.telecom.TelecomBridge.reportEnded(callId, false);
                }
            } catch (Throwable ignored) {}
            cancelCallNotification();
            finish();
        });

        startRinging();

        // Phase 3 fix (A2/D2): honor admin-configured ring_timeout_seconds from
        // the FCM payload instead of hardcoding 30s. Falls back to 30s when the
        // extra is absent (old APK / non-FCM launch). Clamp to a sane range so a
        // bad value can't lock the UI open.
        long ringTimeoutMs = 30000L;
        try {
            String s = intent.getStringExtra("ring_timeout_seconds");
            if (s != null && !s.isEmpty()) {
                long parsed = Long.parseLong(s.trim());
                // Pkg-audit fix: previously a value > 120 silently fell to the
                // 30s default. Clamp instead so admin intent is honored.
                if (parsed >= 10) {
                    ringTimeoutMs = Math.min(parsed, 120L) * 1000L;
                }
            }
        } catch (Exception ignored) {}

        timeoutHandler = new Handler(Looper.getMainLooper());
        timeoutRunnable = () -> {
            stopRinging();
            dispatchAction("timeout");
            // Pkg-audit Tier-12 (High): also end the Telecom Connection on
            // timeout — same rationale as decline. Without this a missed
            // call leaves the Telecom slot occupied.
            try {
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                    com.merilive.app.telecom.TelecomBridge.reportEnded(callId, false);
                }
            } catch (Throwable ignored) {}
            cancelCallNotification();
            finish();
        };
        timeoutHandler.postDelayed(timeoutRunnable, ringTimeoutMs);

        // Step 31 — listen for JS-initiated dismissals (caller cancelled,
        // answered on another device, etc) and close the activity.
        endReceiver = new BroadcastReceiver() {
            @Override
            public void onReceive(Context context, Intent ix) {
                if (!ACTION_END_INCOMING_UI.equals(ix.getAction())) return;
                String otherId = ix.getStringExtra("call_id");
                // Pkg-audit Tier-3: tightened guard — only ignore when we
                // KNOW this broadcast targets a different active call.
                if (callId != null && !callId.isEmpty()
                        && otherId != null && !otherId.isEmpty()
                        && !otherId.equals(callId)) return;
                stopRinging();
                // Phase 3 fix (B6): if the user already accepted/declined we
                // must NOT fire a second "dismissed" event into JS — it would
                // run declineCall on an already-accepted call and immediately
                // tear down the freshly connected room.
                if (!actionDispatched) {
                    dispatchAction("dismissed");
                }
                finish();
            }
        };
        IntentFilter filter = new IntentFilter(ACTION_END_INCOMING_UI);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            registerReceiver(endReceiver, filter, Context.RECEIVER_NOT_EXPORTED);
        } else {
            registerReceiver(endReceiver, filter);
        }

        // Step 31 — let JS know the surface is up.
        NativeCallPlugin.dispatch(getApplicationContext(),
            callId, callerId, callerName, callType, "presented");
    }

    private void dispatchAction(String action) {
        // Pkg-audit Tier-3: previously "dismissed" was allowed through even
        // after a terminal action was dispatched, which let the BT-headset
        // reject path emit BOTH "decline" (from MeriConnection.onReject) and
        // a follow-up "dismissed" via the end broadcast. Block every non-
        // "presented" action once any terminal action was dispatched.
        if (actionDispatched && !"presented".equals(action)) return;
        if (!"presented".equals(action)) actionDispatched = true;
        NativeCallPlugin.dispatch(getApplicationContext(),
            callId, callerId, callerName, callType, action);
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        if (intent == null) return;
        setIntent(intent);
        // Pkg-audit Tier-3: when the activity is reused (singleTop / singleTask)
        // for a new incoming call, re-read the extras and reset actionDispatched
        // — otherwise the previous call's terminal flag silently swallows the
        // new call's Accept / Decline taps.
        String nid = intent.getStringExtra("call_id");
        if (nid != null && !nid.isEmpty() && !nid.equals(callId)) {
            // Phase-A fix: cancel the previous call's pending ring-timeout
            // BEFORE swapping callId — otherwise the old timer keeps running
            // and force-times-out the new call ~seconds after it appears.
            if (timeoutHandler != null && timeoutRunnable != null) {
                timeoutHandler.removeCallbacks(timeoutRunnable);
            }
            // Honest-private-call fix (I-2): fully stop & release the previous
            // ringtone before the new call's ringing kicks in, otherwise the
            // old Ringtone instance is overwritten while still streaming and
            // two ringtones play simultaneously on rapid back-to-back calls.
            try {
                if (ringtone != null) {
                    if (ringtone.isPlaying()) ringtone.stop();
                    ringtone = null;
                }
            } catch (Throwable ignored) {}
            stopRinging();

            callId = nid;
            String cid = intent.getStringExtra("caller_id");
            if (cid != null) callerId = cid;
            String cn = intent.getStringExtra("caller_name");
            if (cn != null && !cn.isEmpty()) callerName = cn;
            String ca = intent.getStringExtra("caller_avatar");
            if (ca != null) callerAvatar = ca;
            String ct = intent.getStringExtra("call_type");
            if (ct != null && !ct.isEmpty()) callType = ct;
            actionDispatched = false;


            // Refresh visible UI for the new caller.
            try {
                TextView tvCallerName = findViewById(R.id.tvCallerName);
                TextView tvCallType = findViewById(R.id.tvCallType);
                if (tvCallerName != null) tvCallerName.setText(callerName);
                if (tvCallType != null) tvCallType.setText(
                    "video".equals(callType) ? "Incoming Video Call 📹" : "Incoming Audio Call 📞");
            } catch (Throwable ignored) {}

            // Re-arm the ring timeout for the new call, honoring its own
            // ring_timeout_seconds extra when present.
            long ringTimeoutMs = 30000L;
            try {
                String s = intent.getStringExtra("ring_timeout_seconds");
                if (s != null && !s.isEmpty()) {
                    long parsed = Long.parseLong(s.trim());
                    if (parsed >= 10) ringTimeoutMs = Math.min(parsed, 120L) * 1000L;
                }
            } catch (Exception ignored) {}
            if (timeoutHandler == null) timeoutHandler = new Handler(Looper.getMainLooper());
            timeoutRunnable = () -> {
                stopRinging();
                dispatchAction("timeout");
                try {
                    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                        com.merilive.app.telecom.TelecomBridge.reportEnded(callId, false);
                    }
                } catch (Throwable ignored) {}
                cancelCallNotification();
                finish();
            };
            timeoutHandler.postDelayed(timeoutRunnable, ringTimeoutMs);

            // Re-notify JS so the new call is treated as freshly presented.
            try {
                NativeCallPlugin.dispatch(getApplicationContext(),
                    callId, callerId, callerName, callType, "presented");
            } catch (Throwable ignored) {}
        }
    }

    private void cancelCallNotification() {
        try {
            android.app.NotificationManager nm = (android.app.NotificationManager)
                getSystemService(Context.NOTIFICATION_SERVICE);
            if (nm != null) nm.cancel(NotificationHelper.NOTIFICATION_CALL);
        } catch (Exception ignored) {}
    }

    private void startRinging() {
        try {
            // Pkg203 — bypass silent / DND just like WhatsApp / Bigo: force the
            // ringtone through the RING audio stream with HAPTIC_FEEDBACK + the
            // notification-ringtone usage so the channel's bypassDnd flag is honored.
            Uri ringtoneUri = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_RINGTONE);
            ringtone = RingtoneManager.getRingtone(this, ringtoneUri);
            if (ringtone != null) {
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) ringtone.setLooping(true);
                ringtone.setAudioAttributes(new AudioAttributes.Builder()
                    .setUsage(AudioAttributes.USAGE_NOTIFICATION_RINGTONE)
                    .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                    .setFlags(AudioAttributes.FLAG_AUDIBILITY_ENFORCED)
                    .build());
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
                    try { ringtone.setVolume(1.0f); } catch (Throwable ignored) {}
                }
                ringtone.play();
            }
        } catch (Exception e) { e.printStackTrace(); }

        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                VibratorManager vm = (VibratorManager) getSystemService(Context.VIBRATOR_MANAGER_SERVICE);
                // Pkg-audit fix: VibratorManager service can be null on stripped
                // OEM builds / mocked frameworks — crashed the ring path before.
                if (vm == null) { vibrator = null; }
                else { vibrator = vm.getDefaultVibrator(); }
            } else {
                vibrator = (Vibrator) getSystemService(Context.VIBRATOR_SERVICE);
            }
            if (vibrator != null) {
                long[] pattern = {0, 1000, 500, 1000, 500, 1000};
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                    vibrator.vibrate(VibrationEffect.createWaveform(pattern, 0));
                } else {
                    vibrator.vibrate(pattern, 0);
                }
            }
        } catch (Exception e) { e.printStackTrace(); }

    }

    private void stopRinging() {
        try { if (ringtone != null && ringtone.isPlaying()) ringtone.stop(); } catch (Exception ignored) {}
        try { if (vibrator != null) vibrator.cancel(); } catch (Exception ignored) {}
        if (timeoutHandler != null && timeoutRunnable != null) timeoutHandler.removeCallbacks(timeoutRunnable);
    }

    private Bitmap loadBitmapFromUrl(String urlString) {
        HttpURLConnection conn = null;
        InputStream input = null;
        try {
            URL url = new URL(urlString);
            conn = (HttpURLConnection) url.openConnection();
            conn.setDoInput(true);
            conn.setConnectTimeout(5000);
            conn.setReadTimeout(5000);
            conn.connect();
            input = conn.getInputStream();
            return BitmapFactory.decodeStream(input);
        } catch (Exception e) {
            return null;
        } finally {
            // Pkg-audit fix: explicitly close the stream (disconnect() only
            // tears down the TCP socket — InputStream object stays open).
            try { if (input != null) input.close(); } catch (Exception ignored) {}
            try { if (conn != null) conn.disconnect(); } catch (Exception ignored) {}
        }
    }


    @Override
    protected void onDestroy() {
        super.onDestroy();
        stopRinging();
        try { if (endReceiver != null) unregisterReceiver(endReceiver); } catch (Exception ignored) {}
        endReceiver = null;
        try { io.shutdownNow(); } catch (Exception ignored) {}
    }
}
