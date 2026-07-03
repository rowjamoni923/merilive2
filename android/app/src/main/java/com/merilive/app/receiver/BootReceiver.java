package com.merilive.app.receiver;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.util.Log;

import com.google.firebase.messaging.FirebaseMessaging;
import com.merilive.app.util.NotificationHelper;

/**
 * Pkg206 — Boot receiver upgraded for Doze/App-Standby resilience.
 *
 * On BOOT_COMPLETED + MY_PACKAGE_REPLACED (app update) we:
 *   1. Re-create notification channels (in case OS dropped them).
 *   2. Force-fetch the current FCM token — wakes the FirebaseMessaging
 *      service so subsequent pushes don't suffer a cold-start delay,
 *      and triggers onNewToken if the token rotated while powered off.
 */
public class BootReceiver extends BroadcastReceiver {

    private static final String TAG = "MeriBootReceiver";

    @Override
    public void onReceive(Context context, Intent intent) {
        String action = intent.getAction();
        if (action == null) return;

        if (Intent.ACTION_BOOT_COMPLETED.equals(action)
                || Intent.ACTION_MY_PACKAGE_REPLACED.equals(action)
                || Intent.ACTION_LOCKED_BOOT_COMPLETED.equals(action)) {

            Log.i(TAG, "Pkg206 boot/upgrade event: " + action);
            try { NotificationHelper.createNotificationChannels(context); } catch (Exception ignored) { /* ignore */ }

            // Wake FirebaseMessaging — surfaces onNewToken if rotated.
            try {
                FirebaseMessaging.getInstance().getToken()
                    .addOnSuccessListener(token -> Log.i(TAG, "FCM warmed after boot"))
                    .addOnFailureListener(err -> Log.w(TAG, "FCM warmup failed", err));
            } catch (Exception e) {
                Log.w(TAG, "FirebaseMessaging not available", e);
            }
        }
    }
}
