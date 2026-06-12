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
        String brand = Build.BRAND == null ? "" : Build.BRAND.toLowerCase();
        Intent intent = new Intent();

        try {
            // Pkg-OEM-hardening: research-verified deep-links for every major OEM.
            // Sources: MIUI/HyperOS securitycenter, ColorOS safecenter, FunTouchOS
            // permissionmanager, Samsung lool/SleepingAppsActivity, Huawei systemmanager,
            // Honor systemmanager, Tecno/Infinix transsion.phonemaster.
            if (manufacturer.contains("xiaomi") || brand.contains("redmi") || brand.contains("poco")) {
                intent.setClassName("com.miui.securitycenter", "com.miui.permcenter.autostart.AutoStartManagementActivity");
            } else if (manufacturer.contains("oppo")) {
                intent.setClassName("com.coloros.safecenter", "com.coloros.safecenter.permission.startup.StartupAppListActivity");
            } else if (manufacturer.contains("realme") || brand.contains("realme")) {
                intent.setClassName("com.coloros.safecenter", "com.coloros.safecenter.permission.startup.StartupAppListActivity");
            } else if (manufacturer.contains("oneplus")) {
                intent.setClassName("com.oneplus.security", "com.oneplus.security.chainlaunch.view.ChainLaunchAppListActivity");
            } else if (manufacturer.contains("vivo") || manufacturer.contains("iqoo") || brand.contains("iqoo")) {
                intent.setClassName("com.iqoo.secure", "com.iqoo.secure.ui.phoneoptimize.AddWhiteListActivity");
            } else if (manufacturer.contains("samsung")) {
                // OneUI does not expose a dedicated autostart screen; deep-link to
                // SleepingAppsActivity (Device Care / battery → never-sleeping apps).
                intent.setClassName("com.samsung.android.lool", "com.samsung.android.sm.ui.battery.BatteryActivity");
            } else if (manufacturer.contains("huawei")) {
                intent.setClassName("com.huawei.systemmanager", "com.huawei.systemmanager.startupmgr.ui.StartupNormalAppListActivity");
            } else if (manufacturer.contains("honor") || brand.contains("honor")) {
                intent.setClassName("com.hihonor.systemmanager", "com.hihonor.systemmanager.startupmgr.ui.StartupNormalAppListActivity");
            } else if (manufacturer.contains("tecno") || manufacturer.contains("infinix") || manufacturer.contains("itel") || brand.contains("tecno") || brand.contains("infinix")) {
                intent.setClassName("com.transsion.phonemaster", "com.transsion.autostart.AutoStartActivity");
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
            // Pkg-OEM-hardening: prefer the per-app details settings so the
            // user lands on a screen where they can at least toggle battery
            // restrictions instead of a generic settings root.
            try {
                Intent fallback = new Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS);
                fallback.setData(Uri.parse("package:" + context.getPackageName()));
                fallback.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                context.startActivity(fallback);
                call.resolve();
            } catch (Throwable t) {
                try {
                    Intent generic = new Intent(Settings.ACTION_SETTINGS);
                    generic.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                    context.startActivity(generic);
                    call.resolve();
                } catch (Throwable t2) {
                    call.reject("openAutostartSettings failed: " + t2.getMessage());
                }
            }
        }
    }
}
