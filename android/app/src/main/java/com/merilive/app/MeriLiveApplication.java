package com.merilive.app;

import android.app.Application;
import android.util.Log;
import androidx.multidex.MultiDex;
import android.content.Context;

import com.google.firebase.FirebaseApp;
import com.merilive.app.util.NotificationHelper;

public class MeriLiveApplication extends Application {

    private static final String TAG = "MeriLiveApplication";

    @Override
    protected void attachBaseContext(Context base) {
        super.attachBaseContext(base);
        // MultiDex for older devices (API < 21 fallback safety; harmless on newer)
        try {
            MultiDex.install(this);
        } catch (Throwable t) {
            Log.w(TAG, "MultiDex install failed (non-fatal)", t);
        }
    }

    @Override
    public void onCreate() {
        super.onCreate();

        // CRITICAL: Wrap every init in try/catch so a single failure
        // (e.g. Firebase missing google-services on a stripped device)
        // never prevents the app from launching.
        try {
            FirebaseApp.initializeApp(this);
        } catch (Throwable t) {
            Log.e(TAG, "Firebase init failed (continuing without it)", t);
        }

        try {
            NotificationHelper.createNotificationChannels(this);
        } catch (Throwable t) {
            Log.e(TAG, "Notification channel setup failed (non-fatal)", t);
        }

        // Catch any uncaught crash on background threads so the WebView
        // process keeps the app visible and the user gets a recoverable UI
        // rather than a hard "App keeps stopping" dialog on first launch.
        Thread.setDefaultUncaughtExceptionHandler((t, e) -> {
            Log.e(TAG, "Uncaught exception in thread " + t.getName(), e);
        });
    }
}
