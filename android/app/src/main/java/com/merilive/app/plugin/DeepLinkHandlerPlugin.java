package com.merilive.app.plugin;

import android.content.Intent;
import android.net.Uri;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

@CapacitorPlugin(name = "DeepLinkHandler")
public class DeepLinkHandlerPlugin extends Plugin {

    @PluginMethod
    public void getLastDeepLink(PluginCall call) {
        try {
            Intent intent = getBridge().getActivity().getIntent();
            Uri data = intent != null ? intent.getData() : null;
            JSObject ret = new JSObject();
            if (data != null) {
                ret.put("url", data.toString());
                try { ret.put("path", data.getPath()); } catch (Throwable ignored) {}
                try { ret.put("query", data.getQuery()); } catch (Throwable ignored) {}
                try { ret.put("host", data.getHost()); } catch (Throwable ignored) {}
                try { ret.put("ref", data.getQueryParameter("ref")); } catch (Throwable ignored) {}
                try { ret.put("utm_source", data.getQueryParameter("utm_source")); } catch (Throwable ignored) {}
                try { ret.put("room_id", data.getQueryParameter("room_id")); } catch (Throwable ignored) {}
                try { ret.put("user_id", data.getQueryParameter("user_id")); } catch (Throwable ignored) {}
            } else {
                ret.put("url", (String) null);
            }
            call.resolve(ret);
        } catch (Throwable t) { call.reject(t.getMessage() == null ? "getLastDeepLink failed" : t.getMessage()); }
    }

    @PluginMethod
    public void clearDeepLink(PluginCall call) {
        try {
            Intent intent = getBridge().getActivity().getIntent();
            if (intent != null) intent.setData(null);
            call.resolve();
        } catch (Throwable t) { call.reject(t.getMessage() == null ? "clearDeepLink failed" : t.getMessage()); }
    }
}