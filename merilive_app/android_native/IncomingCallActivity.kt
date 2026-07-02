package com.merilive.app.ui.call

import android.app.KeyguardManager
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.media.AudioAttributes
import android.media.Ringtone
import android.media.RingtoneManager
import android.os.Build
import android.os.Bundle
import android.os.PowerManager
import android.os.VibrationEffect
import android.os.Vibrator
import android.os.VibratorManager
import android.view.View
import android.view.WindowManager
import android.widget.TextView
import androidx.appcompat.app.AppCompatActivity
import com.merilive.app.MainActivity
import com.merilive.app.R
import com.merilive.app.service.IncomingCallService
import com.merilive.app.service.MeriFirebaseMessagingService


class IncomingCallActivity : AppCompatActivity() {

    private var callId: String? = null
    private var callerName: String? = null
    private var callerAvatar: String? = null
    private var callerId: String? = null
    private var callType: String? = null

    private var ringtone: Ringtone? = null
    private var vibrator: Vibrator? = null
    private var wakeLock: PowerManager.WakeLock? = null

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setupWindowFlags()
        setContentView(R.layout.activity_incoming_call)

        callId = intent.getStringExtra("call_id")
        callerName = intent.getStringExtra("caller_name") ?: "Unknown"
        callerAvatar = intent.getStringExtra("caller_avatar")
        callerId = intent.getStringExtra("caller_id")
        callType = intent.getStringExtra("call_type") ?: "video"

        initializeViews()
        startRinging()
        acquireWakeLock()
        registerDismissReceiver()
    }


    private fun setupWindowFlags() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O_MR1) {
            setShowWhenLocked(true)
            setTurnScreenOn(true)
            val km = getSystemService(Context.KEYGUARD_SERVICE) as? KeyguardManager
            km?.requestDismissKeyguard(this, null)
        } else {
            @Suppress("DEPRECATION")
            window.addFlags(
                WindowManager.LayoutParams.FLAG_SHOW_WHEN_LOCKED or
                    WindowManager.LayoutParams.FLAG_DISMISS_KEYGUARD or
                    WindowManager.LayoutParams.FLAG_TURN_SCREEN_ON or
                    WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON
            )
        }
        @Suppress("DEPRECATION")
        window.addFlags(WindowManager.LayoutParams.FLAG_FULLSCREEN)
        @Suppress("DEPRECATION")
        window.decorView.systemUiVisibility = (
            View.SYSTEM_UI_FLAG_LAYOUT_STABLE or
                View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION or
                View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN or
                View.SYSTEM_UI_FLAG_HIDE_NAVIGATION or
                View.SYSTEM_UI_FLAG_FULLSCREEN or
                View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY
            )
    }

    private fun initializeViews() {
        val callerNameText = findViewById<TextView>(R.id.caller_name)
        val callTypeText = findViewById<TextView>(R.id.call_type_text)
        val acceptButton = findViewById<View>(R.id.accept_call_button)
        val declineButton = findViewById<View>(R.id.decline_call_button)

        callerNameText.text = callerName
        callTypeText.text = if (callType == "audio") "Incoming Audio Call" else "Incoming Video Call"

        acceptButton.setOnClickListener {
            stopRinging()
            stopCallService()
            sendActionToWebView("accept")
            openMainActivityWithCall()
        }

        declineButton.setOnClickListener {
            stopRinging()
            stopCallService()
            sendActionToWebView("decline")
            finish()
        }
    }

    private fun startRinging() {
        try {
            val ringtoneUri = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_RINGTONE)
            ringtone = RingtoneManager.getRingtone(this, ringtoneUri)
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
                ringtone?.isLooping = true
            }
            val aa = AudioAttributes.Builder()
                .setUsage(AudioAttributes.USAGE_NOTIFICATION_RINGTONE)
                .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                .build()
            ringtone?.audioAttributes = aa
            ringtone?.play()
            startVibration()
        } catch (e: Exception) {
            e.printStackTrace()
        }
    }

    private fun startVibration() {
        try {
            vibrator = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                val vm = getSystemService(Context.VIBRATOR_MANAGER_SERVICE) as VibratorManager
                vm.defaultVibrator
            } else {
                @Suppress("DEPRECATION")
                getSystemService(Context.VIBRATOR_SERVICE) as Vibrator
            }
            val pattern = longArrayOf(0, 1000, 1000)
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                vibrator?.vibrate(VibrationEffect.createWaveform(pattern, 0))
            } else {
                @Suppress("DEPRECATION")
                vibrator?.vibrate(pattern, 0)
            }
        } catch (e: Exception) {
            e.printStackTrace()
        }
    }

    private fun stopRinging() {
        try {
            if (ringtone?.isPlaying == true) ringtone?.stop()
            vibrator?.cancel()
        } catch (e: Exception) {
            e.printStackTrace()
        }
    }

    private fun acquireWakeLock() {
        try {
            val pm = getSystemService(Context.POWER_SERVICE) as PowerManager
            @Suppress("DEPRECATION")
            wakeLock = pm.newWakeLock(
                PowerManager.FULL_WAKE_LOCK or PowerManager.ACQUIRE_CAUSES_WAKEUP or PowerManager.ON_AFTER_RELEASE,
                "MeriLive:IncomingCallWakeLock"
            )
            wakeLock?.acquire(60 * 1000L)
        } catch (e: Exception) {
            e.printStackTrace()
        }
    }

    private fun stopCallService() {
        val stopIntent = Intent(this, IncomingCallService::class.java).apply {
            action = IncomingCallService.ACTION_STOP_CALL
        }
        stopService(stopIntent)
    }

    private fun sendActionToWebView(action: String) {
        // Persist to SharedPreferences FIRST so a cold-starting Flutter engine
        // can pick this up via IncomingCallBridgePlugin.pending even if the
        // broadcast fires before its receiver is registered.
        try {
            val prefs = getSharedPreferences(
                MeriFirebaseMessagingService.PENDING_PREFS, Context.MODE_PRIVATE
            )
            prefs.edit()
                .putString(MeriFirebaseMessagingService.PENDING_KEY_ACTION, action)
                .putString(MeriFirebaseMessagingService.PENDING_KEY_CALL_ID, callId)
                .putString(MeriFirebaseMessagingService.PENDING_KEY_CALLER_ID, callerId)
                .putString(MeriFirebaseMessagingService.PENDING_KEY_CALLER_NAME, callerName)
                .putString(MeriFirebaseMessagingService.PENDING_KEY_CALLER_AVATAR, callerAvatar)
                .putString(MeriFirebaseMessagingService.PENDING_KEY_CALL_TYPE, callType)
                .putLong(MeriFirebaseMessagingService.PENDING_KEY_TS, System.currentTimeMillis())
                .apply()
        } catch (_: Exception) {}
        val broadcastIntent = Intent(MeriFirebaseMessagingService.BROADCAST_ACTION).apply {
            setPackage(packageName)
            putExtra("action", action)
            putExtra("call_id", callId)
            putExtra("caller_id", callerId)
            putExtra("caller_name", callerName)
            putExtra("caller_avatar", callerAvatar)
            putExtra("call_type", callType)
        }
        sendBroadcast(broadcastIntent)
    }

    private var dismissReceiver: BroadcastReceiver? = null
    private fun registerDismissReceiver() {
        dismissReceiver = object : BroadcastReceiver() {
            override fun onReceive(context: Context?, intent: Intent?) {
                val incomingId = intent?.getStringExtra("call_id")
                if (incomingId == null || incomingId == callId) {
                    stopRinging()
                    finish()
                }
            }
        }
        val filter = IntentFilter("com.merilive.app.INCOMING_CALL_DISMISS")
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            registerReceiver(dismissReceiver, filter, Context.RECEIVER_NOT_EXPORTED)
        } else {
            @Suppress("UnspecifiedRegisterReceiverFlag")
            registerReceiver(dismissReceiver, filter)
        }
    }


    private fun openMainActivityWithCall() {
        val intent = Intent(this, MainActivity::class.java).apply {
            flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP
            putExtra("open_call", true)
            putExtra("call_id", callId)
            putExtra("caller_id", callerId)
            putExtra("call_type", callType)
        }
        startActivity(intent)
        finish()
    }

    override fun onDestroy() {
        super.onDestroy()
        stopRinging()
        try {
            if (wakeLock?.isHeld == true) wakeLock?.release()
        } catch (e: Exception) {
            e.printStackTrace()
        }
    }

    @Suppress("DEPRECATION")
    override fun onBackPressed() {
        // Block back button - must accept or decline
    }
}
