package com.merilive.app.activity;

import android.app.KeyguardManager;
import android.content.Context;
import android.content.Intent;
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
import android.widget.TextView;
import androidx.appcompat.app.AppCompatActivity;
import com.merilive.app.MainActivity;
import com.merilive.app.R;

public class IncomingCallActivity extends AppCompatActivity {

    private Ringtone ringtone;
    private Vibrator vibrator;
    private Handler timeoutHandler;
    private Runnable timeoutRunnable;
    private String callId, callerId, callerName, callType;

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
        callType = intent.getStringExtra("call_type");
        if (callerName == null) callerName = "Unknown Caller";
        if (callType == null) callType = "video";

        TextView tvCallerName = findViewById(R.id.tvCallerName);
        TextView tvCallType = findViewById(R.id.tvCallType);
        ImageButton btnAccept = findViewById(R.id.btnAccept);
        ImageButton btnDecline = findViewById(R.id.btnDecline);

        tvCallerName.setText(callerName);
        tvCallType.setText("video".equals(callType) ? "Incoming Video Call 📹" : "Incoming Audio Call 📞");

        btnAccept.setOnClickListener(v -> {
            stopRinging();
            Intent mainIntent = new Intent(this, MainActivity.class);
            mainIntent.setFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP | Intent.FLAG_ACTIVITY_SINGLE_TOP);
            mainIntent.putExtra("action", "accept_call");
            mainIntent.putExtra("call_id", callId);
            mainIntent.putExtra("caller_id", callerId);
            startActivity(mainIntent);
            finish();
        });

        btnDecline.setOnClickListener(v -> {
            stopRinging();
            android.app.NotificationManager nm = (android.app.NotificationManager)
                getSystemService(Context.NOTIFICATION_SERVICE);
            if (nm != null) nm.cancel(1001);
            finish();
        });

        startRinging();

        // Auto-timeout after 45 seconds
        timeoutHandler = new Handler(Looper.getMainLooper());
        timeoutRunnable = () -> { stopRinging(); finish(); };
        timeoutHandler.postDelayed(timeoutRunnable, 45000);
    }

    private void startRinging() {
        try {
            Uri ringtoneUri = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_RINGTONE);
            ringtone = RingtoneManager.getRingtone(this, ringtoneUri);
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) ringtone.setLooping(true);
            ringtone.setAudioAttributes(new AudioAttributes.Builder()
                .setUsage(AudioAttributes.USAGE_NOTIFICATION_RINGTONE)
                .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION).build());
            ringtone.play();
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

    @Override
    protected void onDestroy() { super.onDestroy(); stopRinging(); }
}
