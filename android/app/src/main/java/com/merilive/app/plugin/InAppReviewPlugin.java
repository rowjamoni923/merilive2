package com.merilive.app.plugin;

import android.app.Activity;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.google.android.play.core.review.ReviewInfo;
import com.google.android.play.core.review.ReviewManager;
import com.google.android.play.core.review.ReviewManagerFactory;

/**
 * Pkg233 / M27 — Google Play In-App Review bridge.
 *
 * JS API:
 *   InAppReview.request() → { shown: boolean }
 *
 * Note: Play decides whether the dialog is actually shown (quota / cooldown
 * are handled by the Play Store). We just request the flow; success means
 * the flow completed (no guarantee the user saw the prompt).
 */
@CapacitorPlugin(name = "InAppReview")
public class InAppReviewPlugin extends Plugin {

    @PluginMethod
    public void request(PluginCall call) {
        final Activity activity = getActivity();
        if (activity == null) {
            call.reject("no activity");
            return;
        }
        final ReviewManager manager = ReviewManagerFactory.create(getContext());
        manager.requestReviewFlow().addOnCompleteListener(req -> {
            if (!req.isSuccessful()) {
                JSObject ret = new JSObject();
                ret.put("shown", false);
                ret.put("reason", req.getException() == null ? "unknown" : req.getException().getMessage());
                call.resolve(ret);
                return;
            }
            ReviewInfo info = req.getResult();
            manager.launchReviewFlow(activity, info).addOnCompleteListener(flow -> {
                JSObject ret = new JSObject();
                ret.put("shown", flow.isSuccessful());
                call.resolve(ret);
            });
        });
    }
}
