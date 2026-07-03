package com.merilive.app.plugin;

import android.os.Build;

import androidx.appcompat.app.AppCompatDelegate;
import androidx.core.os.LocaleListCompat;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * Pkg222 / M17 — Per-app language.
 *
 * Wraps AppCompatDelegate.setApplicationLocales, which backs onto Android 13+
 * LocaleManager when available and falls back to a per-app override on older
 * API levels. This lets users pick a MeriLive UI language independently from
 * the system language (visible in Android Settings → Apps → MeriLive →
 * Language on API 33+).
 */
@CapacitorPlugin(name = "AppLocale")
public class AppLocalePlugin extends Plugin {

    @PluginMethod
    public void setAppLocale(PluginCall call) {
        try {
            final String tag = call.getString("language", "");
            getBridge().getActivity().runOnUiThread(() -> {
                try {
                    LocaleListCompat list = (tag == null || tag.isEmpty() || "auto".equalsIgnoreCase(tag))
                            ? LocaleListCompat.getEmptyLocaleList()
                            : LocaleListCompat.forLanguageTags(tag);
                    AppCompatDelegate.setApplicationLocales(list);
                    JSObject ret = new JSObject();
                    ret.put("language", tag);
                    ret.put("api", Build.VERSION.SDK_INT);
                    call.resolve(ret);
                } catch (Throwable t) { call.reject(t.getMessage() == null ? "setAppLocale failed" : t.getMessage()); }
            });
        } catch (Throwable t) { call.reject(t.getMessage() == null ? "setAppLocale failed" : t.getMessage()); }
    }

    @PluginMethod
    public void getAppLocale(PluginCall call) {
        android.app.Activity act = getBridge().getActivity();
        Runnable work = () -> {
            try {
                LocaleListCompat list = AppCompatDelegate.getApplicationLocales();
                JSObject ret = new JSObject();
                ret.put("language", list.isEmpty() ? "" : list.toLanguageTags());
                call.resolve(ret);
            } catch (Throwable t) {
                call.reject(t.getMessage() == null ? "getAppLocale failed" : t.getMessage());
            }
        };
        if (act != null) act.runOnUiThread(work); else work.run();
    }
}
