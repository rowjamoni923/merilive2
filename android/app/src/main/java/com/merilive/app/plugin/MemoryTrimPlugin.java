package com.merilive.app.plugin;

import android.content.ComponentCallbacks2;
import android.content.res.Configuration;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * Pkg244 — Memory trim hook bridge.
 *
 * Subscribes to {@link ComponentCallbacks2#onTrimMemory(int)} which the OS
 * fires when system memory pressure rises (foreground/background, moderate,
 * low, critical). On low-RAM OEMs (Redmi Go, Tecno Spark, old Samsung J)
 * this is the difference between "stream survives a Chrome tab open" and
 * "LMK kills our process mid-broadcast".
 *
 * Bridge forwards each event to JS via the `memoryTrim` plugin event so
 * React can drop image caches, downscale thumbnails, pause prefetches, etc.
 *
 * Levels (Android docs):
 *   5  RUNNING_MODERATE     — foreground; trim non-critical
 *  10  RUNNING_LOW          — foreground; trim aggressively
 *  15  RUNNING_CRITICAL     — foreground; system about to LMK us
 *  20  UI_HIDDEN            — UI no longer visible (user went home)
 *  40  BACKGROUND           — backgrounded; in LRU
 *  60  MODERATE             — middle of LRU; will be killed when needed
 *  80  COMPLETE             — at end of LRU; first to die
 */
@CapacitorPlugin(name = "MemoryTrim")
public class MemoryTrimPlugin extends Plugin {

    private ComponentCallbacks2 callbacks;

    @Override
    public void load() {
        callbacks = new ComponentCallbacks2() {
            @Override public void onConfigurationChanged(Configuration newConfig) {}
            @Override public void onLowMemory() { dispatch(15); }
            @Override public void onTrimMemory(int level) { dispatch(level); }
        };
        if (getContext() != null) {
            getContext().registerComponentCallbacks(callbacks);
        }
    }

    @Override
    protected void handleOnDestroy() {
        if (callbacks != null && getContext() != null) {
            try { getContext().unregisterComponentCallbacks(callbacks); } catch (Throwable ignored) {}
        }
        super.handleOnDestroy();
    }

    private void dispatch(int level) {
        JSObject data = new JSObject();
        data.put("level", level);
        data.put("severity", severity(level));
        notifyListeners("memoryTrim", data);
    }

    private String severity(int level) {
        if (level >= ComponentCallbacks2.TRIM_MEMORY_COMPLETE) return "complete";
        if (level >= ComponentCallbacks2.TRIM_MEMORY_MODERATE) return "moderate";
        if (level >= ComponentCallbacks2.TRIM_MEMORY_BACKGROUND) return "background";
        if (level >= ComponentCallbacks2.TRIM_MEMORY_UI_HIDDEN) return "uiHidden";
        if (level >= ComponentCallbacks2.TRIM_MEMORY_RUNNING_CRITICAL) return "critical";
        if (level >= ComponentCallbacks2.TRIM_MEMORY_RUNNING_LOW) return "low";
        return "mild";
    }

    /** Optional probe so JS can read current available memory at any time. */
    @PluginMethod
    public void getMemoryInfo(PluginCall call) {
        android.app.ActivityManager am = (android.app.ActivityManager)
            getContext().getSystemService(android.content.Context.ACTIVITY_SERVICE);
        android.app.ActivityManager.MemoryInfo info = new android.app.ActivityManager.MemoryInfo();
        am.getMemoryInfo(info);
        JSObject ret = new JSObject();
        ret.put("availMem", info.availMem);
        ret.put("totalMem", info.totalMem);
        ret.put("threshold", info.threshold);
        ret.put("lowMemory", info.lowMemory);
        call.resolve(ret);
    }
}
