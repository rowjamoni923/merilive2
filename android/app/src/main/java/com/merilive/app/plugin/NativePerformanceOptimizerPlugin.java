package com.merilive.app.plugin;

import android.content.Context;
import android.os.PowerManager;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

@CapacitorPlugin(name = "NativePerformanceOptimizer")
public class NativePerformanceOptimizerPlugin extends Plugin {

    @PluginMethod
    public void optimizeForStreaming(PluginCall call) {
        PowerManager powerManager = (PowerManager) getContext().getSystemService(Context.POWER_SERVICE);
        PowerManager.WakeLock wakeLock = powerManager.newWakeLock(
            PowerManager.PARTIAL_WAKE_LOCK, "MeriLive::StreamingLock");
        
        wakeLock.acquire(10 * 60 * 1000L); // 10 minutes max
        
        JSObject ret = new JSObject();
        ret.put("status", "optimized");
        ret.put("isPowerSaveMode", powerManager.isPowerSaveMode());
        call.resolve(ret);
    }
}