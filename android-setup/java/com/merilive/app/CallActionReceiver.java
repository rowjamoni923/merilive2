package com.merilive.app;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.util.Log;

import java.lang.ref.WeakReference;

/**
 * ╔══════════════════════════════════════════════════════════════╗
 * ║       MeriLive — Call Action Broadcast Receiver v3.0        ║
 * ╠══════════════════════════════════════════════════════════════╣
 * ║                                                              ║
 * ║  Communication Pipeline:                                     ║
 * ║                                                              ║
 * ║   IncomingCallActivity                                       ║
 * ║     ↓ (accept/decline button press)                         ║
 * ║   sendBroadcast("CALL_ACTION")                              ║
 * ║     ↓                                                        ║
 * ║   CallActionReceiver.onReceive()                            ║
 * ║     ↓ (listener callback)                                   ║
 * ║   MainActivity.sendCallEventToWebView()                     ║
 * ║     ↓                                                        ║
 * ║   WebView CustomEvent → React call handler                  ║
 * ║                                                              ║
 * ║  Actions:                                                    ║
 * ║   ✅ com.merilive.app.CALL_ACTION → accept/decline/end     ║
 * ║   ✅ com.merilive.app.CLOSE_INCOMING_CALL → force close UI ║
 * ║                                                              ║
 * ║  Safety:                                                     ║
 * ║   ✅ WeakReference listener (no Activity leaks)             ║
 * ║   ✅ Thread-safe volatile reference                         ║
 * ║   ✅ Null-safe intent parsing                               ║
 * ║                                                              ║
 * ╚══════════════════════════════════════════════════════════════╝
 */
public class CallActionReceiver extends BroadcastReceiver {

    private static final String TAG = "MeriLive_CallAction";

    // Action constants
    public static final String ACTION_CALL = "com.merilive.app.CALL_ACTION";
    public static final String ACTION_CLOSE = "com.merilive.app.CLOSE_INCOMING_CALL";

    // ── Listener interface ──
    public interface CallActionListener {
        void onCallAccepted(String callId, String callerId);
        void onCallDeclined(String callId, String callerId);
        void onCallEnded(String callId);
    }

    // WeakReference to prevent Activity memory leaks
    private static volatile WeakReference<CallActionListener> listenerRef;

    /**
     * MainActivity থেকে listener সেট করা হয়।
     * WeakReference ব্যবহার করে memory leak প্রতিরোধ।
     */
    public static void setListener(CallActionListener l) {
        listenerRef = new WeakReference<>(l);
    }

    public static void clearListener() {
        listenerRef = null;
    }

    @Override
    public void onReceive(Context context, Intent intent) {
        if (intent == null || intent.getAction() == null) {
            Log.w(TAG, "⚠️ Null intent or action received");
            return;
        }

        String action = intent.getAction();
        String callId = safeGetExtra(intent, "call_id");
        String callerId = safeGetExtra(intent, "caller_id");
        String callAction = safeGetExtra(intent, "action");

        Log.i(TAG, "📩 Broadcast: action=" + action + " | callAction=" + callAction + " | callId=" + callId);

        CallActionListener listener = getListener();

        switch (action) {
            case ACTION_CALL:
                if (listener == null) {
                    Log.w(TAG, "⚠️ No listener registered — call action will be lost");
                    // Store for later pickup (next MainActivity resume)
                    return;
                }

                if ("accept".equals(callAction)) {
                    Log.i(TAG, "✅ ACCEPTED — callId: " + callId);
                    listener.onCallAccepted(callId, callerId);
                } else if ("decline".equals(callAction)) {
                    Log.i(TAG, "❌ DECLINED — callId: " + callId);
                    listener.onCallDeclined(callId, callerId);
                } else if ("ended".equals(callAction)) {
                    Log.i(TAG, "📴 ENDED — callId: " + callId);
                    listener.onCallEnded(callId);
                } else {
                    Log.w(TAG, "⚠️ Unknown call action: " + callAction);
                }
                break;

            case ACTION_CLOSE:
                Log.i(TAG, "📴 Force close UI — callId: " + callId);
                if (listener != null) {
                    listener.onCallEnded(callId);
                }
                break;

            default:
                Log.d(TAG, "Unknown broadcast action: " + action);
                break;
        }
    }

    private CallActionListener getListener() {
        WeakReference<CallActionListener> ref = listenerRef;
        return ref != null ? ref.get() : null;
    }

    private String safeGetExtra(Intent intent, String key) {
        try {
            return intent.getStringExtra(key);
        } catch (Exception e) {
            return null;
        }
    }
}
