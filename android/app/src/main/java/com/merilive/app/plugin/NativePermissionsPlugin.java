package com.merilive.app.plugin;

import android.Manifest;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Build;
import android.provider.Settings;
import android.util.Log;

import androidx.core.content.ContextCompat;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;

import java.util.ArrayList;
import java.util.List;

@CapacitorPlugin(
    name = "MeriPermissions",
    permissions = {
        @Permission(strings = { Manifest.permission.CAMERA }, alias = "camera"),
        @Permission(strings = { Manifest.permission.RECORD_AUDIO }, alias = "microphone"),
        @Permission(strings = { Manifest.permission.ACCESS_FINE_LOCATION, Manifest.permission.ACCESS_COARSE_LOCATION }, alias = "location"),
        @Permission(strings = { Manifest.permission.POST_NOTIFICATIONS }, alias = "notifications")
    }
)
public class NativePermissionsPlugin extends Plugin {

    private static final String TAG = "MeriPerm";

    private boolean hasPermission(String permission) {
        return ContextCompat.checkSelfPermission(getContext(), permission) == PackageManager.PERMISSION_GRANTED;
    }

    private JSObject currentStatus() {
        JSObject ret = new JSObject();
        ret.put("camera", hasPermission(Manifest.permission.CAMERA));
        ret.put("microphone", hasPermission(Manifest.permission.RECORD_AUDIO));
        ret.put("location", hasPermission(Manifest.permission.ACCESS_FINE_LOCATION) || hasPermission(Manifest.permission.ACCESS_COARSE_LOCATION));
        ret.put("notifications", Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU || hasPermission(Manifest.permission.POST_NOTIFICATIONS));
        return ret;
    }

    @PluginMethod
    public void checkAllPermissions(PluginCall call) {
        JSObject status = currentStatus();
        Log.i(TAG, "checkAllPermissions -> " + status.toString());
        call.resolve(status);
    }

    @PluginMethod
    public void requestCamera(PluginCall call) {
        Log.i(TAG, "requestCamera invoked. alreadyGranted=" + hasPermission(Manifest.permission.CAMERA));
        if (hasPermission(Manifest.permission.CAMERA)) {
            call.resolve(currentStatus());
            return;
        }
        Log.i(TAG, "requestCamera -> firing system dialog (alias=camera)");
        requestPermissionForAlias("camera", call, "permissionsCallback");
    }

    @PluginMethod
    public void requestMicrophone(PluginCall call) {
        Log.i(TAG, "requestMicrophone invoked. alreadyGranted=" + hasPermission(Manifest.permission.RECORD_AUDIO));
        if (hasPermission(Manifest.permission.RECORD_AUDIO)) {
            call.resolve(currentStatus());
            return;
        }
        Log.i(TAG, "requestMicrophone -> firing system dialog (alias=microphone)");
        requestPermissionForAlias("microphone", call, "permissionsCallback");
    }

    @PluginMethod
    public void requestLocation(PluginCall call) {
        boolean fine = hasPermission(Manifest.permission.ACCESS_FINE_LOCATION);
        boolean coarse = hasPermission(Manifest.permission.ACCESS_COARSE_LOCATION);
        Log.i(TAG, "requestLocation invoked. fine=" + fine + " coarse=" + coarse);
        if (fine || coarse) {
            call.resolve(currentStatus());
            return;
        }
        Log.i(TAG, "requestLocation -> firing system dialog (alias=location)");
        requestPermissionForAlias("location", call, "permissionsCallback");
    }

    @PluginMethod
    public void requestNotifications(PluginCall call) {
        boolean preTiramisu = Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU;
        boolean granted = preTiramisu || hasPermission(Manifest.permission.POST_NOTIFICATIONS);
        Log.i(TAG, "requestNotifications invoked. sdk=" + Build.VERSION.SDK_INT
            + " preTiramisu=" + preTiramisu + " alreadyGranted=" + granted);
        if (granted) {
            call.resolve(currentStatus());
            return;
        }
        Log.i(TAG, "requestNotifications -> firing system dialog (alias=notifications)");
        requestPermissionForAlias("notifications", call, "permissionsCallback");
    }

    @PluginMethod
    public void requestAll(PluginCall call) {
        List<String> aliases = new ArrayList<>();
        if (!hasPermission(Manifest.permission.CAMERA)) aliases.add("camera");
        if (!hasPermission(Manifest.permission.RECORD_AUDIO)) aliases.add("microphone");
        if (!hasPermission(Manifest.permission.ACCESS_FINE_LOCATION) && !hasPermission(Manifest.permission.ACCESS_COARSE_LOCATION)) aliases.add("location");
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU && !hasPermission(Manifest.permission.POST_NOTIFICATIONS)) aliases.add("notifications");

        Log.i(TAG, "requestAll invoked. missingAliases=" + aliases.toString()
            + " currentStatus=" + currentStatus().toString());

        if (aliases.isEmpty()) {
            Log.i(TAG, "requestAll -> nothing to request, resolving current status");
            call.resolve(currentStatus());
            return;
        }

        Log.i(TAG, "requestAll -> firing system dialog for aliases=" + aliases.toString());
        requestPermissionForAliases(aliases.toArray(new String[0]), call, "permissionsCallback");
    }

    @PluginMethod
    public void openAppSettings(PluginCall call) {
        Log.w(TAG, "openAppSettings invoked - user being sent to system settings (likely permanent denial)");
        Intent intent = new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS);
        intent.setData(Uri.parse("package:" + getContext().getPackageName()));
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        getContext().startActivity(intent);
        call.resolve();
    }

    /**
     * Tells JS whether the system will still show its native permission dialog
     * for a given alias, or whether the user has tapped "Don't ask again" /
     * permanently denied — in which case the only path forward is App Settings.
     *
     * Result shape: { camera: bool, microphone: bool, location: bool, notifications: bool }
     * true  = system dialog is still available (Allow button can re-prompt)
     * false = permanently denied (must open settings)
     */
    @PluginMethod
    public void canRequestAgain(PluginCall call) {
        JSObject ret = new JSObject();
        ret.put("camera", canRequest(Manifest.permission.CAMERA));
        ret.put("microphone", canRequest(Manifest.permission.RECORD_AUDIO));
        ret.put("location",
            canRequest(Manifest.permission.ACCESS_FINE_LOCATION)
            || canRequest(Manifest.permission.ACCESS_COARSE_LOCATION));
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            ret.put("notifications", canRequest(Manifest.permission.POST_NOTIFICATIONS));
        } else {
            ret.put("notifications", true);
        }
        Log.i(TAG, "canRequestAgain -> " + ret.toString());
        call.resolve(ret);
    }

    private boolean canRequest(String permission) {
        // Granted → no need to request again, but treat as "ok".
        if (hasPermission(permission)) return true;
        if (getActivity() == null) return true;
        // First-time request always returns false from shouldShowRationale,
        // but the system WILL show the dialog. We track that with a SharedPref
        // flag ("requested_<perm>"). After the first request:
        //   - shouldShow=true  → user denied once, dialog will still appear
        //   - shouldShow=false → user picked "Don't ask again" / permanently denied
        boolean everRequested = getContext()
            .getSharedPreferences("meri_perm_state", android.content.Context.MODE_PRIVATE)
            .getBoolean("requested_" + permission, false);
        if (!everRequested) {
            Log.d(TAG, "canRequest(" + permission + "): never requested before -> true");
            return true;
        }
        boolean shouldShow = androidx.core.app.ActivityCompat.shouldShowRequestPermissionRationale(
            getActivity(), permission);
        Log.d(TAG, "canRequest(" + permission + "): everRequested=true shouldShowRationale="
            + shouldShow + " -> " + shouldShow);
        return shouldShow;
    }

    @PermissionCallback
    private void permissionsCallback(PluginCall call) {
        JSObject after = currentStatus();
        Log.i(TAG, "permissionsCallback fired. resultStatus=" + after.toString());

        // Mark every permission we just asked about as "requested" so
        // canRequest() can detect the permanent-deny state on the next check.
        android.content.SharedPreferences.Editor editor = getContext()
            .getSharedPreferences("meri_perm_state", android.content.Context.MODE_PRIVATE)
            .edit();
        editor.putBoolean("requested_" + Manifest.permission.CAMERA, true);
        editor.putBoolean("requested_" + Manifest.permission.RECORD_AUDIO, true);
        editor.putBoolean("requested_" + Manifest.permission.ACCESS_FINE_LOCATION, true);
        editor.putBoolean("requested_" + Manifest.permission.ACCESS_COARSE_LOCATION, true);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            editor.putBoolean("requested_" + Manifest.permission.POST_NOTIFICATIONS, true);
        }
        editor.apply();

        // Per-permission grant log to pinpoint which one the user denied.
        for (String p : new String[] {
            Manifest.permission.CAMERA,
            Manifest.permission.RECORD_AUDIO,
            Manifest.permission.ACCESS_FINE_LOCATION,
            Manifest.permission.POST_NOTIFICATIONS,
        }) {
            if (Manifest.permission.POST_NOTIFICATIONS.equals(p)
                && Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU) continue;
            boolean granted = hasPermission(p);
            boolean stillCanAsk = canRequest(p);
            Log.i(TAG, "permResult " + p + " granted=" + granted
                + " stillCanAsk=" + stillCanAsk
                + (granted ? "" : (stillCanAsk ? " (denied-once)" : " (DENIED-PERMANENTLY)")));
        }

        call.resolve(after);
    }
}