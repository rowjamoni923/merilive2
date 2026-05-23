package com.merilive.app.plugin;

import android.content.Context;
import android.os.PowerManager;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * Pkg266 — Proximity sensor screen-off wake lock.
 *
 * Acquires PROXIMITY_SCREEN_OFF_WAKE_LOCK so the OS automatically blanks
 * the screen when the proximity sensor reports "near" (phone to ear during
 * voice call) and restores it when "far". Saves battery + prevents
 * accidental face touches. Exact WhatsApp / native Phone app behavior.
 *
 * No permission required.
 */
@CapacitorPlugin(name = "ProximityLock")
public class ProximityLockPlugin extends Plugin {

    private PowerManager.WakeLock wakeLock;

    @PluginMethod
    public void isSupported(PluginCall call) {
        PowerManager pm = (PowerManager) getContext().getSystemService(Context.POWER_SERVICE);
        boolean supported = pm != null && pm.isWakeLockLevelSupported(PowerManager.PROXIMITY_SCREEN_OFF_WAKE_LOCK);
        JSObject ret = new JSObject();
        ret.put("supported", supported);
        call.resolve(ret);
    }

    @PluginMethod
    public void acquire(PluginCall call) {
        try {
            if (wakeLock != null && wakeLock.isHeld()) {
                JSObject ret = new JSObject();
                ret.put("held", true);
                call.resolve(ret);
                return;
            }
            PowerManager pm = (PowerManager) getContext().getSystemService(Context.POWER_SERVICE);
            if (pm == null || !pm.isWakeLockLevelSupported(PowerManager.PROXIMITY_SCREEN_OFF_WAKE_LOCK)) {
                call.reject("PROXIMITY_SCREEN_OFF_WAKE_LOCK not supported on this device");
                return;
            }
            wakeLock = pm.newWakeLock(PowerManager.PROXIMITY_SCREEN_OFF_WAKE_LOCK, "merilive:proximity");
            wakeLock.setReferenceCounted(false);
            wakeLock.acquire();
            JSObject ret = new JSObject();
            ret.put("held", true);
            call.resolve(ret);
        } catch (Throwable t) {
            call.reject("acquire failed: " + t.getMessage(), t);
        }
    }

    @PluginMethod
    public void release(PluginCall call) {
        try {
            if (wakeLock != null && wakeLock.isHeld()) {
                // flag 1 = RELEASE_FLAG_WAIT_FOR_NO_PROXIMITY — keep screen
                // off until sensor reports far, then turn on. Avoids
                // flashing the user's face when call ends while pressed
                // against the cheek.
                wakeLock.release(1);
            }
            wakeLock = null;
            JSObject ret = new JSObject();
            ret.put("held", false);
            call.resolve(ret);
        } catch (Throwable t) {
            call.reject("release failed: " + t.getMessage(), t);
        }
    }

    @Override
    protected void handleOnDestroy() {
        try {
            if (wakeLock != null && wakeLock.isHeld()) wakeLock.release(1);
        } catch (Throwable ignored) {}
        wakeLock = null;
        super.handleOnDestroy();
    }
}
