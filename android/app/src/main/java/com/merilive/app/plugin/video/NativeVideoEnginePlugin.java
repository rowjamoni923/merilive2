package com.merilive.app.plugin.video;

import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.util.Base64;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.ByteArrayOutputStream;

/**
 * Pkg435 — real brightness/saturation post-processing for snapshots/thumbnails.
 *
 * NOTE: This plugin is intentionally NOT used in the live preview pipeline.
 * Live camera frames flow through GPUPixelBeauty + LiveKit. This bridge
 * exists for utility paths (reel cover thumbnail, snapshot adjust, image
 * editor) that need fast CPU-side RGBA filtering.
 *
 * JS API:
 *   getVersion()                                            → { version }
 *   processFrame({ imageBase64, brightness=0, saturation=100 }) → { processedBase64 }
 */
@CapacitorPlugin(name = "NativeVideoEngine")
public class NativeVideoEnginePlugin extends Plugin {

    private static volatile boolean libLoaded = false;
    private static volatile String libLoadError = null;

    static {
        try {
            System.loadLibrary("native_video_engine");
            libLoaded = true;
        } catch (Throwable t) {
            libLoadError = t.getMessage();
        }
    }

    private native String getEngineVersion();
    private native int processFrameNative(Bitmap bitmap, int brightness, int saturation);

    @PluginMethod
    public void getVersion(PluginCall call) {
        JSObject ret = new JSObject();
        if (!libLoaded) {
            ret.put("version", "unavailable");
            ret.put("error", libLoadError == null ? "lib not loaded" : libLoadError);
            call.resolve(ret);
            return;
        }
        ret.put("version", getEngineVersion());
        call.resolve(ret);
    }

    @PluginMethod
    public void processFrame(PluginCall call) {
        if (!libLoaded) { call.reject("native_video_engine not loaded: " + libLoadError); return; }

        String b64 = call.getString("imageBase64");
        if (b64 == null || b64.length() < 8) { call.reject("missing imageBase64"); return; }
        int brightness = call.getInt("brightness", 0);
        int saturation = call.getInt("saturation", 100);
        if (brightness < -100) brightness = -100; if (brightness > 100) brightness = 100;
        if (saturation < 0) saturation = 0; if (saturation > 200) saturation = 200;

        Bitmap src = null;
        Bitmap mut = null;
        try {
            // strip data: prefix if present
            int comma = b64.indexOf(',');
            if (comma > 0 && comma < 64) b64 = b64.substring(comma + 1);
            byte[] raw = Base64.decode(b64, Base64.DEFAULT);
            src = BitmapFactory.decodeByteArray(raw, 0, raw.length);
            if (src == null) { call.reject("decode failed"); return; }
            mut = src.isMutable() ? src : src.copy(Bitmap.Config.ARGB_8888, true);
            if (mut == null) { call.reject("mutable copy failed"); return; }

            int rc = processFrameNative(mut, brightness, saturation);
            if (rc != 0) { call.reject("processFrame returned " + rc); return; }

            ByteArrayOutputStream baos = new ByteArrayOutputStream();
            mut.compress(Bitmap.CompressFormat.JPEG, 92, baos);
            String outB64 = Base64.encodeToString(baos.toByteArray(), Base64.NO_WRAP);

            JSObject ret = new JSObject();
            ret.put("processedBase64", outB64);
            ret.put("width", mut.getWidth());
            ret.put("height", mut.getHeight());
            call.resolve(ret);
        } catch (Throwable t) {
            call.reject("processFrame failed: " + (t.getMessage() == null ? "unknown" : t.getMessage()));
        } finally {
            // Pkg-audit Tier-4: ALL paths must release the native Bitmap heap,
            // not just the happy path. Previously the early `return` after a
            // non-zero processFrameNative result, and the catch branch, both
            // skipped recycle() → leaked the source Bitmap on every error.
            try { if (mut != null && mut != src && !mut.isRecycled()) mut.recycle(); } catch (Throwable ignored) {}
            try { if (src != null && !src.isRecycled()) src.recycle(); } catch (Throwable ignored) {}
        }
    }
}
