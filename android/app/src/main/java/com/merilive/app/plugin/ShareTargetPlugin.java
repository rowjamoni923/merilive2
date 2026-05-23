package com.merilive.app.plugin;

import android.content.ClipData;
import android.content.Intent;
import android.net.Uri;
import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.util.ArrayList;
import java.util.List;

/**
 * Pkg214 — Share Target bridge.
 *
 * Holds the most recent inbound ACTION_SEND / ACTION_SEND_MULTIPLE payload.
 * JS calls Sharing.consumeIncoming() once mounted, receives {text, uris[], mime}
 * then navigates to /share to compose the post / DM.
 */
@CapacitorPlugin(name = "Sharing")
public class ShareTargetPlugin extends Plugin {

    private static volatile JSObject pending;

    /** Called from MainActivity for both cold-start and onNewIntent. */
    public static void handleIntent(Intent intent) {
        if (intent == null) return;
        String action = intent.getAction();
        if (action == null) return;

        String type = intent.getType();
        JSObject payload = new JSObject();
        payload.put("mime", type != null ? type : "");

        if (Intent.ACTION_SEND.equals(action)) {
            String text = intent.getStringExtra(Intent.EXTRA_TEXT);
            String subject = intent.getStringExtra(Intent.EXTRA_SUBJECT);
            if (text != null) payload.put("text", text);
            if (subject != null) payload.put("subject", subject);

            Uri uri = intent.getParcelableExtra(Intent.EXTRA_STREAM);
            JSArray uris = new JSArray();
            if (uri != null) uris.put(uri.toString());
            payload.put("uris", uris);
        } else if (Intent.ACTION_SEND_MULTIPLE.equals(action)) {
            ArrayList<Uri> list = intent.getParcelableArrayListExtra(Intent.EXTRA_STREAM);
            JSArray uris = new JSArray();
            if (list != null) for (Uri u : list) if (u != null) uris.put(u.toString());
            payload.put("uris", uris);
        } else {
            return;
        }

        pending = payload;
    }

    @PluginMethod
    public void consumeIncoming(PluginCall call) {
        JSObject p = pending;
        pending = null;
        JSObject ret = new JSObject();
        ret.put("payload", p);
        call.resolve(ret);
    }

    @PluginMethod
    public void hasIncoming(PluginCall call) {
        JSObject ret = new JSObject();
        ret.put("value", pending != null);
        call.resolve(ret);
    }
}
