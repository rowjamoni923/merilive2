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
        String name = call.getString("name");
        if (name == null || name.isEmpty()) {
            call.reject("name required");
            return;
        }
        Bundle bundle = new Bundle();
        JSObject params = call.getObject("params", new JSObject());
        if (params != null) {
            Iterator<String> keys = params.keys();
            while (keys.hasNext()) {
                String k = keys.next();
                Object v = params.opt(k);
                if (v == null) continue;
                if (v instanceof Number) {
                    bundle.putDouble(k, ((Number) v).doubleValue());
                } else if (v instanceof Boolean) {
                    bundle.putBoolean(k, (Boolean) v);
                } else {
                    String s = String.valueOf(v);
                    if (s.length() > 100) s = s.substring(0, 100);
                    bundle.putString(k, s);
                }
            }
        }
        analytics.logEvent(name, bundle);
        call.resolve();
    }

    @PluginMethod
    public void setUserId(PluginCall call) {
        String uid = call.getString("userId");
        analytics.setUserId(uid);
        if (uid != null) crashlytics.setUserId(uid);
        call.resolve();
    }

    @PluginMethod
    public void setUserProperty(PluginCall call) {
        String key = call.getString("key");
        String value = call.getString("value");
        if (key == null) { call.reject("key required"); return; }
        analytics.setUserProperty(key, value);
        if (value != null) crashlytics.setCustomKey(key, value);
        call.resolve();
    }

    @PluginMethod
    public void log(PluginCall call) {
        String msg = call.getString("message", "");
        if (msg != null && !msg.isEmpty()) crashlytics.log(msg);
        call.resolve();
    }

    @PluginMethod
    public void recordError(PluginCall call) {
        String msg = call.getString("message", "JS error");
        String stack = call.getString("stack", "");
        Throwable t = new RuntimeException(msg + (stack != null && !stack.isEmpty() ? "\n" + stack : ""));
        crashlytics.recordException(t);
        call.resolve();
    }

    @PluginMethod
    public void setEnabled(PluginCall call) {
        boolean enabled = Boolean.TRUE.equals(call.getBoolean("enabled", true));
        analytics.setAnalyticsCollectionEnabled(enabled);
        crashlytics.setCrashlyticsCollectionEnabled(enabled);
        call.resolve();
    }
}
