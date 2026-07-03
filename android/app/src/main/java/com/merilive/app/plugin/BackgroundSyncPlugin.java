package com.merilive.app.plugin;

import android.content.Context;
import android.content.SharedPreferences;

import androidx.work.BackoffPolicy;
import androidx.work.Constraints;
import androidx.work.ExistingPeriodicWorkPolicy;
import androidx.work.NetworkType;
import androidx.work.PeriodicWorkRequest;
import androidx.work.WorkManager;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.merilive.app.worker.BackgroundSyncWorker;

import java.util.concurrent.TimeUnit;

/**
 * Pkg221 — M16 Background Data Sync bridge.
 *
 * JS layer calls enable(...) right after sign-in with the user's Supabase
 * URL + anon key + access token + user_id. The plugin caches them in
 * SharedPreferences and schedules a periodic WorkManager job that fires
 * every ~15 min (Android minimum). The worker hits the
 * get_background_unread_total RPC and updates the launcher badge.
 *
 * Call disable() on sign-out so a stranger's badge is never shown.
 * Call refreshToken({accessToken}) on TOKEN_REFRESHED so the worker
 * keeps a fresh JWT after the original expires.
 */
@CapacitorPlugin(name = "BackgroundSync")
public class BackgroundSyncPlugin extends Plugin {

    public static final String PREFS = "merilive_bg_sync";
    public static final String WORK_NAME = "merilive-bg-sync";

    @PluginMethod
    public void enable(PluginCall call) {
        String supabaseUrl = call.getString("supabaseUrl", "");
        String anonKey = call.getString("anonKey", "");
        String accessToken = call.getString("accessToken", "");
        String userId = call.getString("userId", "");
        Long intervalMin = call.getLong("intervalMinutes", 15L);
        if (intervalMin == null || intervalMin < 15) intervalMin = 15L;

        if (supabaseUrl.isEmpty() || anonKey.isEmpty() || accessToken.isEmpty() || userId.isEmpty()) {
            call.reject("missing-required-fields");
            return;
        }

        Context ctx = getContext();
        SharedPreferences.Editor ed = ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit();
        ed.putString("supabase_url", supabaseUrl)
          .putString("anon_key", anonKey)
          .putString("access_token", accessToken)
          .putString("user_id", userId)
          .apply();

        Constraints constraints = new Constraints.Builder()
            .setRequiredNetworkType(NetworkType.CONNECTED)
            .build();

        PeriodicWorkRequest req = new PeriodicWorkRequest.Builder(
                BackgroundSyncWorker.class, intervalMin, TimeUnit.MINUTES)
            .setConstraints(constraints)
            .setBackoffCriteria(BackoffPolicy.EXPONENTIAL, 60, TimeUnit.SECONDS)
            .addTag("merilive-bg-sync")
            .build();

        WorkManager.getInstance(ctx).enqueueUniquePeriodicWork(
            WORK_NAME, ExistingPeriodicWorkPolicy.UPDATE, req);

        JSObject res = new JSObject();
        res.put("enabled", true);
        res.put("intervalMinutes", intervalMin);
        call.resolve(res);
    }

    @PluginMethod
    public void refreshToken(PluginCall call) {
        String accessToken = call.getString("accessToken", "");
        if (accessToken.isEmpty()) { call.reject("missing-access-token"); return; }
        getContext().getSharedPreferences(PREFS, Context.MODE_PRIVATE)
            .edit().putString("access_token", accessToken).apply();
        call.resolve();
    }

    @PluginMethod
    public void disable(PluginCall call) {
        Context ctx = getContext();
        WorkManager.getInstance(ctx).cancelUniqueWork(WORK_NAME);
        ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE).edit().clear().apply();
        try {
            android.app.NotificationManager nm = (android.app.NotificationManager)
                ctx.getSystemService(Context.NOTIFICATION_SERVICE);
            if (nm != null) nm.cancel(7777);
        } catch (Exception ignored) {}
        call.resolve();
    }

    @PluginMethod
    public void getStatus(PluginCall call) {
        SharedPreferences p = getContext().getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        JSObject res = new JSObject();
        res.put("hasCredentials", p.contains("access_token"));
        res.put("lastUnreadTotal", p.getInt("last_unread_total", 0));
        res.put("lastSyncAt", p.getLong("last_sync_at", 0L));
        call.resolve(res);
    }

    /**
     * Pkg252 — JS-driven foreground push of the unread total to the
     * home-screen QuickActionsWidget badge. Use whenever the in-app
     * unread count changes (Supabase Realtime, mark-as-read, etc.) so
     * the badge does not have to wait for the 15-min worker tick.
     */
    @PluginMethod
    public void setUnreadCount(PluginCall call) {
        Integer count = call.getInt("count", 0);
        if (count == null) count = 0;
        try {
            com.merilive.app.widget.QuickActionsWidget
                .updateUnreadCount(getContext(), count);
        } catch (Exception ignored) {}
        call.resolve();
    }
}
