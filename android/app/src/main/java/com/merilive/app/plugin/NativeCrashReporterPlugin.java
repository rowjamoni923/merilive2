package com.merilive.app.plugin;

import android.os.Build;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.google.firebase.crashlytics.FirebaseCrashlytics;

/**
 * Pkg435 — added {@code setAttribute} for per-event Crashlytics custom keys
 * (was already production-grade otherwise).
 */
@CapacitorPlugin(name = "NativeCrashReporter")
public class NativeCrashReporterPlugin extends Plugin {

    @PluginMethod
    public void logEvent(PluginCall call) {
        String message = call.getString("message", "unknown");
        try {
            FirebaseCrashlytics.getInstance().log(message);
            call.resolve();
        } catch (Exception e) {
            call.reject("Failed to log event: " + e.getMessage());
        }
    }

    @PluginMethod
    public void recordError(PluginCall call) {
        String message = call.getString("message", "Unknown error");
        String stack = call.getString("stack", "");
        String context = call.getString("context", "general");
        try {
            FirebaseCrashlytics crashlytics = FirebaseCrashlytics.getInstance();
            crashlytics.setCustomKey("error_context", context);
            crashlytics.setCustomKey("device_brand", Build.BRAND);
            crashlytics.setCustomKey("device_model", Build.MODEL);
            crashlytics.setCustomKey("android_version", Build.VERSION.RELEASE);
            crashlytics.log(message + "\n" + stack);
            crashlytics.recordException(new Throwable(message));
            call.resolve();
        } catch (Exception e) {
            call.reject("Failed to record error: " + e.getMessage());
        }
    }

    @PluginMethod
    public void setUserIdentifier(PluginCall call) {
        String userId = call.getString("userId");
        if (userId == null) { call.reject("Missing userId"); return; }
        try {
            FirebaseCrashlytics.getInstance().setUserId(userId);
            call.resolve();
        } catch (Exception e) {
            call.reject("Failed to set user ID");
        }
    }

    @PluginMethod
    public void setAttribute(PluginCall call) {
        String key = call.getString("key");
        String value = call.getString("value");
        if (key == null || value == null) { call.reject("Missing key or value"); return; }
        try {
            FirebaseCrashlytics.getInstance().setCustomKey(key, value);
            call.resolve();
        } catch (Throwable t) {
            call.reject("setAttribute failed: " + t.getMessage());
        }
    }

    @PluginMethod
    public void getDeviceDiagnostics(PluginCall call) {
        JSObject ret = new JSObject();
        ret.put("brand", Build.BRAND);
        ret.put("model", Build.MODEL);
        ret.put("manufacturer", Build.MANUFACTURER);
        ret.put("androidVersion", Build.VERSION.RELEASE);
        ret.put("sdkInt", Build.VERSION.SDK_INT);
        ret.put("device", Build.DEVICE);
        ret.put("hardware", Build.HARDWARE);
        Runtime runtime = Runtime.getRuntime();
        ret.put("usedMemoryMB", (runtime.totalMemory() - runtime.freeMemory()) / 1048576L);
        ret.put("maxMemoryMB", runtime.maxMemory() / 1048576L);
        call.resolve(ret);
    }
}
