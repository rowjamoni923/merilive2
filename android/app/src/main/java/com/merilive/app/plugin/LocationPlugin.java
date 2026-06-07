package com.merilive.app.plugin;

import android.Manifest;
import android.content.pm.PackageManager;
import android.location.Location;
import android.os.Looper;

import androidx.core.content.ContextCompat;

import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;
import com.google.android.gms.location.FusedLocationProviderClient;
import com.google.android.gms.location.LocationCallback;
import com.google.android.gms.location.LocationRequest;
import com.google.android.gms.location.LocationResult;
import com.google.android.gms.location.LocationServices;
import com.google.android.gms.location.Priority;

/**
 * Pkg253 — FusedLocationProvider bridge.
 *
 * Powers opt-in region-based features: "Discover live near me", country
 * auto-fill on profile, distance label on user cards. Always
 * permission-gated; never auto-starts. Single-shot getCurrentLocation()
 * or streaming watch()/clearWatch().
 *
 * Returns city-precision data only (rounded to 0.01° ≈ 1.1km) unless
 * caller passes `precise=true`. Default Priority.BALANCED_POWER for
 * battery; switch to HIGH_ACCURACY only for very short live sessions.
 */
@CapacitorPlugin(
    name = "Location",
    permissions = {
        @Permission(alias = "location", strings = {
            Manifest.permission.ACCESS_COARSE_LOCATION,
            Manifest.permission.ACCESS_FINE_LOCATION
        })
    }
)
public class LocationPlugin extends Plugin {

    private FusedLocationProviderClient client;
    private LocationCallback streamCallback;
    // Pkg-audit Tier-11 (High): retain the kept-alive watch call so we can
    // release it from the bridge on clearWatch / replacement / destroy.
    // Previously the saved JS callback was leaked on every clearWatch() and
    // every re-watch, growing the bridge's savedCalls map indefinitely.
    private PluginCall savedWatchCall;

    @Override
    public void load() {
        client = LocationServices.getFusedLocationProviderClient(getContext());
    }

    private boolean hasPerm() {
        return ContextCompat.checkSelfPermission(getContext(),
            Manifest.permission.ACCESS_COARSE_LOCATION) == PackageManager.PERMISSION_GRANTED
            || ContextCompat.checkSelfPermission(getContext(),
            Manifest.permission.ACCESS_FINE_LOCATION) == PackageManager.PERMISSION_GRANTED;
    }

    @PluginMethod
    public void checkPermission(PluginCall call) {
        JSObject res = new JSObject();
        res.put("granted", hasPerm());
        call.resolve(res);
    }

    @PluginMethod
    public void requestPermission(PluginCall call) {
        if (hasPerm()) {
            JSObject res = new JSObject();
            res.put("granted", true);
            call.resolve(res);
            return;
        }
        requestPermissionForAlias("location", call, "permissionCallback");
    }

    @PermissionCallback
    private void permissionCallback(PluginCall call) {
        JSObject res = new JSObject();
        res.put("granted", getPermissionState("location") == PermissionState.GRANTED);
        call.resolve(res);
    }

    @PluginMethod
    public void getCurrentLocation(final PluginCall call) {
        if (!hasPerm()) { call.reject("permission-denied"); return; }
        final boolean precise = Boolean.TRUE.equals(call.getBoolean("precise", false));
        try {
            int priority = precise ? Priority.PRIORITY_HIGH_ACCURACY : Priority.PRIORITY_BALANCED_POWER_ACCURACY;
            client.getCurrentLocation(priority, null)
                .addOnSuccessListener(loc -> call.resolve(toJs(loc, precise)))
                .addOnFailureListener(e -> call.reject("location-failed", e.getMessage()));
        } catch (SecurityException e) {
            call.reject("permission-denied", e.getMessage());
        }
    }

    @PluginMethod
    public void watch(final PluginCall call) {
        if (!hasPerm()) { call.reject("permission-denied"); return; }
        // Pkg-audit Tier-11: clamp to >=1s to avoid setMinUpdateIntervalMillis(0)
        // and crash on LocationRequest.Builder when caller passes <= 0.
        long intervalMs = Math.max(1000L, call.getLong("intervalMs", 30_000L));
        final boolean precise = Boolean.TRUE.equals(call.getBoolean("precise", false));
        call.setKeepAlive(true);

        try {
            LocationRequest req = new LocationRequest.Builder(
                precise ? Priority.PRIORITY_HIGH_ACCURACY : Priority.PRIORITY_BALANCED_POWER_ACCURACY,
                intervalMs
            ).setMinUpdateIntervalMillis(Math.max(500L, intervalMs / 2)).build();

            stopStream();
            // Release any previously saved watch call before overwriting.
            releaseSavedWatchCall();
            savedWatchCall = call;
            bridge.saveCall(call);

            streamCallback = new LocationCallback() {
                @Override public void onLocationResult(LocationResult result) {
                    Location loc = result.getLastLocation();
                    if (loc != null) call.resolve(toJs(loc, precise));
                }
            };
            client.requestLocationUpdates(req, streamCallback, Looper.getMainLooper());
        } catch (SecurityException e) {
            releaseSavedWatchCall();
            call.reject("permission-denied", e.getMessage());
        } catch (Throwable t) {
            releaseSavedWatchCall();
            call.reject("watch-failed", t.getMessage());
        }
    }

    @PluginMethod
    public void clearWatch(PluginCall call) {
        stopStream();
        releaseSavedWatchCall();
        call.resolve();
    }

    private void stopStream() {
        if (streamCallback != null) {
            try { client.removeLocationUpdates(streamCallback); } catch (Throwable ignored) {}
            streamCallback = null;
        }
    }

    private void releaseSavedWatchCall() {
        PluginCall c = savedWatchCall;
        savedWatchCall = null;
        if (c != null) {
            try { bridge.releaseCall(c); } catch (Throwable ignored) {}
        }
    }

    @Override
    protected void handleOnDestroy() {
        stopStream();
        releaseSavedWatchCall();
        super.handleOnDestroy();
    }

    private JSObject toJs(Location loc, boolean precise) {
        JSObject o = new JSObject();
        if (loc == null) { o.put("available", false); return o; }
        double lat = loc.getLatitude();
        double lng = loc.getLongitude();
        if (!precise) {
            // 0.01° ≈ 1.1km — city precision, masks exact home location
            lat = Math.round(lat * 100.0) / 100.0;
            lng = Math.round(lng * 100.0) / 100.0;
        }
        o.put("available", true);
        o.put("latitude", lat);
        o.put("longitude", lng);
        o.put("accuracy", loc.getAccuracy());
        o.put("timestamp", loc.getTime());
        o.put("precise", precise);
        return o;
    }
}
