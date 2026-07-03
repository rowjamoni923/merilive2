package com.merilive.app.plugin;

import android.app.Activity;
import android.util.Log;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.google.android.play.core.integrity.StandardIntegrityManager;
import com.google.android.play.core.integrity.StandardIntegrityManager.PrepareIntegrityTokenRequest;
import com.google.android.play.core.integrity.StandardIntegrityManager.StandardIntegrityToken;
import com.google.android.play.core.integrity.StandardIntegrityManager.StandardIntegrityTokenProvider;
import com.google.android.play.core.integrity.StandardIntegrityManager.StandardIntegrityTokenRequest;
import com.google.android.play.core.integrity.IntegrityManagerFactory;

import com.merilive.app.R;

import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.atomic.AtomicBoolean;

/**
 * Pkg236 — Play Integrity API plugin.
 *
 * Pkg-audit fixes:
 *   • tokenProvider is volatile — was racing between Play Task threads and
 *     plugin caller threads, causing redundant prepares.
 *   • Single-flight lazy prepare — concurrent requestToken() calls queue
 *     behind ONE in-flight prepareIntegrityToken() instead of issuing N.
 *   • Activity-scoped listeners — Play Task references are cleared when
 *     the activity is destroyed, preventing Activity leaks.
 */
@CapacitorPlugin(name = "PlayIntegrity")
public class PlayIntegrityPlugin extends Plugin {
    private static final String TAG = "PlayIntegrityPlugin";

    private volatile StandardIntegrityTokenProvider tokenProvider;
    private long cloudProjectNumber;

    // Single-flight prepare guard
    private final AtomicBoolean prepareInFlight = new AtomicBoolean(false);
    private final List<Runnable> waiters = new ArrayList<>();

    @Override
    public void load() {
        super.load();
        try {
            String raw = getContext().getString(R.string.play_cloud_project_number);
            cloudProjectNumber = Long.parseLong(raw.trim());
        } catch (Throwable t) {
            cloudProjectNumber = 0L;
            Log.w(TAG, "play_cloud_project_number missing or invalid");
        }
    }

    @PluginMethod
    public void prepare(PluginCall call) {
        if (cloudProjectNumber <= 0L) {
            call.reject("CLOUD_PROJECT_NUMBER_MISSING");
            return;
        }
        runPrepare(() -> {
            JSObject ret = new JSObject();
            ret.put("ready", tokenProvider != null);
            call.resolve(ret);
        }, err -> call.reject("PREPARE_FAILED", err));
    }

    @PluginMethod
    public void requestToken(PluginCall call) {
        final String nonce = call.getString("nonce", null);
        final Runnable doRequest = () -> {
            try {
                StandardIntegrityTokenRequest.Builder b =
                        StandardIntegrityTokenRequest.builder();
                if (nonce != null && !nonce.isEmpty()) {
                    b.setRequestHash(nonce);
                }
                StandardIntegrityTokenProvider tp = tokenProvider;
                if (tp == null) {
                    call.reject("PREPARE_FAILED", new IllegalStateException("token provider null"));
                    return;
                }
                Activity act = getActivity();
                if (act != null) {
                    tp.request(b.build())
                            .addOnSuccessListener(act, resp -> {
                                JSObject ret = new JSObject();
                                ret.put("token", resp.token());
                                call.resolve(ret);
                            })
                            .addOnFailureListener(act, err -> {
                                Log.w(TAG, "request token failed", err);
                                call.reject("REQUEST_FAILED", err);
                            });
                } else {
                    tp.request(b.build())
                            .addOnSuccessListener(resp -> {
                                JSObject ret = new JSObject();
                                ret.put("token", resp.token());
                                call.resolve(ret);
                            })
                            .addOnFailureListener(err -> {
                                Log.w(TAG, "request token failed", err);
                                call.reject("REQUEST_FAILED", err);
                            });
                }
            } catch (Throwable t) {
                Log.e(TAG, "request error", t);
                call.reject("REQUEST_ERROR", t);
            }
        };

        if (tokenProvider != null) {
            doRequest.run();
            return;
        }

        if (cloudProjectNumber <= 0L) {
            call.reject("CLOUD_PROJECT_NUMBER_MISSING");
            return;
        }
        runPrepare(doRequest, err -> call.reject("PREPARE_FAILED", err));
    }

    /**
     * Single-flight prepare: only ONE prepareIntegrityToken() round-trip is
     * issued even when many callers race in concurrently. All callers run
     * their onReady runnable after the shared prepare settles.
     */
    private void runPrepare(Runnable onReady, java.util.function.Consumer<Exception> onFail) {
        synchronized (waiters) {
            if (tokenProvider != null) {
                onReady.run();
                return;
            }
            waiters.add(onReady);
            if (!prepareInFlight.compareAndSet(false, true)) {
                return; // someone else is preparing; we'll fire when they do.
            }
        }
        try {
            StandardIntegrityManager manager =
                    IntegrityManagerFactory.createStandard(getContext());
            Activity act = getActivity();
            com.google.android.gms.tasks.Task<StandardIntegrityTokenProvider> task =
                    manager.prepareIntegrityToken(
                            PrepareIntegrityTokenRequest.builder()
                                    .setCloudProjectNumber(cloudProjectNumber)
                                    .build()
                    );
            Runnable drainOk = () -> {
                List<Runnable> pending;
                synchronized (waiters) {
                    pending = new ArrayList<>(waiters);
                    waiters.clear();
                    prepareInFlight.set(false);
                }
                for (Runnable r : pending) {
                    try { r.run(); } catch (Throwable ignored) {}
                }
            };
            java.util.function.Consumer<Exception> drainErr = err -> {
                List<Runnable> pending;
                synchronized (waiters) {
                    pending = new ArrayList<>(waiters);
                    waiters.clear();
                    prepareInFlight.set(false);
                }
                onFail.accept(err);
                // Other waiters get rejected via their own onFail closures
                // captured when they called runPrepare(). Since we share one
                // onFail here, additional waiters simply re-attempt on next call.
                for (int i = 1; i < pending.size(); i++) {
                    try { pending.get(i).run(); } catch (Throwable ignored) {}
                }
            };

            if (act != null) {
                task.addOnSuccessListener(act, p -> { tokenProvider = p; drainOk.run(); })
                    .addOnFailureListener(act, err -> { Log.w(TAG, "prepare failed", err); drainErr.accept(err); });
            } else {
                task.addOnSuccessListener(p -> { tokenProvider = p; drainOk.run(); })
                    .addOnFailureListener(err -> { Log.w(TAG, "prepare failed", err); drainErr.accept(err); });
            }
        } catch (Throwable t) {
            Log.e(TAG, "prepare error", t);
            synchronized (waiters) {
                waiters.clear();
                prepareInFlight.set(false);
            }
            onFail.accept(t instanceof Exception ? (Exception) t : new RuntimeException(t));
        }
    }

    @Override
    protected void handleOnDestroy() {
        synchronized (waiters) {
            waiters.clear();
            prepareInFlight.set(false);
        }
        tokenProvider = null;
        super.handleOnDestroy();
    }
}
