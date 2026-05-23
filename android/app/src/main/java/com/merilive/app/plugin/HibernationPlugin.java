package com.merilive.app.plugin;

import android.content.Intent;
import androidx.core.content.IntentCompat;
import androidx.core.content.PackageManagerCompat;
import androidx.core.content.UnusedAppRestrictionsConstants;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.google.common.util.concurrent.ListenableFuture;

/**
 * Pkg235 — M29 App hibernation safety.
 *
 * Android 12+ auto-revokes runtime permissions and "hibernates" apps unused
 * for ~3 months. For a streaming/messaging app this silently kills FCM
 * delivery, location, mic/camera perms etc. We surface the OS toggle so the
 * user can opt out of auto-reset for MeriLive.
 *
 * Pkg206 already re-registers the FCM token on every app resume, so the
 * post-hibernation wake-up path is also covered.
 */
@CapacitorPlugin(name = "Hibernation")
public class HibernationPlugin extends Plugin {

    /**
     * Returns one of: "DISABLED" | "ENABLED" | "API_30" | "API_30_BACKPORT"
     * | "API_31" | "FEATURE_NOT_AVAILABLE" | "ERROR".
     * Anything other than "DISABLED" / "FEATURE_NOT_AVAILABLE" means the
     * user should be invited to disable auto-reset.
     */
    @PluginMethod
    public void getStatus(PluginCall call) {
        try {
            ListenableFuture<Integer> f =
                PackageManagerCompat.getUnusedAppRestrictionsStatus(getContext());
            f.addListener(() -> {
                JSObject ret = new JSObject();
                try {
                    int status = f.get();
                    ret.put("status", labelFor(status));
                    ret.put("shouldPrompt",
                            status == UnusedAppRestrictionsConstants.API_30 ||
                            status == UnusedAppRestrictionsConstants.API_30_BACKPORT ||
                            status == UnusedAppRestrictionsConstants.API_31);
                    call.resolve(ret);
                } catch (Throwable t) {
                    ret.put("status", "ERROR");
                    ret.put("shouldPrompt", false);
                    ret.put("error", t.getMessage());
                    call.resolve(ret);
                }
            }, getContext().getMainExecutor());
        } catch (Throwable t) {
            JSObject ret = new JSObject();
            ret.put("status", "FEATURE_NOT_AVAILABLE");
            ret.put("shouldPrompt", false);
            ret.put("error", t.getMessage());
            call.resolve(ret);
        }
    }

    /**
     * Launches the OS settings page where the user can disable auto-reset
     * (Android 11+) or hibernation (Android 12+) for this app.
     */
    @PluginMethod
    public void requestDisable(PluginCall call) {
        try {
            Intent intent = IntentCompat.createManageUnusedAppRestrictionsIntent(
                    getContext(), getContext().getPackageName());
            intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            getContext().startActivity(intent);
            JSObject ret = new JSObject();
            ret.put("launched", true);
            call.resolve(ret);
        } catch (Throwable t) {
            call.reject("Failed to open hibernation settings: " + t.getMessage());
        }
    }

    private static String labelFor(int status) {
        if (status == UnusedAppRestrictionsConstants.FEATURE_NOT_AVAILABLE) return "FEATURE_NOT_AVAILABLE";
        if (status == UnusedAppRestrictionsConstants.DISABLED) return "DISABLED";
        if (status == UnusedAppRestrictionsConstants.API_30_BACKPORT) return "API_30_BACKPORT";
        if (status == UnusedAppRestrictionsConstants.API_30) return "API_30";
        if (status == UnusedAppRestrictionsConstants.API_31) return "API_31";
        return "ERROR";
    }
}
