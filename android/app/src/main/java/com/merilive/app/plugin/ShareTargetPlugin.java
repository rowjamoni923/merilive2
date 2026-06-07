package com.merilive.app.plugin;

import android.content.ClipData;
import android.content.ContentResolver;
import android.content.Intent;
import android.database.Cursor;
import android.net.Uri;
import android.provider.OpenableColumns;
import android.util.Base64;
import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.ByteArrayOutputStream;
import java.io.InputStream;
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

    private static final java.util.concurrent.atomic.AtomicReference<JSObject> pending =
            new java.util.concurrent.atomic.AtomicReference<>(null);

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

        pending.set(payload);
    }

    @PluginMethod
    public void consumeIncoming(PluginCall call) {
        JSObject p = pending.getAndSet(null);
        JSObject ret = new JSObject();
        ret.put("payload", p);
        call.resolve(ret);
    }

    @PluginMethod
    public void hasIncoming(PluginCall call) {
        JSObject ret = new JSObject();
        ret.put("value", pending.get() != null);
        call.resolve(ret);
    }

    /**
     * Read a content:// (or file://) URI shared into the app and return
     * { base64, mime, name, size }. Capped at 50 MB to protect WebView memory.
     */
    @PluginMethod
    public void readUri(PluginCall call) {
        String uriStr = call.getString("uri");
        if (uriStr == null || uriStr.isEmpty()) { call.reject("uri required"); return; }
        try {
            Uri uri = Uri.parse(uriStr);
            ContentResolver cr = getContext().getContentResolver();
            String mime = cr.getType(uri);

            String name = null;
            long size = -1;
            try (Cursor c = cr.query(uri, null, null, null, null)) {
                if (c != null && c.moveToFirst()) {
                    int ni = c.getColumnIndex(OpenableColumns.DISPLAY_NAME);
                    int si = c.getColumnIndex(OpenableColumns.SIZE);
                    if (ni >= 0) name = c.getString(ni);
                    if (si >= 0) size = c.getLong(si);
                }
            } catch (Exception ignored) {}

            if (size > 50L * 1024 * 1024) {
                call.reject("File too large (>50MB)");
                return;
            }

            ByteArrayOutputStream bos = new ByteArrayOutputStream();
            try (InputStream is = cr.openInputStream(uri)) {
                if (is == null) { call.reject("Cannot open URI"); return; }
                byte[] buf = new byte[16 * 1024];
                int n;
                long total = 0;
                while ((n = is.read(buf)) > 0) {
                    total += n;
                    if (total > 50L * 1024 * 1024) { call.reject("File too large (>50MB)"); return; }
                    bos.write(buf, 0, n);
                }
            }
            String b64 = Base64.encodeToString(bos.toByteArray(), Base64.NO_WRAP);

            JSObject ret = new JSObject();
            ret.put("base64", b64);
            ret.put("mime", mime != null ? mime : "application/octet-stream");
            if (name != null) ret.put("name", name);
            ret.put("size", size);
            call.resolve(ret);
        } catch (Exception e) {
            call.reject("Read failed: " + e.getMessage());
        }
    }
}
