package com.merilive.app.plugin;

import android.content.SharedPreferences;

import com.android.installreferrer.api.InstallReferrerClient;
import com.android.installreferrer.api.InstallReferrerStateListener;
import com.android.installreferrer.api.ReferrerDetails;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * Pkg62 — Google Play Install Referrer bridge.
 *
 * On first launch, fetches the install-referrer URL written by Google Play
 * when the user clicked a Play Store link with ?referrer=... query string.
 * Used by JS (src/utils/installReferrer.ts) to populate `meri_pending_referral`
 * + `meri_pending_invitation_ref` so the user's invitation / agency code is
 * applied automatically — no manual code entry required.
 *
 * Result is cached in SharedPreferences so the Play API is only queried once
 * per install (it's a one-shot value anyway).
 */
@CapacitorPlugin(name = "InstallReferrer")
public class InstallReferrerPlugin extends Plugin {

    private static final String PREFS = "meri_install_referrer";
    private static final String KEY_FETCHED = "fetched";
    private static final String KEY_VALUE = "referrer";

    @PluginMethod
    public void getReferrer(final PluginCall call) {
        final SharedPreferences prefs =
                getContext().getSharedPreferences(PREFS, 0);

        // Return cached value if already fetched once.
        if (prefs.getBoolean(KEY_FETCHED, false)) {
            JSObject ret = new JSObject();
            ret.put("referrer", prefs.getString(KEY_VALUE, ""));
            ret.put("cached", true);
            call.resolve(ret);
            return;
        }

        final InstallReferrerClient client =
                InstallReferrerClient.newBuilder(getContext()).build();

        client.startConnection(new InstallReferrerStateListener() {
            @Override
            public void onInstallReferrerSetupFinished(int responseCode) {
                String referrer = "";
                try {
                    if (responseCode == InstallReferrerClient.InstallReferrerResponse.OK) {
                        ReferrerDetails details = client.getInstallReferrer();
                        if (details != null && details.getInstallReferrer() != null) {
                            referrer = details.getInstallReferrer();
                        }
                    }
                } catch (Exception e) {
                    // swallow — referrer just stays empty
                } finally {
                    prefs.edit()
                            .putBoolean(KEY_FETCHED, true)
                            .putString(KEY_VALUE, referrer)
                            .apply();
                    try { client.endConnection(); } catch (Exception ignored) {}
                }
                JSObject ret = new JSObject();
                ret.put("referrer", referrer);
                ret.put("cached", false);
                ret.put("responseCode", responseCode);
                call.resolve(ret);
            }

            @Override
            public void onInstallReferrerServiceDisconnected() {
                // No-op — next call will retry.
            }
        });
    }
}
