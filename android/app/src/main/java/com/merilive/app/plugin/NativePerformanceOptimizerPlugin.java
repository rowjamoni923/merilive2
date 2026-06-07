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

    private PowerManager.WakeLock streamingWakeLock;

    @PluginMethod
    public void optimizeForStreaming(PluginCall call) {
        try {
            PowerManager powerManager = (PowerManager) getContext().getSystemService(Context.POWER_SERVICE);
            if (powerManager == null) { call.reject("no power service"); return; }
            // release any prior lock to prevent leaks across repeat calls
            releaseStreamingLockSafely();
            // Pkg-audit Tier-13: 10-min hard cap was silently releasing the
            // wake lock mid-stream for hour-long broadcasts. Honor an optional
            // caller-supplied timeoutMs (clamped to [1m..2h]); default raised
            // to 60m. JS layer must still call releaseStreaming() on stream end.
            long timeoutMs = call.getLong("timeoutMs", 60L * 60_000L);
            if (timeoutMs < 60_000L) timeoutMs = 60_000L;
            if (timeoutMs > 2L * 60L * 60_000L) timeoutMs = 2L * 60L * 60_000L;
            streamingWakeLock = powerManager.newWakeLock(
                PowerManager.PARTIAL_WAKE_LOCK, "MeriLive::StreamingLock");
            streamingWakeLock.setReferenceCounted(false);
            streamingWakeLock.acquire(timeoutMs);

            JSObject ret = new JSObject();
            ret.put("status", "optimized");
            ret.put("timeoutMs", timeoutMs);
            ret.put("isPowerSaveMode", powerManager.isPowerSaveMode());
            call.resolve(ret);
        } catch (Throwable t) {
            call.reject(t.getMessage() == null ? "optimizeForStreaming failed" : t.getMessage());
        }
    }

    @PluginMethod
    public void releaseStreaming(PluginCall call) {
        try {
            releaseStreamingLockSafely();
            call.resolve();
        } catch (Throwable t) {
            call.reject(t.getMessage() == null ? "releaseStreaming failed" : t.getMessage());
        }
    }

    private void releaseStreamingLockSafely() {
        try {
            if (streamingWakeLock != null && streamingWakeLock.isHeld()) {
                streamingWakeLock.release();
            }
        } catch (Throwable ignored) {}
        streamingWakeLock = null;
    }

    @Override
    protected void handleOnDestroy() {
        releaseStreamingLockSafely();
        super.handleOnDestroy();
    }
}
