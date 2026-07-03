package com.merilive.app.plugin;

import android.app.Activity;
import android.content.Intent;
import android.content.IntentSender;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.google.android.play.core.appupdate.AppUpdateInfo;
import com.google.android.play.core.appupdate.AppUpdateManager;
import com.google.android.play.core.appupdate.AppUpdateManagerFactory;
import com.google.android.play.core.appupdate.AppUpdateOptions;
import com.google.android.play.core.install.InstallState;
import com.google.android.play.core.install.InstallStateUpdatedListener;
import com.google.android.play.core.install.model.AppUpdateType;
import com.google.android.play.core.install.model.InstallStatus;
import com.google.android.play.core.install.model.UpdateAvailability;

/**
 * Pkg224 / M19 — Google Play In-App Updates bridge.
 *
 * JS API:
 *   InAppUpdate.check()                         → { available, immediate, flexible, versionCode, staleness }
 *   InAppUpdate.start({ mode: "flexible"|"immediate" })  → resolves immediately, OS UI takes over
 *   InAppUpdate.complete()                      → completeUpdate() (restart for flexible after download)
 *
 * Listens for install-state changes and emits "installStateUpdated" events
 * (status: PENDING|DOWNLOADING|DOWNLOADED|INSTALLED|FAILED|CANCELED).
 */
@CapacitorPlugin(name = "InAppUpdate")
public class InAppUpdatePlugin extends Plugin {

    private static final int REQ_FLEXIBLE = 17361;
    private static final int REQ_IMMEDIATE = 17362;

    private AppUpdateManager manager;
    private volatile AppUpdateInfo lastInfo;

    private final InstallStateUpdatedListener listener = (InstallState state) -> {
        JSObject ev = new JSObject();
        ev.put("status", installStatusName(state.installStatus()));
        ev.put("bytesDownloaded", state.bytesDownloaded());
        ev.put("totalBytesToDownload", state.totalBytesToDownload());
        notifyListeners("installStateUpdated", ev);
    };

    @Override
    public void load() {
        manager = AppUpdateManagerFactory.create(getContext());
        manager.registerListener(listener);
    }

    @Override
    protected void handleOnDestroy() {
        if (manager != null) manager.unregisterListener(listener);
    }

    @PluginMethod
    public void check(PluginCall call) {
        manager.getAppUpdateInfo()
                .addOnSuccessListener(info -> {
                    lastInfo = info;
                    JSObject ret = new JSObject();
                    boolean available = info.updateAvailability() == UpdateAvailability.UPDATE_AVAILABLE;
                    ret.put("available", available);
                    ret.put("immediate", info.isUpdateTypeAllowed(AppUpdateType.IMMEDIATE));
                    ret.put("flexible", info.isUpdateTypeAllowed(AppUpdateType.FLEXIBLE));
                    ret.put("versionCode", info.availableVersionCode());
                    Integer staleness = info.clientVersionStalenessDays();
                    ret.put("stalenessDays", staleness == null ? -1 : staleness.intValue());
                    ret.put("installStatus", installStatusName(info.installStatus()));
                    call.resolve(ret);
                })
                .addOnFailureListener(e -> call.reject(e.getMessage() == null ? "check failed" : e.getMessage()));
    }

    @PluginMethod
    public void start(PluginCall call) {
        final String mode = call.getString("mode", "flexible");
        final boolean immediate = "immediate".equalsIgnoreCase(mode);
        if (lastInfo == null) {
            manager.getAppUpdateInfo()
                    .addOnSuccessListener(info -> { lastInfo = info; launch(call, info, immediate); })
                    .addOnFailureListener(e -> call.reject(e.getMessage() == null ? "no update info" : e.getMessage()));
            return;
        }
        launch(call, lastInfo, immediate);
    }

    private void launch(PluginCall call, AppUpdateInfo info, boolean immediate) {
        Activity activity = getActivity();
        if (activity == null) { call.reject("no activity"); return; }
        int type = immediate ? AppUpdateType.IMMEDIATE : AppUpdateType.FLEXIBLE;
        if (!info.isUpdateTypeAllowed(type)) {
            call.reject(immediate ? "immediate not allowed" : "flexible not allowed");
            return;
        }
        try {
            manager.startUpdateFlowForResult(
                    info,
                    activity,
                    AppUpdateOptions.newBuilder(type).build(),
                    immediate ? REQ_IMMEDIATE : REQ_FLEXIBLE
            );
            JSObject ret = new JSObject();
            ret.put("started", true);
            ret.put("mode", immediate ? "immediate" : "flexible");
            call.resolve(ret);
        } catch (IntentSender.SendIntentException e) {
            call.reject("start failed: " + e.getMessage());
        }
    }

    @PluginMethod
    public void complete(PluginCall call) {
        manager.completeUpdate()
                .addOnSuccessListener(v -> call.resolve())
                .addOnFailureListener(e -> call.reject(e.getMessage() == null ? "complete failed" : e.getMessage()));
    }

    private static String installStatusName(int s) {
        switch (s) {
            case InstallStatus.PENDING: return "PENDING";
            case InstallStatus.DOWNLOADING: return "DOWNLOADING";
            case InstallStatus.DOWNLOADED: return "DOWNLOADED";
            case InstallStatus.INSTALLING: return "INSTALLING";
            case InstallStatus.INSTALLED: return "INSTALLED";
            case InstallStatus.FAILED: return "FAILED";
            case InstallStatus.CANCELED: return "CANCELED";
            case InstallStatus.REQUIRES_UI_INTENT: return "REQUIRES_UI_INTENT";
            default: return "UNKNOWN";
        }
    }
}
