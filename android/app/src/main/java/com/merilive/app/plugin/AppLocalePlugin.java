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
        final String tag = call.getString("language", "");
        getBridge().getActivity().runOnUiThread(() -> {
            LocaleListCompat list = (tag == null || tag.isEmpty() || "auto".equalsIgnoreCase(tag))
                    ? LocaleListCompat.getEmptyLocaleList()
                    : LocaleListCompat.forLanguageTags(tag);
            AppCompatDelegate.setApplicationLocales(list);
            JSObject ret = new JSObject();
            ret.put("language", tag);
            ret.put("api", Build.VERSION.SDK_INT);
            call.resolve(ret);
        });
    }

    @PluginMethod
    public void getAppLocale(PluginCall call) {
        LocaleListCompat list = AppCompatDelegate.getApplicationLocales();
        JSObject ret = new JSObject();
        ret.put("language", list.isEmpty() ? "" : list.toLanguageTags());
        call.resolve(ret);
    }
}
