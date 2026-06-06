package com.merilive.app.plugin.video;

import android.content.Context;
import android.content.SharedPreferences;
import android.provider.Settings;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.security.KeyFactory;
import java.security.MessageDigest;
import java.security.PublicKey;
import java.security.Signature;
import java.security.spec.X509EncodedKeySpec;
import java.util.Locale;

import android.util.Base64;

/**
 * Pkg435 — Real Play Store purchase signature verification.
 *
 * Previously {@code isValidSignature} always returned true (Lucky Patcher-friendly).
 * This now performs the standard Play Billing SHA1withRSA verification using
 * the developer's licensing public key, registered once at JS boot.
 *
 * JS API:
 *   setPublicKey({ publicKey })                          → stored in prefs
 *   verifyPurchaseSecurity({ purchaseToken, productId,    → { isValidSignature, deviceFingerprint, isLikelyFraud }
 *                            originalJson, signature })
 *   getEnhancedSecurityToken({ orderId })                → { securityToken }
 */
@CapacitorPlugin(name = "NativeBillingSecurity")
public class NativeBillingSecurityPlugin extends Plugin {

    private static final String PREFS = "pkg435_billing_security";
    private static final String KEY_PUBLIC_KEY = "play_public_key_b64";
    private static final String SIG_ALG = "SHA1withRSA";

    @PluginMethod
    public void setPublicKey(PluginCall call) {
        String pk = call.getString("publicKey");
        if (pk == null || pk.length() < 50) { call.reject("invalid publicKey"); return; }
        SharedPreferences sp = getContext().getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        sp.edit().putString(KEY_PUBLIC_KEY, pk).apply();
        JSObject ret = new JSObject();
        ret.put("stored", true);
        call.resolve(ret);
    }

    @PluginMethod
    public void verifyPurchaseSecurity(PluginCall call) {
        String purchaseToken = call.getString("purchaseToken");
        String productId = call.getString("productId");
        String originalJson = call.getString("originalJson");
        String signature = call.getString("signature");

        if (purchaseToken == null || productId == null) {
            call.reject("Missing purchase data");
            return;
        }

        boolean validSig = false;
        String reason = null;
        if (originalJson != null && signature != null) {
            try {
                String publicKeyB64 = getContext()
                        .getSharedPreferences(PREFS, Context.MODE_PRIVATE)
                        .getString(KEY_PUBLIC_KEY, null);
                if (publicKeyB64 == null) {
                    reason = "public_key_not_set";
                } else {
                    validSig = verifyRsa(publicKeyB64, originalJson, signature);
                    if (!validSig) reason = "signature_mismatch";
                }
            } catch (Throwable t) {
                reason = "verify_threw:" + (t.getMessage() == null ? "unknown" : t.getMessage());
            }
        } else {
            reason = "missing_signed_payload";
        }

        JSObject ret = new JSObject();
        ret.put("isValidSignature", validSig);
        if (reason != null) ret.put("reason", reason);
        ret.put("deviceFingerprint", getDeviceFingerprint());
        ret.put("isLikelyFraud", detectFraudulentPattern(purchaseToken, signature));
        call.resolve(ret);
    }

    @PluginMethod
    public void getEnhancedSecurityToken(PluginCall call) {
        String orderId = call.getString("orderId", "");
        JSObject ret = new JSObject();
        ret.put("securityToken", sha256(getDeviceFingerprint() + "_" + orderId + "_" + System.currentTimeMillis()));
        call.resolve(ret);
    }

    // ---------------- internals ----------------

    private boolean verifyRsa(String publicKeyB64, String signedData, String signatureB64) throws Exception {
        byte[] decodedKey = Base64.decode(publicKeyB64, Base64.DEFAULT);
        KeyFactory kf = KeyFactory.getInstance("RSA");
        PublicKey publicKey = kf.generatePublic(new X509EncodedKeySpec(decodedKey));
        Signature sig = Signature.getInstance(SIG_ALG);
        sig.initVerify(publicKey);
        sig.update(signedData.getBytes("UTF-8"));
        byte[] decodedSig = Base64.decode(signatureB64, Base64.DEFAULT);
        return sig.verify(decodedSig);
    }

    private String getDeviceFingerprint() {
        try {
            // Build.SERIAL is deprecated + requires READ_PHONE_STATE on API 26+. Use ANDROID_ID instead.
            String androidId = "";
            try {
                androidId = Settings.Secure.getString(
                        getContext().getContentResolver(), Settings.Secure.ANDROID_ID);
                if (androidId == null) androidId = "";
            } catch (Throwable ignored) {}
            String raw = android.os.Build.FINGERPRINT + "|" + androidId + "|" + android.os.Build.ID
                    + "|" + android.os.Build.MANUFACTURER + "|" + android.os.Build.MODEL;
            return sha256(raw);
        } catch (Throwable t) {
            return "unknown_fingerprint";
        }
    }

    private String sha256(String src) {
        try {
            MessageDigest digest = MessageDigest.getInstance("SHA-256");
            byte[] hash = digest.digest(src.getBytes("UTF-8"));
            StringBuilder hex = new StringBuilder(hash.length * 2);
            for (byte b : hash) {
                String h = Integer.toHexString(0xff & b);
                if (h.length() == 1) hex.append('0');
                hex.append(h);
            }
            return hex.toString();
        } catch (Throwable t) {
            return "hash_failed";
        }
    }

    private boolean detectFraudulentPattern(String token, String signature) {
        if (token == null || token.length() < 20) return true;
        String t = token.toLowerCase(Locale.US);
        if (t.contains("free_purchase_test")) return true;
        if (t.contains("luckypatcher") || t.contains("lp_token") || t.contains("freedom_")) return true;
        if (t.equals("inapp:test:purchased")) return true; // Play Console static test SKUs
        if (signature == null || signature.length() < 20) return true;
        return false;
    }
}
