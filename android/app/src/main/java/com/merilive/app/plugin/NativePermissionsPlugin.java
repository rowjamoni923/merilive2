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
        call.resolve(currentStatus());
    }

    @PluginMethod
    public void requestCamera(PluginCall call) {
        if (hasPermission(Manifest.permission.CAMERA)) {
            call.resolve(currentStatus());
            return;
        }
        requestPermissionForAlias("camera", call, "permissionsCallback");
    }

    @PluginMethod
    public void requestMicrophone(PluginCall call) {
        if (hasPermission(Manifest.permission.RECORD_AUDIO)) {
            call.resolve(currentStatus());
            return;
        }
        requestPermissionForAlias("microphone", call, "permissionsCallback");
    }

    @PluginMethod
    public void requestLocation(PluginCall call) {
        if (hasPermission(Manifest.permission.ACCESS_FINE_LOCATION) || hasPermission(Manifest.permission.ACCESS_COARSE_LOCATION)) {
            call.resolve(currentStatus());
            return;
        }
        requestPermissionForAlias("location", call, "permissionsCallback");
    }

    @PluginMethod
    public void requestNotifications(PluginCall call) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU || hasPermission(Manifest.permission.POST_NOTIFICATIONS)) {
            call.resolve(currentStatus());
            return;
        }
        requestPermissionForAlias("notifications", call, "permissionsCallback");
    }

    @PluginMethod
    public void requestAll(PluginCall call) {
        List<String> aliases = new ArrayList<>();
        if (!hasPermission(Manifest.permission.CAMERA)) aliases.add("camera");
        if (!hasPermission(Manifest.permission.RECORD_AUDIO)) aliases.add("microphone");
        if (!hasPermission(Manifest.permission.ACCESS_FINE_LOCATION) && !hasPermission(Manifest.permission.ACCESS_COARSE_LOCATION)) aliases.add("location");
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU && !hasPermission(Manifest.permission.POST_NOTIFICATIONS)) aliases.add("notifications");

        if (aliases.isEmpty()) {
            call.resolve(currentStatus());
            return;
        }

        requestPermissionForAliases(aliases.toArray(new String[0]), call, "permissionsCallback");
    }

    @PluginMethod
    public void openAppSettings(PluginCall call) {
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
        if (!everRequested) return true;
        return androidx.core.app.ActivityCompat.shouldShowRequestPermissionRationale(
            getActivity(), permission);
    }

    @PermissionCallback
    private void permissionsCallback(PluginCall call) {
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
        call.resolve(currentStatus());
    }
}