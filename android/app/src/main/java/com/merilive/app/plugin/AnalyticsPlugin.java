package com.merilive.app.plugin;

import android.os.Bundle;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.google.firebase.analytics.FirebaseAnalytics;
import com.google.firebase.crashlytics.FirebaseCrashlytics;

import java.util.Iterator;

/**
 * Pkg213 — Firebase Crashlytics + Analytics bridge.
 *
 * JS API:
 *   Analytics.logEvent({ name, params })
 *   Analytics.setUserId({ userId })
 *   Analytics.setUserProperty({ key, value })
 *   Analytics.log({ message })                  // breadcrumb
 *   Analytics.recordError({ message, stack })   // non-fatal
 *   Analytics.setEnabled({ enabled })           // opt-out (GDPR)
 */
@CapacitorPlugin(name = "Analytics")
public class AnalyticsPlugin extends Plugin {

    private FirebaseAnalytics analytics;
    private FirebaseCrashlytics crashlytics;

    @Override
    public void load() {
        analytics = FirebaseAnalytics.getInstance(getContext());
        crashlytics = FirebaseCrashlytics.getInstance();
    }

    @PluginMethod
    public void logEvent(PluginCall call) {
        try {
            String name = call.getString("name");
            if (name == null || name.isEmpty()) { call.reject("name required"); return; }
            Bundle bundle = new Bundle();
            JSObject params = call.getObject("params", new JSObject());
            if (params != null) {
                Iterator<String> keys = params.keys();
                while (keys.hasNext()) {
                    String k = keys.next();
                    Object v = params.opt(k);
                    if (v == null) continue;
                    if (v instanceof Number) bundle.putDouble(k, ((Number) v).doubleValue());
                    else if (v instanceof Boolean) bundle.putBoolean(k, (Boolean) v);
                    else {
                        String s = String.valueOf(v);
                        if (s.length() > 100) s = s.substring(0, 100);
                        bundle.putString(k, s);
                    }
                }
            }
            if (analytics != null) analytics.logEvent(name, bundle);
            call.resolve();
        } catch (Throwable t) { call.reject(t.getMessage() == null ? "logEvent failed" : t.getMessage()); }
    }

    @PluginMethod
    public void setUserId(PluginCall call) {
        try {
            String uid = call.getString("userId");
            if (analytics != null) analytics.setUserId(uid);
            if (uid != null && crashlytics != null) crashlytics.setUserId(uid);
            call.resolve();
        } catch (Throwable t) { call.reject(t.getMessage() == null ? "setUserId failed" : t.getMessage()); }
    }

    @PluginMethod
    public void setUserProperty(PluginCall call) {
        try {
            String key = call.getString("key");
            String value = call.getString("value");
            if (key == null) { call.reject("key required"); return; }
            if (analytics != null) analytics.setUserProperty(key, value);
            if (value != null && crashlytics != null) crashlytics.setCustomKey(key, value);
            call.resolve();
        } catch (Throwable t) { call.reject(t.getMessage() == null ? "setUserProperty failed" : t.getMessage()); }
    }

    @PluginMethod
    public void log(PluginCall call) {
        try {
            String msg = call.getString("message", "");
            if (msg != null && !msg.isEmpty() && crashlytics != null) crashlytics.log(msg);
            call.resolve();
        } catch (Throwable t) { call.reject(t.getMessage() == null ? "log failed" : t.getMessage()); }
    }

    @PluginMethod
    public void recordError(PluginCall call) {
        try {
            String msg = call.getString("message", "JS error");
            String stack = call.getString("stack", "");
            Throwable t = new RuntimeException(msg + (stack != null && !stack.isEmpty() ? "\n" + stack : ""));
            if (crashlytics != null) crashlytics.recordException(t);
            call.resolve();
        } catch (Throwable t) { call.reject(t.getMessage() == null ? "recordError failed" : t.getMessage()); }
    }

    @PluginMethod
    public void setEnabled(PluginCall call) {
        try {
            boolean enabled = Boolean.TRUE.equals(call.getBoolean("enabled", true));
            if (analytics != null) analytics.setAnalyticsCollectionEnabled(enabled);
            if (crashlytics != null) crashlytics.setCrashlyticsCollectionEnabled(enabled);
            call.resolve();
        } catch (Throwable t) { call.reject(t.getMessage() == null ? "setEnabled failed" : t.getMessage()); }
    }
}
