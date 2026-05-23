package com.merilive.app.plugin;

import android.content.SharedPreferences;
import androidx.security.crypto.EncryptedSharedPreferences;
import androidx.security.crypto.MasterKey;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * Pkg258 — AES256-GCM Keystore-backed key/value store.
 * Use for: refresh tokens, biometric pepper, encryption keys, sensitive
 * settings. Survives backup-exclusion (already excluded in Pkg241).
 */
@CapacitorPlugin(name = "SecureStorage")
public class SecureStoragePlugin extends Plugin {

    private static final String FILE = "merilive_secure_kv";
    private SharedPreferences prefs;

    private SharedPreferences prefs() throws Exception {
        if (prefs == null) {
            MasterKey mk = new MasterKey.Builder(getContext())
                .setKeyScheme(MasterKey.KeyScheme.AES256_GCM)
                .build();
            prefs = EncryptedSharedPreferences.create(
                getContext(),
                FILE,
                mk,
                EncryptedSharedPreferences.PrefKeyEncryptionScheme.AES256_SIV,
                EncryptedSharedPreferences.PrefValueEncryptionScheme.AES256_GCM
            );
        }
        return prefs;
    }

    @PluginMethod
    public void set(PluginCall call) {
        String key = call.getString("key");
        String value = call.getString("value");
        if (key == null || value == null) {
            call.reject("key and value required");
            return;
        }
        try {
            prefs().edit().putString(key, value).apply();
            call.resolve();
        } catch (Exception e) {
            call.reject("set failed: " + e.getMessage(), e);
        }
    }

    @PluginMethod
    public void get(PluginCall call) {
        String key = call.getString("key");
        if (key == null) { call.reject("key required"); return; }
        try {
            String v = prefs().getString(key, null);
            JSObject o = new JSObject();
            o.put("value", v);
            call.resolve(o);
        } catch (Exception e) {
            call.reject("get failed: " + e.getMessage(), e);
        }
    }

    @PluginMethod
    public void remove(PluginCall call) {
        String key = call.getString("key");
        if (key == null) { call.reject("key required"); return; }
        try {
            prefs().edit().remove(key).apply();
            call.resolve();
        } catch (Exception e) {
            call.reject("remove failed: " + e.getMessage(), e);
        }
    }

    @PluginMethod
    public void clear(PluginCall call) {
        try {
            prefs().edit().clear().apply();
            call.resolve();
        } catch (Exception e) {
            call.reject("clear failed: " + e.getMessage(), e);
        }
    }

    @PluginMethod
    public void keys(PluginCall call) {
        try {
            JSObject o = new JSObject();
            org.json.JSONArray arr = new org.json.JSONArray();
            for (String k : prefs().getAll().keySet()) arr.put(k);
            o.put("keys", arr);
            call.resolve(o);
        } catch (Exception e) {
            call.reject("keys failed: " + e.getMessage(), e);
        }
    }
}
