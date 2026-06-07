package com.merilive.app.plugin;

import android.content.Intent;
import android.net.Uri;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * Pkg435 — completed warm-start deep link dispatch.
 *
 * Cold start: JS calls {@code getLastDeepLink}.
 * Warm start: when an Intent arrives while the app is running we now
 * fire the {@code deepLinkOpened} event so JS can route without polling.
 *
 * Hosts handled (manifest intent-filters):
 *   merilive://app/...
 *   https://merilive.top/...
 *   https://app.merilive.top/...
 */
@CapacitorPlugin(name = "DeepLinkHandler")
public class DeepLinkHandlerPlugin extends Plugin {

    @Override
    protected void handleOnNewIntent(Intent intent) {
        super.handleOnNewIntent(intent);
        try {
            Uri data = intent != null ? intent.getData() : null;
            if (data != null) {
                JSObject ev = buildPayload(data);
                notifyListeners("deepLinkOpened", ev, true);
                // Pkg-audit Tier-13: clear so a later getLastDeepLink() (e.g.
                // on resume) does not replay this same URL — JS would route
                // twice and break analytics dedup.
                try { intent.setData(null); } catch (Throwable ignored) {}
            }
        } catch (Throwable ignored) {}
    }

    @PluginMethod
    public void getLastDeepLink(PluginCall call) {
        try {
            Intent intent = getBridge().getActivity().getIntent();
            Uri data = intent != null ? intent.getData() : null;
            if (data != null) {
                call.resolve(buildPayload(data));
            } else {
                JSObject ret = new JSObject();
                ret.put("url", (String) null);
                call.resolve(ret);
            }
        } catch (Throwable t) {
            call.reject(t.getMessage() == null ? "getLastDeepLink failed" : t.getMessage());
        }
    }

    @PluginMethod
    public void clearDeepLink(PluginCall call) {
        try {
            Intent intent = getBridge().getActivity().getIntent();
            if (intent != null) intent.setData(null);
            call.resolve();
        } catch (Throwable t) {
            call.reject(t.getMessage() == null ? "clearDeepLink failed" : t.getMessage());
        }
    }

    private JSObject buildPayload(Uri data) {
        JSObject ret = new JSObject();
        ret.put("url", data.toString());
        try { ret.put("scheme", data.getScheme()); } catch (Throwable ignored) {}
        try { ret.put("host", data.getHost()); } catch (Throwable ignored) {}
        try { ret.put("path", data.getPath()); } catch (Throwable ignored) {}
        try { ret.put("query", data.getQuery()); } catch (Throwable ignored) {}
        try { ret.put("ref", data.getQueryParameter("ref")); } catch (Throwable ignored) {}
        try { ret.put("utm_source", data.getQueryParameter("utm_source")); } catch (Throwable ignored) {}
        try { ret.put("utm_medium", data.getQueryParameter("utm_medium")); } catch (Throwable ignored) {}
        try { ret.put("utm_campaign", data.getQueryParameter("utm_campaign")); } catch (Throwable ignored) {}
        try { ret.put("room_id", data.getQueryParameter("room_id")); } catch (Throwable ignored) {}
        try { ret.put("user_id", data.getQueryParameter("user_id")); } catch (Throwable ignored) {}
        try { ret.put("reel_id", data.getQueryParameter("reel_id")); } catch (Throwable ignored) {}
        try { ret.put("party_id", data.getQueryParameter("party_id")); } catch (Throwable ignored) {}
        return ret;
    }
}
