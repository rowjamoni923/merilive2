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
        Intent intent = getBridge().getActivity().getIntent();
        Uri data = intent.getData();
        
        JSObject ret = new JSObject();
        if (data != null) {
            ret.put("url", data.toString());
            ret.put("path", data.getPath());
            ret.put("query", data.getQuery());
            ret.put("host", data.getHost());
            
            // Extracting specific params common in ads/social
            ret.put("ref", data.getQueryParameter("ref"));
            ret.put("utm_source", data.getQueryParameter("utm_source"));
            ret.put("room_id", data.getQueryParameter("room_id"));
            ret.put("user_id", data.getQueryParameter("user_id"));
        } else {
            ret.put("url", null);
        }
        call.resolve(ret);
    }

    @PluginMethod
    public void clearDeepLink(PluginCall call) {
        getBridge().getActivity().getIntent().setData(null);
        call.resolve();
    }
}