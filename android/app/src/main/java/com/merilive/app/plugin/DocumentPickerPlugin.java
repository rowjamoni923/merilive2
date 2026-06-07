package com.merilive.app.plugin;

import android.app.Activity;
import android.content.ContentResolver;
import android.content.Intent;
import android.database.Cursor;
import android.net.Uri;
import android.provider.OpenableColumns;
import androidx.activity.result.ActivityResult;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.ByteArrayOutputStream;
import java.io.InputStream;

/**
 * Pkg261 — Storage Access Framework document picker.
 * For arbitrary file attachments (PDF, docs, audio, archives, etc.).
 * Pkg218 PhotoPicker handles images/videos; this handles everything else.
 */
@CapacitorPlugin(name = "DocumentPicker")
public class DocumentPickerPlugin extends Plugin {

    private static final long MAX_INLINE_BYTES = 50L * 1024 * 1024; // 50MB

    @PluginMethod
    public void pick(PluginCall call) {
        JSArray mimes = call.getArray("mimeTypes");
        boolean multiple = Boolean.TRUE.equals(call.getBoolean("multiple", false));
        boolean readContent = Boolean.TRUE.equals(call.getBoolean("readContent", false));

        Intent intent = new Intent(Intent.ACTION_OPEN_DOCUMENT);
        intent.addCategory(Intent.CATEGORY_OPENABLE);
        intent.putExtra(Intent.EXTRA_ALLOW_MULTIPLE, multiple);
        intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);

        String[] mimeArr;
        if (mimes != null && mimes.length() > 0) {
            mimeArr = new String[mimes.length()];
            for (int i = 0; i < mimes.length(); i++) {
                try { mimeArr[i] = mimes.getString(i); } catch (Exception ignored) { mimeArr[i] = "*/*"; }
            }
            intent.setType(mimeArr.length == 1 ? mimeArr[0] : "*/*");
            if (mimeArr.length > 1) intent.putExtra(Intent.EXTRA_MIME_TYPES, mimeArr);
        } else {
            intent.setType("*/*");
        }

        JSObject opts = new JSObject();
        opts.put("readContent", readContent);
        call.setData(opts);

        startActivityForResult(call, intent, "pickResult");
    }

    @ActivityCallback
    private void pickResult(PluginCall call, ActivityResult result) {
        if (call == null) return;
        if (result.getResultCode() != Activity.RESULT_OK || result.getData() == null) {
            JSObject o = new JSObject(); o.put("files", new JSArray()); o.put("cancelled", true);
            call.resolve(o);
            return;
        }
        boolean readContent = Boolean.TRUE.equals(call.getData().getBoolean("readContent"));
        Intent data = result.getData();
        ContentResolver cr = getContext().getContentResolver();

        // Collect URIs on caller thread (cheap), then move I/O off main thread to avoid ANR.
        final java.util.List<Uri> uris = new java.util.ArrayList<>();
        if (data.getClipData() != null) {
            for (int i = 0; i < data.getClipData().getItemCount(); i++) {
                uris.add(data.getClipData().getItemAt(i).getUri());
            }
        } else if (data.getData() != null) {
            uris.add(data.getData());
        }

        new Thread(() -> {
            JSArray files = new JSArray();
            for (Uri uri : uris) files.put(describe(uri, cr, readContent));
            JSObject o = new JSObject();
            o.put("files", files);
            o.put("cancelled", false);
            call.resolve(o);
        }, "DocumentPicker-IO").start();
    }

    private JSObject describe(Uri uri, ContentResolver cr, boolean readContent) {
        JSObject f = new JSObject();
        f.put("uri", uri.toString());
        f.put("mimeType", cr.getType(uri));

        try (Cursor c = cr.query(uri, null, null, null, null)) {
            if (c != null && c.moveToFirst()) {
                int ni = c.getColumnIndex(OpenableColumns.DISPLAY_NAME);
                int si = c.getColumnIndex(OpenableColumns.SIZE);
                if (ni >= 0) f.put("name", c.getString(ni));
                if (si >= 0 && !c.isNull(si)) f.put("size", c.getLong(si));
            }
        } catch (Exception ignored) {}

        if (readContent) {
            Long size = f.has("size") ? f.getLong("size") : null;
            if (size == null || size <= MAX_INLINE_BYTES) {
                try (InputStream is = cr.openInputStream(uri)) {
                    if (is != null) {
                        ByteArrayOutputStream bos = new ByteArrayOutputStream();
                        byte[] buf = new byte[16384];
                        int n;
                        long total = 0;
                        while ((n = is.read(buf)) > 0) {
                            total += n;
                            if (total > MAX_INLINE_BYTES) { bos.reset(); break; }
                            bos.write(buf, 0, n);
                        }
                        if (bos.size() > 0) {
                            f.put("base64", android.util.Base64.encodeToString(bos.toByteArray(), android.util.Base64.NO_WRAP));
                        }
                    }
                } catch (Exception e) {
                    f.put("readError", e.getMessage());
                }
            } else {
                f.put("readError", "exceeds_50mb");
            }
        }
        return f;
    }

    @PluginMethod
    public void readUri(PluginCall call) {
        String uriStr = call.getString("uri");
        if (uriStr == null) { call.reject("uri required"); return; }
        try {
            Uri uri = Uri.parse(uriStr);
            ContentResolver cr = getContext().getContentResolver();
            try (InputStream is = cr.openInputStream(uri)) {
                if (is == null) { call.reject("open_failed"); return; }
                ByteArrayOutputStream bos = new ByteArrayOutputStream();
                byte[] buf = new byte[16384]; int n; long total = 0;
                while ((n = is.read(buf)) > 0) {
                    total += n;
                    if (total > MAX_INLINE_BYTES) { call.reject("exceeds_50mb"); return; }
                    bos.write(buf, 0, n);
                }
                JSObject o = new JSObject();
                o.put("base64", android.util.Base64.encodeToString(bos.toByteArray(), android.util.Base64.NO_WRAP));
                o.put("size", total);
                o.put("mimeType", cr.getType(uri));
                call.resolve(o);
            }
        } catch (Exception e) {
            call.reject("read_failed: " + e.getMessage());
        }
    }
}
