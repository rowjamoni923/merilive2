package com.merilive.app.plugin;

import android.app.ActivityManager;
import android.content.Context;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

@CapacitorPlugin(name = "NativeSpeedOptimizer")
public class NativeSpeedOptimizerPlugin extends Plugin {

    @PluginMethod
    public void getMemoryStatus(PluginCall call) {
        ActivityManager.MemoryInfo mi = new ActivityManager.MemoryInfo();
        ActivityManager activityManager = (ActivityManager) getContext().getSystemService(Context.ACTIVITY_SERVICE);
        activityManager.getMemoryInfo(mi);
        
        JSObject ret = new JSObject();
        ret.put("availableMB", mi.availMem / 1048576L);
        ret.put("totalMB", mi.totalMem / 1048576L);
        ret.put("thresholdMB", mi.threshold / 1048576L);
        ret.put("lowMemory", mi.lowMemory);
        call.resolve(ret);
    }

    @PluginMethod
    public void clearNativeCache(PluginCall call) {
        try {
            getContext().getCacheDir().delete();
            call.resolve();
        } catch (Exception e) {
            call.reject("Failed to clear cache");
        }
    }
}