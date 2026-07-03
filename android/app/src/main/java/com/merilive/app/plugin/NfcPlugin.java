package com.merilive.app.plugin;

import android.app.PendingIntent;
import android.content.Intent;
import android.nfc.NdefMessage;
import android.nfc.NdefRecord;
import android.nfc.NfcAdapter;
import android.nfc.Tag;
import android.nfc.tech.Ndef;
import android.nfc.tech.NdefFormatable;
import android.os.Build;
import android.provider.Settings;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.nio.charset.StandardCharsets;
import java.util.Arrays;

/**
 * Pkg256 — NFC tap-to-share / tap-to-join.
 * Read NDEF tags (room links, profile links), write tags, and push URIs peer-to-peer.
 */
@CapacitorPlugin(name = "Nfc")
public class NfcPlugin extends Plugin {

    private NfcAdapter nfcAdapter;
    private boolean isReading = false;

    @Override
    public void load() {
        nfcAdapter = NfcAdapter.getDefaultAdapter(getContext());
    }

    @PluginMethod
    public void checkAvailable(PluginCall call) {
        JSObject ret = new JSObject();
        boolean hasHardware = nfcAdapter != null;
        ret.put("available", hasHardware);
        ret.put("enabled", hasHardware && nfcAdapter.isEnabled());
        call.resolve(ret);
    }

    @PluginMethod
    public void openSettings(PluginCall call) {
        Intent intent = new Intent(Settings.ACTION_NFC_SETTINGS);
        getContext().startActivity(intent);
        call.resolve();
    }

    /**
     * Enable foreground NDEF dispatch so the app intercepts NFC tags while open.
     */
    @PluginMethod
    public void startRead(PluginCall call) {
        if (nfcAdapter == null) {
            call.reject("NFC_NOT_SUPPORTED");
            return;
        }
        if (!nfcAdapter.isEnabled()) {
            call.reject("NFC_DISABLED");
            return;
        }

        Intent intent = new Intent(getContext(), getActivity().getClass())
                .addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP);
        int flags = Build.VERSION.SDK_INT >= Build.VERSION_CODES.S
                ? (PendingIntent.FLAG_MUTABLE | PendingIntent.FLAG_UPDATE_CURRENT)
                : PendingIntent.FLAG_UPDATE_CURRENT;
        PendingIntent pi = PendingIntent.getActivity(getContext(), 0, intent, flags);

        nfcAdapter.enableForegroundDispatch(getActivity(), pi, null, null);
        isReading = true;
        call.resolve();
    }

    @PluginMethod
    public void stopRead(PluginCall call) {
        if (nfcAdapter != null && isReading) {
            nfcAdapter.disableForegroundDispatch(getActivity());
            isReading = false;
        }
        call.resolve();
    }

    /**
     * Write an NDEF URI or text record to an NFC tag.
     * The JS side should call this, then the user taps a tag.
     * We store the pending write payload and process it on next tag discovery.
     */
    private byte[] pendingWritePayload = null;
    private String pendingWriteType = null;

    @PluginMethod
    public void writeTag(PluginCall call) {
        String uri = call.getString("uri");
        String text = call.getString("text");
        if (uri == null && text == null) {
            call.reject("MISSING_PAYLOAD", "Provide uri or text");
            return;
        }
        if (nfcAdapter == null) {
            call.reject("NFC_NOT_SUPPORTED");
            return;
        }
        if (!nfcAdapter.isEnabled()) {
            call.reject("NFC_DISABLED");
            return;
        }

        if (uri != null) {
            NdefRecord record = NdefRecord.createUri(uri);
            NdefMessage msg = new NdefMessage(new NdefRecord[]{record});
            pendingWritePayload = msg.toByteArray();
            pendingWriteType = "uri";
        } else {
            NdefRecord record = createTextRecord(text);
            NdefMessage msg = new NdefMessage(new NdefRecord[]{record});
            pendingWritePayload = msg.toByteArray();
            pendingWriteType = "text";
        }

        // Start foreground dispatch so we can catch the next tag tap
        Intent intent = new Intent(getContext(), getActivity().getClass())
                .addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP);
        int flags = Build.VERSION.SDK_INT >= Build.VERSION_CODES.S
                ? (PendingIntent.FLAG_MUTABLE | PendingIntent.FLAG_UPDATE_CURRENT)
                : PendingIntent.FLAG_UPDATE_CURRENT;
        PendingIntent pi = PendingIntent.getActivity(getContext(), 0, intent, flags);
        nfcAdapter.enableForegroundDispatch(getActivity(), pi, null, null);
        isReading = true;

        call.resolve();
    }

    @PluginMethod
    public void cancelWrite(PluginCall call) {
        pendingWritePayload = null;
        pendingWriteType = null;
        if (nfcAdapter != null && isReading) {
            nfcAdapter.disableForegroundDispatch(getActivity());
            isReading = false;
        }
        call.resolve();
    }

    /**
     * Set an NDEF push message for Android Beam / peer-to-peer sharing.
     * When two devices tap, this message is transferred.
     * Note: NDEF push is removed on Android 14+ (API 34), but still works on older devices.
     */
    @PluginMethod
    public void pushUri(PluginCall call) {
        String uri = call.getString("uri");
        if (uri == null) {
            call.reject("MISSING_URI");
            return;
        }
        if (nfcAdapter == null) {
            call.reject("NFC_NOT_SUPPORTED");
            return;
        }
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
            call.reject("NOT_SUPPORTED_ON_ANDROID_14_PLUS", "NDEF push removed in Android 14. Use share sheet instead.");
            return;
        }

        NdefRecord record = NdefRecord.createUri(uri);
        NdefMessage msg = new NdefMessage(new NdefRecord[]{record});
        nfcAdapter.setNdefPushMessage(msg, getActivity());
        call.resolve();
    }

    @PluginMethod
    public void stopPush(PluginCall call) {
        if (nfcAdapter != null) {
            nfcAdapter.setNdefPushMessage(null, getActivity());
        }
        call.resolve();
    }

    @Override
    protected void handleOnNewIntent(Intent intent) {
        super.handleOnNewIntent(intent);
        if (intent == null) return;
        String action = intent.getAction();
        if (action == null) return;

        if (NfcAdapter.ACTION_NDEF_DISCOVERED.equals(action)
                || NfcAdapter.ACTION_TAG_DISCOVERED.equals(action)
                || NfcAdapter.ACTION_TECH_DISCOVERED.equals(action)) {
            Tag tag = intent.getParcelableExtra(NfcAdapter.EXTRA_TAG);
            if (tag == null) return;

            if (pendingWritePayload != null) {
                performWrite(tag, pendingWritePayload);
                return;
            }

            readTag(tag);
        }
    }

    @Override
    protected void handleOnPause() {
        super.handleOnPause();
        if (nfcAdapter != null && isReading) {
            nfcAdapter.disableForegroundDispatch(getActivity());
        }
    }

    @Override
    protected void handleOnResume() {
        super.handleOnResume();
        if (nfcAdapter != null && isReading) {
            Intent intent = new Intent(getContext(), getActivity().getClass())
                    .addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP);
            int flags = Build.VERSION.SDK_INT >= Build.VERSION_CODES.S
                    ? (PendingIntent.FLAG_MUTABLE | PendingIntent.FLAG_UPDATE_CURRENT)
                    : PendingIntent.FLAG_UPDATE_CURRENT;
            PendingIntent pi = PendingIntent.getActivity(getContext(), 0, intent, flags);
            nfcAdapter.enableForegroundDispatch(getActivity(), pi, null, null);
        }
    }

    private void readTag(Tag tag) {
        Ndef ndef = Ndef.get(tag);
        if (ndef == null) {
            notifyEvent("nfcTagRead", buildTagResult(tag, null, null));
            return;
        }
        try {
            ndef.connect();
            NdefMessage msg = ndef.getNdefMessage();
            ndef.close();
            JSObject result = parseNdefMessage(msg);
            result.put("id", bytesToHex(tag.getId()));
            result.put("techs", Arrays.toString(tag.getTechList()));
            notifyListeners("nfcTagRead", result, true);
        } catch (Exception e) {
            JSObject err = new JSObject();
            err.put("error", e.getMessage());
            err.put("id", bytesToHex(tag.getId()));
            notifyListeners("nfcTagRead", err, true);
        }
    }

    private JSObject parseNdefMessage(NdefMessage msg) {
        JSObject result = new JSObject();
        if (msg == null) {
            result.put("empty", true);
            return result;
        }
        for (NdefRecord record : msg.getRecords()) {
            if (record.getTnf() == NdefRecord.TNF_WELL_KNOWN
                    && Arrays.equals(record.getType(), NdefRecord.RTD_URI)) {
                byte[] payload = record.getPayload();
                if (payload.length > 0) {
                    String uri = parseUriRecord(payload);
                    result.put("uri", uri);
                }
            } else if (record.getTnf() == NdefRecord.TNF_WELL_KNOWN
                    && Arrays.equals(record.getType(), NdefRecord.RTD_TEXT)) {
                String text = parseTextRecord(record.getPayload());
                result.put("text", text);
            }
        }
        return result;
    }

    private String parseUriRecord(byte[] payload) {
        int prefixCode = payload[0] & 0xFF;
        String[] prefixes = new String[]{
                "", "http://www.", "https://www.", "http://", "https://",
                "tel:", "mailto:", "ftp://anonymous:anonymous@", "ftp://ftp.",
                "ftps://", "sftp://", "smb://", "nfs://", "ftp://", "dav://",
                "news:", "telnet://", "imap:", "rtsp://", "urn:", "pop:", "sip:",
                "sips:", "tftp:", "btspp://", "btl2cap://", "btgoep://",
                "tcpobex://", "irdaobex://", "file://", "urn:epc:id:",
                "urn:epc:tag:", "urn:epc:pat:", "urn:epc:raw:", "urn:epc:",
                "urn:nfc:"
        };
        String prefix = (prefixCode < prefixes.length) ? prefixes[prefixCode] : "";
        String suffix = new String(payload, 1, payload.length - 1, StandardCharsets.UTF_8);
        return prefix + suffix;
    }

    private String parseTextRecord(byte[] payload) {
        if (payload.length == 0) return "";
        byte statusByte = payload[0];
        boolean isUtf16 = ((statusByte & 0x80) != 0);
        int languageCodeLength = statusByte & 0x3F;
        String text = new String(payload, 1 + languageCodeLength,
                payload.length - 1 - languageCodeLength,
                isUtf16 ? StandardCharsets.UTF_16 : StandardCharsets.UTF_8);
        return text;
    }

    private NdefRecord createTextRecord(String text) {
        byte[] langBytes = "en".getBytes(StandardCharsets.US_ASCII);
        byte[] textBytes = text.getBytes(StandardCharsets.UTF_8);
        byte[] payload = new byte[1 + langBytes.length + textBytes.length];
        payload[0] = (byte) langBytes.length;
        System.arraycopy(langBytes, 0, payload, 1, langBytes.length);
        System.arraycopy(textBytes, 0, payload, 1 + langBytes.length, textBytes.length);
        return new NdefRecord(NdefRecord.TNF_WELL_KNOWN, NdefRecord.RTD_TEXT, new byte[0], payload);
    }

    private void performWrite(Tag tag, byte[] payload) {
        NdefMessage msg = new NdefMessage(payload);
        JSObject result = new JSObject();
        try {
            Ndef ndef = Ndef.get(tag);
            if (ndef != null) {
                try {
                    ndef.connect();
                    if (ndef.isWritable()) {
                        ndef.writeNdefMessage(msg);
                        result.put("success", true);
                    } else {
                        result.put("success", false);
                        result.put("error", "Tag is read-only");
                    }
                } finally {
                    try { ndef.close(); } catch (Exception ignored) {}
                }
            } else {
                NdefFormatable formatable = NdefFormatable.get(tag);
                if (formatable != null) {
                    try {
                        formatable.connect();
                        formatable.format(msg);
                        result.put("success", true);
                    } finally {
                        try { formatable.close(); } catch (Exception ignored) {}
                    }
                } else {
                    result.put("success", false);
                    result.put("error", "Tag does not support NDEF");
                }
            }
        } catch (Exception e) {
            result.put("success", false);
            result.put("error", e.getMessage());
        }
        result.put("type", pendingWriteType);
        pendingWritePayload = null;
        pendingWriteType = null;
        notifyListeners("nfcWriteResult", result, true);
    }

    @Override
    protected void handleOnDestroy() {
        if (nfcAdapter != null && isReading) {
            try { nfcAdapter.disableForegroundDispatch(getActivity()); } catch (Throwable ignored) {}
            isReading = false;
        }
        pendingWritePayload = null;
        pendingWriteType = null;
        super.handleOnDestroy();
    }

    private JSObject buildTagResult(Tag tag, NdefMessage msg, String error) {
        JSObject result = new JSObject();
        result.put("id", bytesToHex(tag.getId()));
        result.put("techs", Arrays.toString(tag.getTechList()));
        if (error != null) result.put("error", error);
        if (msg != null) {
            JSObject parsed = parseNdefMessage(msg);
            result.put("records", parsed);
        }
        return result;
    }

    private static String bytesToHex(byte[] bytes) {
        if (bytes == null) return "";
        StringBuilder sb = new StringBuilder();
        for (byte b : bytes) {
            sb.append(String.format("%02x", b));
        }
        return sb.toString();
    }
}
