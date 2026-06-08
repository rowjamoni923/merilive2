package com.merilive.app.activity

import android.content.Context
import android.media.AudioManager
import android.os.Build
import android.util.Log

/**
 * Pkg500 Phase E — CallAudioRouter
 *
 * Thin AudioManager wrapper for the native PrivateCallActivity. Mirrors how
 * WhatsApp / Telegram / Chamet handle in-call audio:
 *
 *  - Default for video call: SPEAKERPHONE ON (so the user can hold the phone
 *    naturally, like a video call — not glued to the ear).
 *  - User can toggle speaker → earpiece (or vice-versa) from the bottom bar.
 *  - If a Bluetooth headset or wired headset is connected, we DO NOT force
 *    speaker — the OS / our Telecom self-managed Connection (Pkg208) already
 *    routes to the preferred device, and overriding it would be hostile.
 *  - On detach we restore the original AudioManager mode so app-wide audio
 *    (notification sounds, media) isn't left in MODE_IN_COMMUNICATION.
 *
 * We deliberately do NOT request audio focus here — `LiveKitPlugin` already
 * owns the call audio focus + AudioAttributes (USAGE_VOICE_COMMUNICATION).
 * Touching it twice causes ducking glitches on Xiaomi/Vivo.
 */
class CallAudioRouter(context: Context) {

    private val appCtx = context.applicationContext
    private val am: AudioManager =
        appCtx.getSystemService(Context.AUDIO_SERVICE) as AudioManager

    private var originalMode: Int = am.mode
    private var originalSpeaker: Boolean = am.isSpeakerphoneOn
    private var attached = false

    /** True if a BT SCO or wired headset is currently the active output. */
    fun isExternalAudioDeviceConnected(): Boolean {
        return try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                val devices = am.getDevices(AudioManager.GET_DEVICES_OUTPUTS)
                devices.any { d ->
                    when (d.type) {
                        AudioManager.DEVICE_OUT_BLUETOOTH_SCO,
                        AudioManager.DEVICE_OUT_BLUETOOTH_A2DP,
                        AudioManager.DEVICE_OUT_WIRED_HEADSET,
                        AudioManager.DEVICE_OUT_WIRED_HEADPHONES,
                        AudioManager.DEVICE_OUT_USB_HEADSET -> true
                        else -> false
                    }
                }
            } else {
                @Suppress("DEPRECATION")
                am.isBluetoothScoOn || am.isWiredHeadsetOn
            }
        } catch (t: Throwable) {
            Log.w(TAG, "isExternalAudioDeviceConnected: ${t.message}")
            false
        }
    }

    /**
     * Take over voice-comm mode and apply the initial routing. Returns the
     * speaker state actually applied (may be false even if requested true,
     * when an external device is connected).
     */
    fun attach(defaultSpeakerOn: Boolean = true): Boolean {
        if (attached) return am.isSpeakerphoneOn
        originalMode = am.mode
        originalSpeaker = am.isSpeakerphoneOn
        try {
            am.mode = AudioManager.MODE_IN_COMMUNICATION
        } catch (t: Throwable) { Log.w(TAG, "attach mode: ${t.message}") }
        attached = true
        val applied = applySpeaker(defaultSpeakerOn)
        return applied
    }

    /**
     * Apply speaker state. Returns final speaker state — if a headset is
     * connected we keep speaker OFF regardless of request (don't fight the OS).
     */
    fun applySpeaker(on: Boolean): Boolean {
        val external = isExternalAudioDeviceConnected()
        val target = if (external) false else on
        try {
            am.isSpeakerphoneOn = target
        } catch (t: Throwable) { Log.w(TAG, "applySpeaker: ${t.message}") }
        return am.isSpeakerphoneOn
    }

    fun isSpeakerOn(): Boolean = try { am.isSpeakerphoneOn } catch (_: Throwable) { false }

    fun detach() {
        if (!attached) return
        try { am.isSpeakerphoneOn = originalSpeaker } catch (_: Throwable) {}
        try { am.mode = originalMode } catch (_: Throwable) {}
        attached = false
    }

    companion object { private const val TAG = "CallAudioRouter" }
}
