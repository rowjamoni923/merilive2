package com.merilive.app.plugin;

import android.content.Context;
import android.os.Build;
import android.os.VibrationEffect;
import android.os.Vibrator;
import android.os.VibratorManager;
import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * Pkg254 — Vibrator pattern library.
 *
 * Named presets used across the app (gift burst, PK win, incoming message,
 * call ring, error, success) plus arbitrary pattern + single-tick API.
 * VibrationEffect on API 26+; legacy pattern fallback below that.
 */
@CapacitorPlugin(name = "Vibration")
public class VibrationPlugin extends Plugin {

    private Vibrator getVibrator() {
        Context ctx = getContext();
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            VibratorManager vm = (VibratorManager) ctx.getSystemService(Context.VIBRATOR_MANAGER_SERVICE);
            return vm != null ? vm.getDefaultVibrator() : null;
        }
        return (Vibrator) ctx.getSystemService(Context.VIBRATOR_SERVICE);
    }

    @PluginMethod
    public void hasVibrator(PluginCall call) {
        Vibrator v = getVibrator();
        JSObject ret = new JSObject();
        ret.put("supported", v != null && v.hasVibrator());
        ret.put("amplitudeControl",
                Build.VERSION.SDK_INT >= Build.VERSION_CODES.O && v != null && v.hasAmplitudeControl());
        call.resolve(ret);
    }

    @PluginMethod
    public void cancel(PluginCall call) {
        Vibrator v = getVibrator();
        if (v != null) v.cancel();
        call.resolve();
    }

    @PluginMethod
    public void tick(PluginCall call) {
        long ms = call.getLong("durationMs", 20L);
        Integer amplitude = call.getInt("amplitude"); // 1-255, optional
        Vibrator v = getVibrator();
        if (v == null || !v.hasVibrator()) { call.resolve(); return; }
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            int amp = amplitude != null ? Math.max(1, Math.min(255, amplitude)) : VibrationEffect.DEFAULT_AMPLITUDE;
            v.vibrate(VibrationEffect.createOneShot(ms, amp));
        } else {
            v.vibrate(ms);
        }
        call.resolve();
    }

    @PluginMethod
    public void pattern(PluginCall call) {
        JSArray arr = call.getArray("pattern");
        Integer repeat = call.getInt("repeat", -1);
        if (arr == null || arr.length() == 0) { call.reject("pattern required"); return; }
        long[] pat = new long[arr.length()];
        try {
            for (int i = 0; i < arr.length(); i++) pat[i] = arr.getLong(i);
        } catch (Exception e) { call.reject("invalid pattern"); return; }
        int repeatIdx = repeat != null ? repeat : -1;
        if (repeatIdx != -1 && (repeatIdx < 0 || repeatIdx >= pat.length)) {
            call.reject("repeat index out of range"); return;
        }
        Vibrator v = getVibrator();
        if (v == null || !v.hasVibrator()) { call.resolve(); return; }
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            v.vibrate(VibrationEffect.createWaveform(pat, repeatIdx));
        } else {
            v.vibrate(pat, repeatIdx);
        }
        call.resolve();
    }

    @PluginMethod
    public void preset(PluginCall call) {
        String name = call.getString("name", "tick");
        Vibrator v = getVibrator();
        if (v == null || !v.hasVibrator()) { call.resolve(); return; }
        long[] pat;
        int repeat = -1;
        switch (name) {
            case "success":      pat = new long[]{0, 25, 60, 25}; break;
            case "error":        pat = new long[]{0, 60, 80, 60, 80, 60}; break;
            case "warning":      pat = new long[]{0, 40, 100, 40}; break;
            case "gift":         pat = new long[]{0, 15, 40, 15, 40, 25, 40, 35}; break;
            case "pkWin":        pat = new long[]{0, 30, 50, 30, 50, 80, 80, 120}; break;
            case "pkLose":       pat = new long[]{0, 120, 80, 60}; break;
            case "message":      pat = new long[]{0, 25, 50, 25}; break;
            case "mention":      pat = new long[]{0, 35, 60, 35, 60, 35}; break;
            case "callRing":     pat = new long[]{0, 800, 600, 800, 600}; repeat = 0; break;
            case "callConnect":  pat = new long[]{0, 60, 40, 60}; break;
            case "callEnd":      pat = new long[]{0, 100}; break;
            case "tick":
            default:             pat = new long[]{0, 18}; break;
        }
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            v.vibrate(VibrationEffect.createWaveform(pat, repeat));
        } else {
            v.vibrate(pat, repeat);
        }
        call.resolve();
    }
}
