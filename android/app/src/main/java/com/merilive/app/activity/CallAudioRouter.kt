package com.merilive.app.activity

import android.content.Context
import android.media.AudioDeviceCallback
import android.media.AudioDeviceInfo
import android.media.AudioManager
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.util.Log

/**
 * Pkg500 Phase E — CallAudioRouter
 *
 * Honest-private-call Android P1 batch (A-1 + A-2 + A-3):
 *  - A-1: API 31+ uses AudioManager.setCommunicationDevice(...) instead of the
 *    deprecated isSpeakerphoneOn / setSpeakerphoneOn which are silent no-ops
 *    on Pixel + many OEMs on Android 12+.
 *  - A-2: Registers an AudioDeviceCallback so BT/wired headset connected MID-
 *    call automatically takes over routing (Bigo/Chamet behaviour).
 *  - A-3: Captures the safe "previous" mode (NORMAL fallback) so a back-to-
 *    back call doesn't leave the device pinned in MODE_IN_COMMUNICATION.
 *
 * We deliberately do NOT request audio focus here — `LiveKitPlugin` already
 * owns the call audio focus + AudioAttributes (USAGE_VOICE_COMMUNICATION).
 */
class CallAudioRouter(context: Context) {

    private val appCtx = context.applicationContext
    private val am: AudioManager =
        appCtx.getSystemService(Context.AUDIO_SERVICE) as AudioManager
    private val mainHandler = Handler(Looper.getMainLooper())

    private var originalMode: Int = AudioManager.MODE_NORMAL
    private var originalSpeaker: Boolean = false
    private var attached = false
    private var userPrefersSpeaker = true

    private var deviceCallback: AudioDeviceCallback? = null

    /** True if a BT SCO/A2DP, wired, or USB headset is currently connected. */
    fun isExternalAudioDeviceConnected(): Boolean {
        return findExternalDevice() != null
    }

    private fun findExternalDevice(): AudioDeviceInfo? {
        return try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                val devices = am.getDevices(AudioManager.GET_DEVICES_OUTPUTS)
                // Priority: BT SCO (call-grade) > wired/USB > BT A2DP.
                devices.firstOrNull { it.type == AudioDeviceInfo.TYPE_BLUETOOTH_SCO }
                    ?: devices.firstOrNull {
                        it.type == AudioDeviceInfo.TYPE_WIRED_HEADSET ||
                        it.type == AudioDeviceInfo.TYPE_WIRED_HEADPHONES ||
                        it.type == AudioDeviceInfo.TYPE_USB_HEADSET
                    }
                    ?: devices.firstOrNull { it.type == AudioDeviceInfo.TYPE_BLUETOOTH_A2DP }
            } else null
        } catch (t: Throwable) {
            Log.w(TAG, "findExternalDevice: ${t.message}")
            null
        }
    }

    /**
     * Take over voice-comm mode and apply initial routing. Returns the
     * speaker state actually applied (may be false even if requested true,
     * when an external device is connected).
     */
    fun attach(defaultSpeakerOn: Boolean = true): Boolean {
        if (attached) return isSpeakerOn()

        // A-3: never preserve MODE_IN_COMMUNICATION/MODE_IN_CALL — those are
        // intermediate states from a previous call that wasn't torn down.
        val curMode = am.mode
        originalMode = if (curMode == AudioManager.MODE_IN_COMMUNICATION ||
                           curMode == AudioManager.MODE_IN_CALL ||
                           curMode == AudioManager.MODE_RINGTONE) {
            AudioManager.MODE_NORMAL
        } else curMode
        originalSpeaker = try { am.isSpeakerphoneOn } catch (_: Throwable) { false }
        userPrefersSpeaker = defaultSpeakerOn

        try {
            am.mode = AudioManager.MODE_IN_COMMUNICATION
        } catch (t: Throwable) { Log.w(TAG, "attach mode: ${t.message}") }

        attached = true

        // A-2: register device callback so mid-call BT/wired connect re-routes.
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M && deviceCallback == null) {
                val cb = object : AudioDeviceCallback() {
                    override fun onAudioDevicesAdded(addedDevices: Array<out AudioDeviceInfo>?) {
                        if (!attached) return
                        val newExternal = addedDevices?.any {
                            it.type == AudioDeviceInfo.TYPE_BLUETOOTH_SCO ||
                            it.type == AudioDeviceInfo.TYPE_BLUETOOTH_A2DP ||
                            it.type == AudioDeviceInfo.TYPE_WIRED_HEADSET ||
                            it.type == AudioDeviceInfo.TYPE_WIRED_HEADPHONES ||
                            it.type == AudioDeviceInfo.TYPE_USB_HEADSET
                        } == true
                        if (newExternal) {
                            Log.i(TAG, "External audio device connected mid-call → handover")
                            mainHandler.post { applySpeaker(false) }
                        }
                    }
                    override fun onAudioDevicesRemoved(removedDevices: Array<out AudioDeviceInfo>?) {
                        if (!attached) return
                        // If the user's preferred state was speaker and the
                        // external device is gone, restore speaker.
                        if (userPrefersSpeaker && !isExternalAudioDeviceConnected()) {
                            Log.i(TAG, "External audio device removed → restoring speaker")
                            mainHandler.post { applySpeaker(true) }
                        }
                    }
                }
                am.registerAudioDeviceCallback(cb, mainHandler)
                deviceCallback = cb
            }
        } catch (t: Throwable) { Log.w(TAG, "registerAudioDeviceCallback: ${t.message}") }

        return applySpeaker(defaultSpeakerOn)
    }

    /**
     * Apply speaker state. Returns final speaker state — if a headset is
     * connected we keep speaker OFF regardless of request (don't fight the OS).
     */
    fun applySpeaker(on: Boolean): Boolean {
        userPrefersSpeaker = on
        val external = findExternalDevice()
        val target = if (external != null) false else on

        // A-1: API 31+ — use setCommunicationDevice; the legacy setter is a
        // no-op on Pixel/Samsung.
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            try {
                val outputs = am.availableCommunicationDevices
                val desiredType = when {
                    external?.type == AudioDeviceInfo.TYPE_BLUETOOTH_SCO -> AudioDeviceInfo.TYPE_BLUETOOTH_SCO
                    external?.type == AudioDeviceInfo.TYPE_WIRED_HEADSET -> AudioDeviceInfo.TYPE_WIRED_HEADSET
                    external?.type == AudioDeviceInfo.TYPE_WIRED_HEADPHONES -> AudioDeviceInfo.TYPE_WIRED_HEADPHONES
                    external?.type == AudioDeviceInfo.TYPE_USB_HEADSET -> AudioDeviceInfo.TYPE_USB_HEADSET
                    target -> AudioDeviceInfo.TYPE_BUILTIN_SPEAKER
                    else -> AudioDeviceInfo.TYPE_BUILTIN_EARPIECE
                }
                val device = outputs.firstOrNull { it.type == desiredType }
                    ?: outputs.firstOrNull {
                        if (target) it.type == AudioDeviceInfo.TYPE_BUILTIN_SPEAKER
                        else it.type == AudioDeviceInfo.TYPE_BUILTIN_EARPIECE
                    }
                if (device != null) {
                    am.setCommunicationDevice(device)
                } else {
                    Log.w(TAG, "No matching communication device for $desiredType")
                }
            } catch (t: Throwable) {
                Log.w(TAG, "setCommunicationDevice failed, falling back: ${t.message}")
                @Suppress("DEPRECATION")
                try { am.isSpeakerphoneOn = target } catch (_: Throwable) {}
            }
        } else {
            @Suppress("DEPRECATION")
            try { am.isSpeakerphoneOn = target } catch (_: Throwable) {}
        }

        return isSpeakerOn()
    }

    fun isSpeakerOn(): Boolean {
        return try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                am.communicationDevice?.type == AudioDeviceInfo.TYPE_BUILTIN_SPEAKER
            } else {
                @Suppress("DEPRECATION")
                am.isSpeakerphoneOn
            }
        } catch (_: Throwable) { false }
    }

    fun detach() {
        if (!attached) return
        attached = false

        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M && deviceCallback != null) {
                am.unregisterAudioDeviceCallback(deviceCallback)
            }
        } catch (_: Throwable) {}
        deviceCallback = null

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            try { am.clearCommunicationDevice() } catch (_: Throwable) {}
        }
        @Suppress("DEPRECATION")
        try { am.isSpeakerphoneOn = originalSpeaker } catch (_: Throwable) {}
        try { am.mode = originalMode } catch (_: Throwable) {}
    }

    companion object { private const val TAG = "CallAudioRouter" }
}
