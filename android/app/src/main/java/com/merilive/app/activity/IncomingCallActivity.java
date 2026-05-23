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
                runOnUiThread(() -> ivAvatar.setImageBitmap(bmp));
            });
        }

        btnAccept.setOnClickListener(v -> {
            stopRinging();
            dispatchAction("accept");
            cancelCallNotification();
            Intent mainIntent = new Intent(this, MainActivity.class);
            mainIntent.setFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP | Intent.FLAG_ACTIVITY_SINGLE_TOP);
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
            cancelCallNotification();
            finish();
        });

        startRinging();

        // Auto-timeout after 30 seconds (industry standard - WhatsApp/Messenger parity).
        timeoutHandler = new Handler(Looper.getMainLooper());
        timeoutRunnable = () -> {
            stopRinging();
            dispatchAction("timeout");
            cancelCallNotification();
            finish();
        };
        timeoutHandler.postDelayed(timeoutRunnable, 30000);

        // Step 31 — listen for JS-initiated dismissals (caller cancelled,
        // answered on another device, etc) and close the activity.
        endReceiver = new BroadcastReceiver() {
            @Override
            public void onReceive(Context context, Intent ix) {
                if (!ACTION_END_INCOMING_UI.equals(ix.getAction())) return;
                String otherId = ix.getStringExtra("call_id");
                if (otherId != null && callId != null && !otherId.equals(callId)) return;
                stopRinging();
                dispatchAction("dismissed");
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
        if (actionDispatched && !"dismissed".equals(action) && !"presented".equals(action)) return;
        actionDispatched = true;
        NativeCallPlugin.dispatch(getApplicationContext(),
            callId, callerId, callerName, callType, action);
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
                vibrator = vm.getDefaultVibrator();
            } else {
                vibrator = (Vibrator) getSystemService(Context.VIBRATOR_SERVICE);
            }
            long[] pattern = {0, 1000, 500, 1000, 500, 1000};
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                vibrator.vibrate(VibrationEffect.createWaveform(pattern, 0));
            } else {
                vibrator.vibrate(pattern, 0);
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
        try {
            URL url = new URL(urlString);
            conn = (HttpURLConnection) url.openConnection();
            conn.setDoInput(true);
            conn.setConnectTimeout(5000);
            conn.setReadTimeout(5000);
            conn.connect();
            InputStream input = conn.getInputStream();
            return BitmapFactory.decodeStream(input);
        } catch (Exception e) {
            return null;
        } finally {
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
