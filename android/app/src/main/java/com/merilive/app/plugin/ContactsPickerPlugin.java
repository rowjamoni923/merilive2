package com.merilive.app.plugin;

import android.app.Activity;
import android.content.Intent;
import android.database.Cursor;
import android.net.Uri;
import android.provider.ContactsContract;

import androidx.activity.result.ActivityResult;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.ActivityCallback;
import com.getcapacitor.annotation.CapacitorPlugin;

/**
 * Pkg264 — Contacts picker (permission-free).
 *
 * Uses ACTION_PICK against ContactsContract.CommonDataKinds.Phone.CONTENT_URI
 * so the system contacts UI returns ONE contact at a time. Because the user
 * explicitly picked the record, the app gets read access to that single row
 * WITHOUT needing the runtime READ_CONTACTS permission.
 *
 * Use case: "Invite a friend" flow → user picks contact → app pre-fills SMS
 * or WhatsApp share intent with an install/referral link.
 */
@CapacitorPlugin(name = "ContactsPicker")
public class ContactsPickerPlugin extends Plugin {

    @PluginMethod
    public void pickContact(PluginCall call) {
        try {
            Intent intent = new Intent(Intent.ACTION_PICK, ContactsContract.CommonDataKinds.Phone.CONTENT_URI);
            startActivityForResult(call, intent, "onPickResult");
        } catch (Throwable t) {
            call.reject("pickContact failed: " + t.getMessage(), t);
        }
    }

    @ActivityCallback
    private void onPickResult(PluginCall call, ActivityResult result) {
        if (call == null) return;
        if (result.getResultCode() != Activity.RESULT_OK || result.getData() == null) {
            JSObject ret = new JSObject();
            ret.put("cancelled", true);
            call.resolve(ret);
            return;
        }
        Uri contactUri = result.getData().getData();
        if (contactUri == null) {
            JSObject ret = new JSObject();
            ret.put("cancelled", true);
            call.resolve(ret);
            return;
        }

        String[] projection = new String[] {
            ContactsContract.CommonDataKinds.Phone.DISPLAY_NAME,
            ContactsContract.CommonDataKinds.Phone.NUMBER,
        };
        Cursor cursor = null;
        try {
            cursor = getContext().getContentResolver().query(contactUri, projection, null, null, null);
            if (cursor != null && cursor.moveToFirst()) {
                int nameIdx = cursor.getColumnIndex(ContactsContract.CommonDataKinds.Phone.DISPLAY_NAME);
                int numIdx = cursor.getColumnIndex(ContactsContract.CommonDataKinds.Phone.NUMBER);
                String name = nameIdx >= 0 ? cursor.getString(nameIdx) : null;
                String number = numIdx >= 0 ? cursor.getString(numIdx) : null;

                JSObject ret = new JSObject();
                ret.put("cancelled", false);
                ret.put("name", name == null ? "" : name);
                ret.put("phone", number == null ? "" : number);
                call.resolve(ret);
                return;
            }
            JSObject ret = new JSObject();
            ret.put("cancelled", true);
            call.resolve(ret);
        } catch (Throwable t) {
            call.reject("read contact failed: " + t.getMessage(), t);
        } finally {
            if (cursor != null) cursor.close();
        }
    }
}
