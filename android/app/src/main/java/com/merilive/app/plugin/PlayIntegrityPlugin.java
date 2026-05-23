package com.merilive.app.plugin;

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

/**
 * Pkg236 — Play Integrity API plugin.
 *
 * Exposes two methods to JS:
 *   prepare()       — one-time warmup; caches a token provider
 *   requestToken({nonce}) — returns a signed integrity token to send to the
 *                            verify-play-integrity edge function
 *
 * Cloud project number must be configured in res/values/strings.xml as
 *   <string name="play_cloud_project_number">123456789012</string>
 */
@CapacitorPlugin(name = "PlayIntegrity")
public class PlayIntegrityPlugin extends Plugin {
    private static final String TAG = "PlayIntegrityPlugin";

    private StandardIntegrityTokenProvider tokenProvider;
    private long cloudProjectNumber;

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
        try {
            StandardIntegrityManager manager =
                    IntegrityManagerFactory.createStandard(getContext());
            manager.prepareIntegrityToken(
                    PrepareIntegrityTokenRequest.builder()
                            .setCloudProjectNumber(cloudProjectNumber)
                            .build()
            )
                    .addOnSuccessListener(provider -> {
                        tokenProvider = provider;
                        JSObject ret = new JSObject();
                        ret.put("ready", true);
                        call.resolve(ret);
                    })
                    .addOnFailureListener(err -> {
                        Log.w(TAG, "prepareIntegrityToken failed", err);
                        call.reject("PREPARE_FAILED", err);
                    });
        } catch (Throwable t) {
            Log.e(TAG, "prepare error", t);
            call.reject("PREPARE_ERROR", t);
        }
    }

    @PluginMethod
    public void requestToken(PluginCall call) {
        String nonce = call.getString("nonce", null);
        Runnable doRequest = () -> {
            try {
                StandardIntegrityTokenRequest.Builder b =
                        StandardIntegrityTokenRequest.builder();
                if (nonce != null && !nonce.isEmpty()) {
                    b.setRequestHash(nonce);
                }
                tokenProvider.request(b.build())
                        .addOnSuccessListener(resp -> {
                            JSObject ret = new JSObject();
                            ret.put("token", resp.token());
                            call.resolve(ret);
                        })
                        .addOnFailureListener(err -> {
                            Log.w(TAG, "request token failed", err);
                            call.reject("REQUEST_FAILED", err);
                        });
            } catch (Throwable t) {
                Log.e(TAG, "request error", t);
                call.reject("REQUEST_ERROR", t);
            }
        };

        if (tokenProvider == null) {
            // Lazy-prepare on first call
            if (cloudProjectNumber <= 0L) {
                call.reject("CLOUD_PROJECT_NUMBER_MISSING");
                return;
            }
            try {
                IntegrityManagerFactory.createStandard(getContext())
                        .prepareIntegrityToken(
                                PrepareIntegrityTokenRequest.builder()
                                        .setCloudProjectNumber(cloudProjectNumber)
                                        .build()
                        )
                        .addOnSuccessListener(p -> {
                            tokenProvider = p;
                            doRequest.run();
                        })
                        .addOnFailureListener(err -> {
                            Log.w(TAG, "lazy prepare failed", err);
                            call.reject("PREPARE_FAILED", err);
                        });
            } catch (Throwable t) {
                Log.e(TAG, "lazy prepare error", t);
                call.reject("PREPARE_ERROR", t);
            }
        } else {
            doRequest.run();
        }
    }
}
