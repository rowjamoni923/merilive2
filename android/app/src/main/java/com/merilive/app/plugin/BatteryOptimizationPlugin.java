package com.merilive.app.plugin;

import android.content.Context;
import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.os.PowerManager;
import android.provider.Settings;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

@CapacitorPlugin(name = "BatteryOptimization")
public class BatteryOptimizationPlugin extends Plugin {

    @PluginMethod
    public void isIgnoringBatteryOptimizations(PluginCall call) {
        Context context = getContext();
        PowerManager pm = (PowerManager) context.getSystemService(Context.POWER_SERVICE);
        boolean isIgnoring = false;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            isIgnoring = pm.isIgnoringBatteryOptimizations(context.getPackageName());
        }
        JSObject ret = new JSObject();
        ret.put("isIgnoring", isIgnoring);
        call.resolve(ret);
    }

    @PluginMethod
    public void requestIgnoreBatteryOptimizations(PluginCall call) {
        Context context = getContext();
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            String packageName = context.getPackageName();
            PowerManager pm = (PowerManager) context.getSystemService(Context.POWER_SERVICE);
            if (pm != null && !pm.isIgnoringBatteryOptimizations(packageName)) {
                Intent intent = new Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS);
                intent.setData(Uri.parse("package:" + packageName));
                // Pkg-audit Tier-11 (High): startActivity from the Application
                // context REQUIRES FLAG_ACTIVITY_NEW_TASK. Without it the call
                // throws AndroidRuntimeException on launch.
                intent.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                try {
                    context.startActivity(intent);
                    call.resolve();
                } catch (Throwable t) {
                    call.reject("startActivity failed: " + t.getMessage());
                }
            } else {
                call.resolve();
            }
        } else {
            call.resolve();
        }
    }

    @PluginMethod
    public void openAutostartSettings(PluginCall call) {
        Context context = getContext();
        String manufacturer = Build.MANUFACTURER == null ? "" : Build.MANUFACTURER.toLowerCase();
        Intent intent = new Intent();

        try {
            if (manufacturer.contains("xiaomi")) {
                intent.setClassName("com.miui.securitycenter", "com.miui.permcenter.autostart.AutoStartManagementActivity");
            } else if (manufacturer.contains("oppo")) {
                intent.setClassName("com.coloros.safecenter", "com.coloros.safecenter.permission.startup.StartupAppListActivity");
            } else if (manufacturer.contains("vivo")) {
                intent.setClassName("com.vivo.permissionmanager", "com.vivo.permissionmanager.activity.BgStartUpManagerActivity");
            } else if (manufacturer.contains("huawei")) {
                intent.setClassName("com.huawei.systemmanager", "com.huawei.systemmanager.optimize.process.ProtectActivity");
            } else {
                intent.setAction(Settings.ACTION_SETTINGS);
            }
            intent.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            context.startActivity(intent);
            call.resolve();
        } catch (Exception e) {
            // Pkg-audit Tier-11 (Medium): the original catch built a NEW
            // intent without NEW_TASK and tried again, which crashes
            // (RuntimeException → uncaught). Build a fresh, properly-
            // flagged fallback and swallow secondary failures.
            try {
                Intent fallback = new Intent(Settings.ACTION_SETTINGS);
                fallback.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                context.startActivity(fallback);
                call.resolve();
            } catch (Throwable t) {
                call.reject("openAutostartSettings failed: " + t.getMessage());
            }
        }
    }
}