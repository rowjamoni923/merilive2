package com.merilive.app.plugin;

import android.view.WindowManager;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * Pkg265 — Screen brightness + keep-awake controller.
 *
 * - setKeepScreenOn(true) → FLAG_KEEP_SCREEN_ON so the host's screen never
 *   sleeps mid-broadcast (live, party room, active call, PK battle).
 * - setBrightness(0.0–1.0 | -1) → per-window screenBrightness override
 *   without changing the user's system brightness setting; pass -1 to
 *   release back to system default.
 * - getState() → current applied flags so JS can keep its UI in sync.
 *
 * All ops are window-scoped (won't affect other apps) and reverted as soon
 * as the WebView window is destroyed.
 */
@CapacitorPlugin(name = "ScreenControl")
public class ScreenControlPlugin extends Plugin {

    @PluginMethod
    public void setKeepScreenOn(final PluginCall call) {
        final boolean on = Boolean.TRUE.equals(call.getBoolean("on", true));
        final android.app.Activity a = getActivity();
        if (a == null) { call.reject("activity_unavailable"); return; }
        a.runOnUiThread(() -> {
            try {
                if (a.isDestroyed() || a.isFinishing()) {
                    call.reject("activity_unavailable");
                    return;
                }
                if (on) {
                    a.getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
                } else {
                    a.getWindow().clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
                }
                JSObject ret = new JSObject();
                ret.put("on", on);
                call.resolve(ret);
            } catch (Throwable t) {
                call.reject("setKeepScreenOn failed: " + t.getMessage(), t);
            }
        });
    }

    @PluginMethod
    public void setBrightness(final PluginCall call) {
        final Double level = call.getDouble("level"); // -1 release, 0.0–1.0 override
        if (level == null) {
            call.reject("level is required (0.0–1.0, or -1 to release)");
            return;
        }
        final float clamped;
        if (level < 0) {
            clamped = WindowManager.LayoutParams.BRIGHTNESS_OVERRIDE_NONE; // -1f
        } else {
            clamped = (float) Math.max(0.01, Math.min(1.0, level));
        }
        final android.app.Activity a = getActivity();
        if (a == null) { call.reject("activity_unavailable"); return; }
        a.runOnUiThread(() -> {
            try {
                if (a.isDestroyed() || a.isFinishing()) {
                    call.reject("activity_unavailable");
                    return;
                }
                WindowManager.LayoutParams lp = a.getWindow().getAttributes();
                lp.screenBrightness = clamped;
                a.getWindow().setAttributes(lp);
                JSObject ret = new JSObject();
                ret.put("level", clamped);
                call.resolve(ret);
            } catch (Throwable t) {
                call.reject("setBrightness failed: " + t.getMessage(), t);
            }
        });
    }

    @PluginMethod
    public void getState(final PluginCall call) {
        final android.app.Activity a = getActivity();
        if (a == null) { call.reject("activity_unavailable"); return; }
        a.runOnUiThread(() -> {
            try {
                if (a.isDestroyed() || a.isFinishing()) {
                    call.reject("activity_unavailable");
                    return;
                }
                WindowManager.LayoutParams lp = a.getWindow().getAttributes();
                int flags = lp.flags;
                JSObject ret = new JSObject();
                ret.put("keepScreenOn", (flags & WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON) != 0);
                ret.put("brightness", lp.screenBrightness); // -1 means system default
                call.resolve(ret);
            } catch (Throwable t) {
                call.reject("getState failed: " + t.getMessage(), t);
            }
        });
    }
}
