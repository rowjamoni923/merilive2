package com.merilive.app.plugin;

import android.app.Activity;
import android.os.Build;
import android.view.Display;
import android.view.Window;
import android.view.WindowManager;

import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * Pkg247 — Adaptive refresh rate.
 *
 * Bigo / TikTok / YouTube Live behavior: on 90/120Hz panels the app should
 * run at the highest refresh rate the panel supports for smooth scrolling
 * and live video, but drop back to 60Hz when idle to save battery.
 *
 * Strategy:
 *  - boostMax(): pick the highest-Hz display mode whose physical resolution
 *    matches the currently active mode, and pin window.preferredDisplayModeId
 *    to it. Works API 23+. This is the same trick Chrome, Instagram, and
 *    YouTube use.
 *  - release(): clear the preferred mode so the OS reverts to the system
 *    default (usually adaptive: 60Hz idle, higher when scrolling).
 *  - getInfo(): report supported rates so JS can decide whether to bother.
 *
 * No-op on devices that only have one mode (most ≤60Hz phones).
 */
@CapacitorPlugin(name = "AdaptiveRefresh")
public class AdaptiveRefreshPlugin extends Plugin {

    @PluginMethod
    public void getInfo(PluginCall call) {
        com.getcapacitor.JSObject ret = new com.getcapacitor.JSObject();
        try {
            Activity act = getActivity();
            if (act == null) { call.reject("no activity"); return; }
            Display d = act.getWindowManager().getDefaultDisplay();
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                Display.Mode active = d.getMode();
                Display.Mode[] modes = d.getSupportedModes();
                com.getcapacitor.JSArray rates = new com.getcapacitor.JSArray();
                float max = 0f;
                for (Display.Mode m : modes) {
                    if (m.getPhysicalWidth() == active.getPhysicalWidth()
                            && m.getPhysicalHeight() == active.getPhysicalHeight()) {
                        rates.put(Math.round(m.getRefreshRate()));
                        if (m.getRefreshRate() > max) max = m.getRefreshRate();
                    }
                }
                ret.put("currentHz", Math.round(active.getRefreshRate()));
                ret.put("maxHz", Math.round(max));
                ret.put("supported", rates);
            } else {
                ret.put("currentHz", Math.round(d.getRefreshRate()));
                ret.put("maxHz", Math.round(d.getRefreshRate()));
            }
        } catch (Throwable t) {
            ret.put("error", t.getMessage());
        }
        call.resolve(ret);
    }

    @PluginMethod
    public void boostMax(PluginCall call) {
        final Activity act = getActivity();
        if (act == null) { call.reject("no activity"); return; }
        act.runOnUiThread(() -> {
            try {
                if (Build.VERSION.SDK_INT < Build.VERSION_CODES.M) {
                    call.resolve();
                    return;
                }
                Window window = act.getWindow();
                if (window == null) { call.reject("no window"); return; }
                Display d = window.getWindowManager().getDefaultDisplay();
                Display.Mode active = d.getMode();
                Display.Mode best = active;
                for (Display.Mode m : d.getSupportedModes()) {
                    if (m.getPhysicalWidth() == active.getPhysicalWidth()
                            && m.getPhysicalHeight() == active.getPhysicalHeight()
                            && m.getRefreshRate() > best.getRefreshRate()) {
                        best = m;
                    }
                }
                if (best.getModeId() != active.getModeId()) {
                    WindowManager.LayoutParams lp = window.getAttributes();
                    lp.preferredDisplayModeId = best.getModeId();
                    window.setAttributes(lp);
                }
                call.resolve();
            } catch (Throwable t) {
                call.reject(t.getMessage());
            }
        });
    }

    @PluginMethod
    public void release(PluginCall call) {
        final Activity act = getActivity();
        if (act == null) { call.reject("no activity"); return; }
        act.runOnUiThread(() -> {
            try {
                Window window = act.getWindow();
                if (window == null) { call.reject("no window"); return; }
                WindowManager.LayoutParams lp = window.getAttributes();
                lp.preferredDisplayModeId = 0;
                window.setAttributes(lp);
                call.resolve();
            } catch (Throwable t) {
                call.reject(t.getMessage());
            }
        });
    }
}
