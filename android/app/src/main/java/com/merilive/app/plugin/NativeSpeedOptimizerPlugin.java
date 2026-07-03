package com.merilive.app.plugin;

import android.app.ActivityManager;
import android.content.ComponentCallbacks2;
import android.content.Context;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.File;

/**
 * Pkg435 — Recursive cache clearing + memory trim.
 *
 * Previously {@code clearNativeCache} just called {@code cacheDir.delete()}
 * which always fails on a non-empty directory (Java contract). It looked
 * like it worked but never freed a byte. Now we recurse properly and also
 * expose code/external cache + trim hook.
 */
@CapacitorPlugin(name = "NativeSpeedOptimizer")
public class NativeSpeedOptimizerPlugin extends Plugin {

    @PluginMethod
    public void getMemoryStatus(PluginCall call) {
        ActivityManager.MemoryInfo mi = new ActivityManager.MemoryInfo();
        ActivityManager am = (ActivityManager) getContext().getSystemService(Context.ACTIVITY_SERVICE);
        if (am != null) am.getMemoryInfo(mi);

        Runtime rt = Runtime.getRuntime();
        JSObject ret = new JSObject();
        ret.put("availableMB", mi.availMem / 1048576L);
        ret.put("totalMB", mi.totalMem / 1048576L);
        ret.put("thresholdMB", mi.threshold / 1048576L);
        ret.put("lowMemory", mi.lowMemory);
        ret.put("appUsedMB", (rt.totalMemory() - rt.freeMemory()) / 1048576L);
        ret.put("appMaxMB", rt.maxMemory() / 1048576L);
        call.resolve(ret);
    }

    @PluginMethod
    public void clearNativeCache(PluginCall call) {
        // Pkg-audit Tier-13: recursive cache deletion is heavy I/O — on devices
        // with multi-GB image/video caches this blocks the JS bridge thread
        // long enough to ANR. Run on background executor and resolve when done.
        final Context ctx = getContext();
        getBridge().getExecutor().execute(() -> {
            long freed = 0;
            try {
                freed += deleteRecursive(ctx.getCacheDir(), false);
                try {
                    File code = ctx.getCodeCacheDir();
                    if (code != null) freed += deleteRecursive(code, false);
                } catch (Throwable ignored) {}
                try {
                    File ext = ctx.getExternalCacheDir();
                    if (ext != null) freed += deleteRecursive(ext, false);
                } catch (Throwable ignored) {}
            } catch (Throwable t) {
                call.reject("clearNativeCache failed: " + t.getMessage());
                return;
            }
            JSObject ret = new JSObject();
            ret.put("freedBytes", freed);
            ret.put("freedMB", freed / 1048576L);
            call.resolve(ret);
        });
    }

    @PluginMethod
    public void trimMemory(PluginCall call) {
        try {
            int level = call.getInt("level", ComponentCallbacks2.TRIM_MEMORY_RUNNING_MODERATE);
            getContext().getApplicationContext().onTrimMemory(level);
            System.gc();
            JSObject ret = new JSObject();
            ret.put("level", level);
            call.resolve(ret);
        } catch (Throwable t) {
            call.reject("trimMemory failed: " + t.getMessage());
        }
    }

    /** Recursively delete contents; deleteSelf=false keeps the dir itself (so SDK can keep writing). */
    private long deleteRecursive(File f, boolean deleteSelf) {
        if (f == null || !f.exists()) return 0;
        long freed = 0;
        if (f.isDirectory()) {
            File[] children = f.listFiles();
            if (children != null) {
                for (File c : children) freed += deleteRecursive(c, true);
            }
        } else {
            long len = f.length();
            if (f.delete()) freed += len;
            return freed;
        }
        if (deleteSelf) {
            try { f.delete(); } catch (Throwable ignored) {}
        }
        return freed;
    }
}
