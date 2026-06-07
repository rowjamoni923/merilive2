package com.merilive.app.plugin.video;

import android.media.audiofx.AcousticEchoCanceler;
import android.media.audiofx.AutomaticGainControl;
import android.media.audiofx.BassBoost;
import android.media.audiofx.Equalizer;
import android.media.audiofx.NoiseSuppressor;
import android.media.audiofx.PresetReverb;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.util.Locale;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

/**
 * Pkg435 — Real per-session audio effects.
 *
 * Previously {@code sessionId} was hardcoded to 0, so AEC/NS/AGC were
 * created but never bound to any real audio stream (silent no-op).
 * Now caller passes the session id from LiveKit/AudioRecord/MediaPlayer
 * (use {@code audioTrack.getAudioSessionId()} on JS side), and effects
 * are kept alive in a per-session map for clean release.
 *
 * JS API:
 *   enableProfessionalAudio({ sessionId })              → AEC + NS + AGC
 *   setAudioEffect({ sessionId, type, level })          → reverb|bass|equalizer
 *   releaseSession({ sessionId })
 */
@CapacitorPlugin(name = "NativeAudioEngine")
public class NativeAudioEnginePlugin extends Plugin {

    private static class SessionFx {
        AcousticEchoCanceler aec;
        NoiseSuppressor ns;
        AutomaticGainControl agc;
        PresetReverb reverb;
        BassBoost bass;
        Equalizer eq;
    }

    // Pkg-audit Tier-4: Capacitor dispatches @PluginMethod calls on a pool of
    // background threads. A plain HashMap here would race between concurrent
    // enableProfessionalAudio / setAudioEffect / releaseSession invocations,
    // causing ConcurrentModificationException, lost SessionFx entries, and
    // leaked AudioEffect natives. ConcurrentHashMap + computeIfAbsent below.
    private final Map<Integer, SessionFx> sessions = new ConcurrentHashMap<>();

    @PluginMethod
    public void enableProfessionalAudio(PluginCall call) {
        Integer sid = call.getInt("sessionId");
        if (sid == null || sid <= 0) { call.reject("missing sessionId (use audioTrack.getAudioSessionId())"); return; }

        boolean echoSupported = AcousticEchoCanceler.isAvailable();
        boolean noiseSupported = NoiseSuppressor.isAvailable();
        boolean gainSupported = AutomaticGainControl.isAvailable();

        // Atomic get-or-create — see ConcurrentHashMap note above.
        SessionFx fx = sessions.computeIfAbsent(sid, k -> new SessionFx());

        try {
            if (echoSupported && fx.aec == null) {
                fx.aec = AcousticEchoCanceler.create(sid);
                if (fx.aec != null) fx.aec.setEnabled(true);
            }
            if (noiseSupported && fx.ns == null) {
                fx.ns = NoiseSuppressor.create(sid);
                if (fx.ns != null) fx.ns.setEnabled(true);
            }
            if (gainSupported && fx.agc == null) {
                fx.agc = AutomaticGainControl.create(sid);
                if (fx.agc != null) fx.agc.setEnabled(true);
            }
        } catch (Throwable t) {
            call.reject("audio effect bind failed: " + t.getMessage());
            return;
        }

        JSObject ret = new JSObject();
        ret.put("sessionId", sid);
        ret.put("echoCancellation", fx.aec != null && fx.aec.getEnabled());
        ret.put("noiseSuppression", fx.ns != null && fx.ns.getEnabled());
        ret.put("autoGainControl", fx.agc != null && fx.agc.getEnabled());
        call.resolve(ret);
    }

    @PluginMethod
    public void setAudioEffect(PluginCall call) {
        Integer sid = call.getInt("sessionId");
        if (sid == null || sid <= 0) { call.reject("missing sessionId"); return; }
        String type = call.getString("type", "normal");
        int level = call.getInt("level", 50); // 0..100
        if (level < 0) level = 0; if (level > 100) level = 100;

        SessionFx fx = sessions.computeIfAbsent(sid, k -> new SessionFx());

        try {
            String t = type == null ? "normal" : type.toLowerCase(Locale.US);
            switch (t) {
                case "normal":
                    if (fx.reverb != null) { fx.reverb.setEnabled(false); }
                    if (fx.bass != null) { fx.bass.setEnabled(false); }
                    if (fx.eq != null) { fx.eq.setEnabled(false); }
                    break;
                case "reverb_hall":
                case "reverb_room":
                case "reverb_plate":
                    if (fx.reverb == null) fx.reverb = new PresetReverb(0, sid);
                    short preset = PresetReverb.PRESET_MEDIUMHALL;
                    if ("reverb_room".equals(t)) preset = PresetReverb.PRESET_MEDIUMROOM;
                    if ("reverb_plate".equals(t)) preset = PresetReverb.PRESET_PLATE;
                    fx.reverb.setPreset(preset);
                    fx.reverb.setEnabled(true);
                    break;
                case "bass_boost":
                    if (fx.bass == null) fx.bass = new BassBoost(0, sid);
                    fx.bass.setStrength((short) (level * 10)); // 0..1000
                    fx.bass.setEnabled(true);
                    break;
                case "equalizer":
                    if (fx.eq == null) fx.eq = new Equalizer(0, sid);
                    short bands = fx.eq.getNumberOfBands();
                    short[] range = fx.eq.getBandLevelRange();
                    short gain = (short) (range[0] + (range[1] - range[0]) * level / 100);
                    for (short b = 0; b < bands; b++) fx.eq.setBandLevel(b, gain);
                    fx.eq.setEnabled(true);
                    break;
                default:
                    call.reject("unknown effect type: " + t); return;
            }
        } catch (Throwable thr) {
            call.reject("effect failed: " + thr.getMessage());
            return;
        }

        JSObject ret = new JSObject();
        ret.put("sessionId", sid);
        ret.put("type", type);
        ret.put("level", level);
        call.resolve(ret);
    }

    @PluginMethod
    public void releaseSession(PluginCall call) {
        Integer sid = call.getInt("sessionId");
        if (sid == null) { call.resolve(); return; }
        SessionFx fx = sessions.remove(sid);
        if (fx != null) releaseFxSafely(fx);
        call.resolve();
    }

    @Override
    protected void handleOnDestroy() {
        for (SessionFx fx : sessions.values()) releaseFxSafely(fx);
        sessions.clear();
        super.handleOnDestroy();
    }

    private void releaseFxSafely(SessionFx fx) {
        try { if (fx.aec != null) fx.aec.release(); } catch (Throwable ignored) {}
        try { if (fx.ns != null) fx.ns.release(); } catch (Throwable ignored) {}
        try { if (fx.agc != null) fx.agc.release(); } catch (Throwable ignored) {}
        try { if (fx.reverb != null) fx.reverb.release(); } catch (Throwable ignored) {}
        try { if (fx.bass != null) fx.bass.release(); } catch (Throwable ignored) {}
        try { if (fx.eq != null) fx.eq.release(); } catch (Throwable ignored) {}
    }
}
