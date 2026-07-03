package com.merilive.app.plugin;

import android.content.Context;
import android.media.AudioAttributes;
import android.media.AudioDeviceInfo;
import android.media.AudioFocusRequest;
import android.media.AudioManager;
import android.os.Build;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * Pkg267 — Audio focus + routing manager.
 *
 * - requestFocus(usage) → tells the OS we own audio. Other apps
 *   (Spotify/YouTube/Podcasts) auto-pause on AUDIOFOCUS_LOSS_TRANSIENT
 *   and auto-resume when we abandon.
 * - abandonFocus()
 * - setSpeakerOn(on) / setBluetoothScoOn(on) / setMode(mode)
 * - getRoute() → "earpiece" | "speaker" | "bluetooth" | "wired"
 *
 * Emits "focusChange" event when we lose/regain focus (incoming phone
 * call, alarm, etc.) so JS can mute/duck and resume.
 */
@CapacitorPlugin(name = "AudioFocus")
public class AudioFocusPlugin extends Plugin {

    private AudioManager am;
    private AudioFocusRequest focusReq; // API 26+
    private AudioManager.OnAudioFocusChangeListener legacyListener; // <26

    @Override
    public void load() {
        super.load();
        am = (AudioManager) getContext().getSystemService(Context.AUDIO_SERVICE);
    }

    @PluginMethod
    public void requestFocus(PluginCall call) {
        if (am == null) { call.reject("AudioManager unavailable"); return; }
        // usage: "call" (voice/video call) | "media" (live stream playback)
        String usage = call.getString("usage", "call");
        int audioUsage = "media".equals(usage)
            ? AudioAttributes.USAGE_MEDIA
            : AudioAttributes.USAGE_VOICE_COMMUNICATION;
        int contentType = "media".equals(usage)
            ? AudioAttributes.CONTENT_TYPE_MUSIC
            : AudioAttributes.CONTENT_TYPE_SPEECH;

        AudioManager.OnAudioFocusChangeListener listener = this::emitFocusChange;

        int focusGain = "media".equals(usage)
            ? AudioManager.AUDIOFOCUS_GAIN
            : AudioManager.AUDIOFOCUS_GAIN_TRANSIENT;
        int legacyStream = "media".equals(usage)
            ? AudioManager.STREAM_MUSIC
            : AudioManager.STREAM_VOICE_CALL;

        int result;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            AudioAttributes attrs = new AudioAttributes.Builder()
                .setUsage(audioUsage)
                .setContentType(contentType)
                .build();
            focusReq = new AudioFocusRequest.Builder(focusGain)
                .setAudioAttributes(attrs)
                .setAcceptsDelayedFocusGain(true)
                .setWillPauseWhenDucked(false)
                .setOnAudioFocusChangeListener(listener)
                .build();
            result = am.requestAudioFocus(focusReq);
        } else {
            legacyListener = listener;
            //noinspection deprecation
            result = am.requestAudioFocus(
                legacyListener,
                legacyStream,
                focusGain
            );
        }

        JSObject ret = new JSObject();
        ret.put("granted", result == AudioManager.AUDIOFOCUS_REQUEST_GRANTED);
        ret.put("delayed", result == AudioManager.AUDIOFOCUS_REQUEST_DELAYED);
        call.resolve(ret);
    }

    @PluginMethod
    public void abandonFocus(PluginCall call) {
        if (am == null) { call.resolve(); return; }
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                if (focusReq != null) {
                    am.abandonAudioFocusRequest(focusReq);
                    focusReq = null;
                }
            } else if (legacyListener != null) {
                //noinspection deprecation
                am.abandonAudioFocus(legacyListener);
                legacyListener = null;
            }
            call.resolve();
        } catch (Throwable t) {
            call.reject("abandonFocus failed: " + t.getMessage(), t);
        }
    }

    @PluginMethod
    public void setMode(PluginCall call) {
        if (am == null) { call.reject("AudioManager unavailable"); return; }
        // mode: "normal" | "in_communication" | "ringtone"
        String mode = call.getString("mode", "in_communication");
        int m;
        switch (mode) {
            case "normal":    m = AudioManager.MODE_NORMAL; break;
            case "ringtone":  m = AudioManager.MODE_RINGTONE; break;
            case "in_communication":
            default: m = AudioManager.MODE_IN_COMMUNICATION;
        }
        try {
            am.setMode(m);
            call.resolve();
        } catch (Throwable t) {
            call.reject("setMode failed: " + t.getMessage(), t);
        }
    }

    @PluginMethod
    public void setSpeakerOn(PluginCall call) {
        if (am == null) { call.reject("AudioManager unavailable"); return; }
        boolean on = Boolean.TRUE.equals(call.getBoolean("on", false));
        try {
            am.setSpeakerphoneOn(on);
            JSObject ret = new JSObject();
            ret.put("on", am.isSpeakerphoneOn());
            call.resolve(ret);
        } catch (Throwable t) {
            call.reject("setSpeakerOn failed: " + t.getMessage(), t);
        }
    }

    @PluginMethod
    public void setBluetoothScoOn(PluginCall call) {
        if (am == null) { call.reject("AudioManager unavailable"); return; }
        boolean on = Boolean.TRUE.equals(call.getBoolean("on", false));
        try {
            if (on) {
                am.startBluetoothSco();
                am.setBluetoothScoOn(true);
            } else {
                am.setBluetoothScoOn(false);
                am.stopBluetoothSco();
            }
            JSObject ret = new JSObject();
            ret.put("on", am.isBluetoothScoOn());
            call.resolve(ret);
        } catch (Throwable t) {
            call.reject("setBluetoothScoOn failed: " + t.getMessage(), t);
        }
    }

    @PluginMethod
    public void getRoute(PluginCall call) {
        if (am == null) { call.reject("AudioManager unavailable"); return; }
        String route = "earpiece";
        try {
            if (am.isBluetoothScoOn() || am.isBluetoothA2dpOn()) {
                route = "bluetooth";
            } else if (am.isSpeakerphoneOn()) {
                route = "speaker";
            } else if (am.isWiredHeadsetOn()) {
                route = "wired";
            } else if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                AudioDeviceInfo[] devs = am.getDevices(AudioManager.GET_DEVICES_OUTPUTS);
                for (AudioDeviceInfo d : devs) {
                    int t = d.getType();
                    if (t == AudioDeviceInfo.TYPE_BLUETOOTH_SCO || t == AudioDeviceInfo.TYPE_BLUETOOTH_A2DP) {
                        route = "bluetooth"; break;
                    } else if (t == AudioDeviceInfo.TYPE_WIRED_HEADPHONES || t == AudioDeviceInfo.TYPE_WIRED_HEADSET) {
                        route = "wired"; break;
                    }
                }
            }
        } catch (Throwable ignored) {}
        JSObject ret = new JSObject();
        ret.put("route", route);
        call.resolve(ret);
    }

    private void emitFocusChange(int change) {
        String s;
        switch (change) {
            case AudioManager.AUDIOFOCUS_GAIN:                 s = "gain"; break;
            case AudioManager.AUDIOFOCUS_LOSS:                 s = "loss"; break;
            case AudioManager.AUDIOFOCUS_LOSS_TRANSIENT:       s = "loss_transient"; break;
            case AudioManager.AUDIOFOCUS_LOSS_TRANSIENT_CAN_DUCK: s = "loss_transient_can_duck"; break;
            default: s = "unknown";
        }
        JSObject data = new JSObject();
        data.put("change", s);
        notifyListeners("focusChange", data);
    }

    @Override
    protected void handleOnDestroy() {
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                if (focusReq != null && am != null) am.abandonAudioFocusRequest(focusReq);
            } else if (legacyListener != null && am != null) {
                //noinspection deprecation
                am.abandonAudioFocus(legacyListener);
            }
        } catch (Throwable ignored) {}
        focusReq = null;
        legacyListener = null;
        super.handleOnDestroy();
    }
}
