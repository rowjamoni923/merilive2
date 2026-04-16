package com.merilive.app.util;

import android.app.Activity;
import android.content.Context;
import android.os.Build;
import android.provider.Settings;
import android.view.WindowManager;

public class SecurityHelper {

    public static void enforceSecureScreen(Activity activity) {
        activity.getWindow().setFlags(
            WindowManager.LayoutParams.FLAG_SECURE,
            WindowManager.LayoutParams.FLAG_SECURE
        );
    }

    public static String getDeviceId(Context context) {
        return Settings.Secure.getString(
            context.getContentResolver(),
            Settings.Secure.ANDROID_ID
        );
    }

    public static boolean isDeviceRooted() {
        String[] paths = {
            "/system/app/Superuser.apk", "/sbin/su", "/system/bin/su",
            "/system/xbin/su", "/data/local/xbin/su", "/data/local/bin/su",
            "/system/sd/xbin/su", "/system/bin/failsafe/su", "/data/local/su", "/su/bin/su"
        };
        for (String path : paths) {
            if (new java.io.File(path).exists()) return true;
        }
        try {
            Process process = Runtime.getRuntime().exec(new String[]{"which", "su"});
            return process.waitFor() == 0;
        } catch (Exception e) {
            return false;
        }
    }

    public static boolean isEmulator() {
        return Build.FINGERPRINT.startsWith("generic")
            || Build.FINGERPRINT.startsWith("unknown")
            || Build.MODEL.contains("google_sdk")
            || Build.MODEL.contains("Emulator")
            || Build.MODEL.contains("Android SDK built for x86")
            || Build.MANUFACTURER.contains("Genymotion")
            || (Build.BRAND.startsWith("generic") && Build.DEVICE.startsWith("generic"))
            || "google_sdk".equals(Build.PRODUCT);
    }
}
