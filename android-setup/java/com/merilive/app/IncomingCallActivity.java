package com.merilive.app;

import android.animation.AnimatorSet;
import android.animation.ObjectAnimator;
import android.app.KeyguardManager;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import android.media.AudioAttributes;
import android.media.Ringtone;
import android.media.RingtoneManager;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.PowerManager;
import android.os.VibrationEffect;
import android.os.Vibrator;
import android.os.VibratorManager;
import android.util.Log;
import android.view.HapticFeedbackConstants;
import android.view.View;
import android.view.WindowManager;
import android.view.animation.DecelerateInterpolator;
import android.widget.ImageView;
import android.widget.TextView;

import androidx.appcompat.app.AppCompatActivity;

import com.bumptech.glide.Glide;
import com.bumptech.glide.load.engine.DiskCacheStrategy;
import com.bumptech.glide.request.RequestOptions;

/**
 * ╔══════════════════════════════════════════════════════════════╗
 * ║    MeriLive — Full Screen Incoming Call UI v3.0              ║
 * ╠══════════════════════════════════════════════════════════════╣
 * ║                                                              ║
 * ║  Works in ALL device states:                                 ║
 * ║   ✅ Lock screen (ShowWhenLocked)                           ║
 * ║   ✅ Screen off (TurnScreenOn + WakeLock)                   ║
 * ║   ✅ App in background (FLAG_ACTIVITY_NEW_TASK)             ║
 * ║   ✅ App killed/not running (via foreground service)        ║
 * ║                                                              ║
 * ║  Features:                                                   ║
 * ║   ✅ Native ringtone + custom vibration pattern             ║
 * ║   ✅ Caller avatar with Glide (circular, cached)            ║
 * ║   ✅ Pulse animation on avatar                              ║
 * ║   ✅ Haptic feedback on button press                        ║
 * ║   ✅ Accept → open call in WebView                         ║
 * ║   ✅ Decline → stop service + notify WebView               ║
 * ║   ✅ Auto-close on "call ended" broadcast                  ║
 * ║   ✅ Back button disabled (must accept or decline)          ║
 * ║   ✅ Full immersive mode (hide system bars)                 ║
 * ║   ✅ DND-safe audio attributes                              ║
 * ║                                                              ║
 * ╚══════════════════════════════════════════════════════════════╝
 */
public class IncomingCallActivity extends AppCompatActivity {

    private static final String TAG = "MeriLive_CallUI";

    // Call data
    private String callId;
    private String callerName;
    private String callerAvatar;
    private String callerId;
    private String callType;

    // Hardware
    private Ringtone ringtone;
    private Vibrator vibrator;
    private PowerManager.WakeLock wakeLock;

    // UI
    private ImageView avatarImage;
    private TextView callerNameText;
    private TextView callTypeText;
    private View acceptButton;
    private View declineButton;
    private View pulseRing1;
    private View pulseRing2;

    // State
    private boolean isFinishing = false;
    private BroadcastReceiver callEndedReceiver;
    private AnimatorSet pulseAnimator;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        // ── Window flags for lock screen / screen off ──
        setupWindowForCall();

        setContentView(R.layout.activity_incoming_call);

        // ── Extract call data ──
        extractCallData();

        Log.i(TAG, "╔═══════════════════════════════════════╗");
        Log.i(TAG, "║  📞 Incoming Call: " + callerName);
        Log.i(TAG, "║  Type: " + callType + " | ID: " + callId);
        Log.i(TAG, "╚═══════════════════════════════════════╝");

        // ── Initialize UI ──
        initializeViews();

        // ── Start ringing + vibration ──
        startRinging();

        // ── Wake screen ──
        acquireWakeLock();

        // ── Pulse animation ──
        startPulseAnimation();

        // ── Listen for call ended ──
        registerCallEndedReceiver();
    }

    // ═══════════════════════════════════════
    //  WINDOW SETUP
    // ═══════════════════════════════════════

    private void setupWindowForCall() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O_MR1) {
            setShowWhenLocked(true);
            setTurnScreenOn(true);
            KeyguardManager km = (KeyguardManager) getSystemService(Context.KEYGUARD_SERVICE);
            if (km != null) km.requestDismissKeyguard(this, null);
        } else {
            getWindow().addFlags(
                WindowManager.LayoutParams.FLAG_SHOW_WHEN_LOCKED |
                WindowManager.LayoutParams.FLAG_DISMISS_KEYGUARD |
                WindowManager.LayoutParams.FLAG_TURN_SCREEN_ON |
                WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON
            );
        }

        // Full screen immersive
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_FULLSCREEN);
        getWindow().getDecorView().setSystemUiVisibility(
            View.SYSTEM_UI_FLAG_LAYOUT_STABLE |
            View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION |
            View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN |
            View.SYSTEM_UI_FLAG_HIDE_NAVIGATION |
            View.SYSTEM_UI_FLAG_FULLSCREEN |
            View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY
        );
    }

    // ═══════════════════════════════════════
    //  DATA EXTRACTION
    // ═══════════════════════════════════════

    private void extractCallData() {
        Intent intent = getIntent();
        callId       = intent.getStringExtra("call_id");
        callerName   = intent.getStringExtra("caller_name");
        callerAvatar = intent.getStringExtra("caller_avatar");
        callerId     = intent.getStringExtra("caller_id");
        callType     = intent.getStringExtra("call_type");

        if (callType == null) callType = "video";
        if (callerName == null || callerName.isEmpty()) callerName = "Unknown";
    }

    // ═══════════════════════════════════════
    //  UI INITIALIZATION
    // ═══════════════════════════════════════

    private void initializeViews() {
        avatarImage    = findViewById(R.id.caller_avatar);
        callerNameText = findViewById(R.id.caller_name);
        callTypeText   = findViewById(R.id.call_type_text);
        acceptButton   = findViewById(R.id.accept_call_button);
        declineButton  = findViewById(R.id.decline_call_button);

        // Optional pulse ring views
        pulseRing1 = findViewById(R.id.pulse_ring_1);
        pulseRing2 = findViewById(R.id.pulse_ring_2);

        // Set caller info
        callerNameText.setText(callerName);
        callTypeText.setText("audio".equalsIgnoreCase(callType)
            ? "📱 Incoming Audio Call"
            : "📹 Incoming Video Call");

        // Avatar with Glide
        if (callerAvatar != null && !callerAvatar.isEmpty()) {
            Glide.with(this)
                .load(callerAvatar)
                .apply(new RequestOptions()
                    .circleCrop()
                    .diskCacheStrategy(DiskCacheStrategy.ALL)
                    .placeholder(R.drawable.default_avatar)
                    .error(R.drawable.default_avatar))
                .into(avatarImage);
        }

        // ── Accept button ──
        acceptButton.setOnClickListener(v -> {
            if (isFinishing) return;
            isFinishing = true;
            v.performHapticFeedback(HapticFeedbackConstants.CONFIRM);
            Log.i(TAG, "✅ Call ACCEPTED by user");
            stopRinging();
            sendCallAction("accept");
            openMainActivityWithCall();
        });

        // ── Decline button ──
        declineButton.setOnClickListener(v -> {
            if (isFinishing) return;
            isFinishing = true;
            v.performHapticFeedback(HapticFeedbackConstants.REJECT);
            Log.i(TAG, "❌ Call DECLINED by user");
            stopRinging();
            sendCallAction("decline");
            stopCallService();
            finish();
        });
    }

    // ═══════════════════════════════════════
    //  PULSE ANIMATION
    // ═══════════════════════════════════════

    private void startPulseAnimation() {
        if (pulseRing1 == null || pulseRing2 == null) return;

        pulseRing1.setVisibility(View.VISIBLE);
        pulseRing2.setVisibility(View.VISIBLE);

        // Ring 1 — scale 1→2, alpha 1→0
        ObjectAnimator scaleX1 = ObjectAnimator.ofFloat(pulseRing1, "scaleX", 1f, 2.2f);
        ObjectAnimator scaleY1 = ObjectAnimator.ofFloat(pulseRing1, "scaleY", 1f, 2.2f);
        ObjectAnimator alpha1  = ObjectAnimator.ofFloat(pulseRing1, "alpha", 0.6f, 0f);

        // Ring 2 — delayed
        ObjectAnimator scaleX2 = ObjectAnimator.ofFloat(pulseRing2, "scaleX", 1f, 2.2f);
        ObjectAnimator scaleY2 = ObjectAnimator.ofFloat(pulseRing2, "scaleY", 1f, 2.2f);
        ObjectAnimator alpha2  = ObjectAnimator.ofFloat(pulseRing2, "alpha", 0.4f, 0f);

        pulseAnimator = new AnimatorSet();
        pulseAnimator.playTogether(scaleX1, scaleY1, alpha1, scaleX2, scaleY2, alpha2);
        pulseAnimator.setDuration(1500);
        pulseAnimator.setInterpolator(new DecelerateInterpolator());
        scaleX2.setStartDelay(400);
        scaleY2.setStartDelay(400);
        alpha2.setStartDelay(400);

        // Repeat
        pulseAnimator.addListener(new android.animation.AnimatorListenerAdapter() {
            @Override
            public void onAnimationEnd(android.animation.Animator animation) {
                if (!isFinishing && pulseAnimator != null) {
                    pulseRing1.setScaleX(1f);
                    pulseRing1.setScaleY(1f);
                    pulseRing1.setAlpha(0.6f);
                    pulseRing2.setScaleX(1f);
                    pulseRing2.setScaleY(1f);
                    pulseRing2.setAlpha(0.4f);
                    pulseAnimator.start();
                }
            }
        });
        pulseAnimator.start();
    }

    private void stopPulseAnimation() {
        if (pulseAnimator != null) {
            pulseAnimator.cancel();
            pulseAnimator = null;
        }
    }

    // ═══════════════════════════════════════
    //  RINGTONE + VIBRATION
    // ═══════════════════════════════════════

    private void startRinging() {
        try {
            // Ringtone
            Uri ringtoneUri = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_RINGTONE);
            ringtone = RingtoneManager.getRingtone(this, ringtoneUri);

            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
                ringtone.setLooping(true);
            }

            AudioAttributes attrs = new AudioAttributes.Builder()
                .setUsage(AudioAttributes.USAGE_NOTIFICATION_RINGTONE)
                .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                .build();
            ringtone.setAudioAttributes(attrs);
            ringtone.play();

            // Vibration
            startVibration();

            Log.d(TAG, "🔔 Ringing started");
        } catch (Exception e) {
            Log.e(TAG, "Ringtone error", e);
        }
    }

    private void startVibration() {
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                VibratorManager vm = (VibratorManager) getSystemService(Context.VIBRATOR_MANAGER_SERVICE);
                vibrator = vm.getDefaultVibrator();
            } else {
                vibrator = (Vibrator) getSystemService(Context.VIBRATOR_SERVICE);
            }

            // Pattern: buzz-pause-buzz-pause (repeat)
            long[] pattern = {0, 800, 400, 800, 400, 800};

            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                vibrator.vibrate(VibrationEffect.createWaveform(pattern, 0));
            } else {
                vibrator.vibrate(pattern, 0);
            }
        } catch (Exception e) {
            Log.e(TAG, "Vibration error", e);
        }
    }

    private void stopRinging() {
        try { if (ringtone != null && ringtone.isPlaying()) ringtone.stop(); } catch (Exception ignored) {}
        try { if (vibrator != null) vibrator.cancel(); } catch (Exception ignored) {}
    }

    // ═══════════════════════════════════════
    //  WAKE LOCK
    // ═══════════════════════════════════════

    private void acquireWakeLock() {
        try {
            PowerManager pm = (PowerManager) getSystemService(Context.POWER_SERVICE);
            wakeLock = pm.newWakeLock(
                PowerManager.FULL_WAKE_LOCK |
                PowerManager.ACQUIRE_CAUSES_WAKEUP |
                PowerManager.ON_AFTER_RELEASE,
                "MeriLive:IncomingCallWakeLock"
            );
            wakeLock.acquire(65_000L);
        } catch (Exception e) {
            Log.e(TAG, "WakeLock error", e);
        }
    }

    private void releaseWakeLock() {
        try {
            if (wakeLock != null && wakeLock.isHeld()) wakeLock.release();
        } catch (Exception ignored) {}
    }

    // ═══════════════════════════════════════
    //  CALL ACTIONS
    // ═══════════════════════════════════════

    private void sendCallAction(String action) {
        Intent intent = new Intent(CallActionReceiver.ACTION_CALL);
        intent.putExtra("action", action);
        intent.putExtra("call_id", callId);
        intent.putExtra("caller_id", callerId);
        sendBroadcast(intent);
    }

    private void openMainActivityWithCall() {
        Intent intent = new Intent(this, MainActivity.class);
        intent.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        intent.putExtra("open_call", true);
        intent.putExtra("call_id", callId);
        intent.putExtra("caller_id", callerId);
        intent.putExtra("call_type", callType);
        startActivity(intent);
        finish();
        overridePendingTransition(android.R.anim.fade_in, android.R.anim.fade_out);
    }

    private void stopCallService() {
        Intent intent = new Intent(this, IncomingCallService.class);
        intent.setAction(IncomingCallService.ACTION_DECLINE);
        stopService(intent);
    }

    // ═══════════════════════════════════════
    //  CALL ENDED RECEIVER
    // ═══════════════════════════════════════

    private void registerCallEndedReceiver() {
        callEndedReceiver = new BroadcastReceiver() {
            @Override
            public void onReceive(Context context, Intent intent) {
                String endedCallId = intent.getStringExtra("call_id");
                if (callId != null && callId.equals(endedCallId)) {
                    Log.i(TAG, "📴 Call ended externally — closing UI");
                    isFinishing = true;
                    stopRinging();
                    finish();
                }
            }
        };

        IntentFilter filter = new IntentFilter(CallActionReceiver.ACTION_CLOSE);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            registerReceiver(callEndedReceiver, filter, RECEIVER_NOT_EXPORTED);
        } else {
            registerReceiver(callEndedReceiver, filter);
        }
    }

    // ═══════════════════════════════════════
    //  LIFECYCLE
    // ═══════════════════════════════════════

    @Override
    protected void onDestroy() {
        super.onDestroy();
        isFinishing = true;
        stopRinging();
        stopPulseAnimation();
        releaseWakeLock();

        if (callEndedReceiver != null) {
            try { unregisterReceiver(callEndedReceiver); } catch (Exception ignored) {}
        }
        Log.i(TAG, "🔴 IncomingCallActivity destroyed");
    }

    @Override
    public void onBackPressed() {
        // Disabled — must accept or decline
    }
}
