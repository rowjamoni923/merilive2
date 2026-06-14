package com.merilive.app;

import android.app.ActivityManager;
import android.app.Application;
import android.os.Build;
import android.os.Process;
import android.util.Log;
import android.webkit.WebView;
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

        // Pkg246 — Per-process WebView data directory.
        //
        // Android only allows ONE process per app to use the default WebView
        // data directory. If our FCM service, WorkManager worker, QS tile,
        // or any background process ever instantiates a WebView (even
        // transitively via a 3rd-party SDK), the second process throws
        // WebViewChromiumLockException and the whole app can crash.
        //
        // Calling setDataDirectorySuffix() with the process name *before*
        // any WebView is touched gives each process its own scratch dir.
        // Safe on every API level >= 28; below that we just skip.
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
            try {
                String procName = currentProcessName();
                if (procName != null && !procName.equals(getPackageName())) {
                    // Sanitize: only ASCII letters/digits/_/. allowed.
                    String safe = procName.replace(':', '_').replaceAll("[^A-Za-z0-9_.]", "_");
                    WebView.setDataDirectorySuffix(safe);
                }
            } catch (Throwable t) {
                Log.w(TAG, "WebView.setDataDirectorySuffix failed (non-fatal)", t);
            }
        }

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

        // Pkg208 — register our self-managed PhoneAccount with Telecom
        // at boot so the very first incoming FCM call can be reported
        // without a registration round-trip. Idempotent + crash-safe.
        try {
            com.merilive.app.telecom.TelecomBridge.ensurePhoneAccount(this);
        } catch (Throwable t) {
            Log.w(TAG, "Telecom registration failed (non-fatal)", t);
        }

        // RtcEngineManager removed in 2026-06-14 rebuild — the new minimal
        // LiveKit plugin creates a fresh Room per session, no app-scope
        // cross-Activity engine state to preserve.


        // Pkg-audit Tier-11 (Critical): we MUST chain to the previous
        // uncaught-exception handler. Firebase Crashlytics installs its
        // own handler during FirebaseApp.initializeApp(); replacing it
        // without delegating silently disabled all crash reporting.
        final Thread.UncaughtExceptionHandler previous =
            Thread.getDefaultUncaughtExceptionHandler();
        Thread.setDefaultUncaughtExceptionHandler((t, e) -> {
            try {
                Log.e(TAG, "Uncaught exception in thread " + t.getName(), e);
            } catch (Throwable ignored) {}
            if (previous != null) {
                // Hand off to Crashlytics (and ultimately the system handler)
                // so the crash is reported AND the process is torn down
                // cleanly instead of being left in a half-dead state.
                previous.uncaughtException(t, e);
            }
        });
    }

    /**
     * Returns the current process name (e.g. "com.merilive.app:fcm").
     * Application.getProcessName() exists API 28+; below that we walk
     * ActivityManager.getRunningAppProcesses() to find our pid.
     */
    private String currentProcessName() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
            try { return Application.getProcessName(); } catch (Throwable ignored) {}
        }
        try {
            int pid = Process.myPid();
            ActivityManager am = (ActivityManager) getSystemService(Context.ACTIVITY_SERVICE);
            if (am != null) {
                for (ActivityManager.RunningAppProcessInfo p : am.getRunningAppProcesses()) {
                    if (p.pid == pid) return p.processName;
                }
            }
        } catch (Throwable ignored) {}
        return null;
    }
}
