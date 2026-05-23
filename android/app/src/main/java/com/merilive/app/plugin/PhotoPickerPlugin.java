package com.merilive.app.plugin;

import android.content.ContentResolver;
import android.database.Cursor;
import android.net.Uri;
import android.provider.OpenableColumns;
import android.util.Base64;
import androidx.activity.result.ActivityResultLauncher;
import androidx.activity.result.PickVisualMediaRequest;
import androidx.activity.result.contract.ActivityResultContracts;
import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.util.List;

/**
 * Pkg218 — Android 13+ Photo Picker (privacy-preserving).
 *
 * Uses ActivityResultContracts.PickVisualMedia — system-rendered sheet,
 * no READ_MEDIA_IMAGES permission needed, gracefully falls back on Android 11/12.
 *
 * JS API:
 *   PhotoPicker.pickImage({ video?: boolean })           → { base64, mime, name, size }
 *   PhotoPicker.pickImages({ max?: number, video?: bool}) → { items: [...] }
 */
@CapacitorPlugin(name = "PhotoPicker")
public class PhotoPickerPlugin extends Plugin {

    private ActivityResultLauncher<PickVisualMediaRequest> singleLauncher;
    private ActivityResultLauncher<PickVisualMediaRequest> multiLauncher;
    private PluginCall pendingCall;

    @Override
    public void load() {
        singleLauncher = getActivity().registerForActivityResult(
            new ActivityResultContracts.PickVisualMedia(),
            uri -> {
                PluginCall call = pendingCall;
                pendingCall = null;
                if (call == null) return;
                if (uri == null) { call.resolve(); return; }
                JSObject obj = readToJson(uri);
                if (obj == null) { call.reject("read failed"); return; }
                call.resolve(obj);
            }
        );

        multiLauncher = getActivity().registerForActivityResult(
            new ActivityResultContracts.PickMultipleVisualMedia(10),
            (List<Uri> uris) -> {
                PluginCall call = pendingCall;
                pendingCall = null;
                if (call == null) return;
                JSArray arr = new JSArray();
                if (uris != null) {
                    for (Uri u : uris) {
                        JSObject o = readToJson(u);
                        if (o != null) arr.put(o);
                    }
                }
                JSObject ret = new JSObject();
                ret.put("items", arr);
                call.resolve(ret);
            }
        );
    }

    @PluginMethod
    public void pickImage(PluginCall call) {
        if (pendingCall != null) { call.reject("picker busy"); return; }
        pendingCall = call;
        call.setKeepAlive(true);
        boolean video = Boolean.TRUE.equals(call.getBoolean("video", false));
        PickVisualMediaRequest req = new PickVisualMediaRequest.Builder()
            .setMediaType(video
                ? ActivityResultContracts.PickVisualMedia.VideoOnly.INSTANCE
                : ActivityResultContracts.PickVisualMedia.ImageOnly.INSTANCE)
            .build();
        try { singleLauncher.launch(req); }
        catch (Exception e) { pendingCall = null; call.reject("launch failed: " + e.getMessage()); }
    }

    @PluginMethod
    public void pickImages(PluginCall call) {
        if (pendingCall != null) { call.reject("picker busy"); return; }
        pendingCall = call;
        call.setKeepAlive(true);
        boolean video = Boolean.TRUE.equals(call.getBoolean("video", false));
        PickVisualMediaRequest req = new PickVisualMediaRequest.Builder()
            .setMediaType(video
                ? ActivityResultContracts.PickVisualMedia.VideoOnly.INSTANCE
                : ActivityResultContracts.PickVisualMedia.ImageOnly.INSTANCE)
            .build();
        try { multiLauncher.launch(req); }
        catch (Exception e) { pendingCall = null; call.reject("launch failed: " + e.getMessage()); }
    }

    private JSObject readToJson(Uri uri) {
        try {
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

            if (size > 50L * 1024 * 1024) return null;

            ByteArrayOutputStream bos = new ByteArrayOutputStream();
            try (InputStream is = cr.openInputStream(uri)) {
                if (is == null) return null;
                byte[] buf = new byte[16 * 1024];
                int n; long total = 0;
                while ((n = is.read(buf)) > 0) {
                    total += n;
                    if (total > 50L * 1024 * 1024) return null;
                    bos.write(buf, 0, n);
                }
            }
            String b64 = Base64.encodeToString(bos.toByteArray(), Base64.NO_WRAP);
            JSObject obj = new JSObject();
            obj.put("base64", b64);
            obj.put("mime", mime != null ? mime : "application/octet-stream");
            if (name != null) obj.put("name", name);
            obj.put("size", size);
            return obj;
        } catch (Exception e) {
            return null;
        }
    }
}
