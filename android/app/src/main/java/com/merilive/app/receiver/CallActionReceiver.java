package com.merilive.app.receiver;

import android.app.NotificationManager;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import com.merilive.app.MainActivity;
import com.merilive.app.plugin.NativeCallPlugin;
import com.merilive.app.service.CallForegroundService;
import com.merilive.app.util.NotificationHelper;

/**
 * Step 31 — handles Accept / Decline tapped directly from the heads-up
 * notification (without going through IncomingCallActivity). Forwards
 * the action into the JS layer via NativeCallPlugin and dismisses the
 * notification + stops the foreground call service.
 */
public class CallActionReceiver extends BroadcastReceiver {

    // Pkg-audit Tier-3: package-qualified action strings prevent intra-process
    // collisions with libraries/modules that may broadcast bare "ACCEPT_CALL"
    // intents. All references go through these constants, so changing the
    // values is sufficient.
    public static final String ACTION_ACCEPT = "com.merilive.app.ACCEPT_CALL";
    public static final String ACTION_DECLINE = "com.merilive.app.DECLINE_CALL";

    @Override
    public void onReceive(Context context, Intent intent) {
        if (context == null || intent == null) return;
        String action = intent.getAction();
        if (action == null) return;

        String callId = intent.getStringExtra("call_id");
        String callerId = intent.getStringExtra("caller_id");
        String callerName = intent.getStringExtra("caller_name");
        String callerAvatar = intent.getStringExtra("caller_avatar");
        String callType = intent.getStringExtra("call_type");

        // Always dismiss the heads-up call notification.
        try {
            NotificationManager nm = (NotificationManager)
                context.getSystemService(Context.NOTIFICATION_SERVICE);
            if (nm != null) nm.cancel(NotificationHelper.NOTIFICATION_CALL);
        } catch (Exception ignored) {}

        // Tell IncomingCallActivity (if visible) to finish itself.
        try {
            Intent end = new Intent("com.merilive.app.ACTION_END_INCOMING_UI");
            end.setPackage(context.getPackageName());
            end.putExtra("call_id", callId);
            context.sendBroadcast(end);
        } catch (Exception ignored) {}

        if (ACTION_DECLINE.equals(action)) {
            NativeCallPlugin.dispatch(context, callId, callerId, callerName, callType, "decline");
            // Pkg-audit Tier-12 (High): also tell Telecom this call ended.
            // Without this the self-managed Connection object stays in the
            // ConnectionService map forever — the system call log shows the
            // call as ringing indefinitely AND the BT End button is no-op
            // on the next call because audio focus is stuck.
            try {
                if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.O) {
                    com.merilive.app.telecom.TelecomBridge.reportEnded(callId, false);
                }
            } catch (Throwable ignored) {}
            // Decline does NOT need the call foreground service.
            try {
                Intent stop = new Intent(context, CallForegroundService.class);
                stop.setAction(CallForegroundService.ACTION_STOP);
                context.startService(stop);
            } catch (Exception ignored) {}
        } else if (ACTION_ACCEPT.equals(action)) {
            NativeCallPlugin.dispatch(context, callId, callerId, callerName, callType, "accept");
            // Pkg-audit Tier-12 (High): promote the Telecom Connection to
            // ACTIVE so audio routes correctly (BT > wired > speaker) and
            // the system call log records this as a connected call instead
            // of a missed ring. Safe no-op when no Connection exists yet.
            try {
                if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.O) {
                    com.merilive.app.telecom.TelecomBridge.reportConnected(callId);
                }
            } catch (Throwable ignored) {}

            // Pkg203 — start the call foreground service IMMEDIATELY so Android
            // keeps the process alive while JS boots + connects to LiveKit. Without
            // this the OS may aggressively kill the cold-started app before the JS
            // layer is ready, causing dropped calls on locked-screen accepts.
            try {
                Intent fg = new Intent(context, CallForegroundService.class);
                fg.setAction(CallForegroundService.ACTION_START);
                fg.putExtra("caller_name", callerName);
                fg.putExtra("caller_avatar", callerAvatar);
                fg.putExtra("call_id", callId);
                fg.putExtra("caller_id", callerId);
                fg.putExtra("call_type", "video".equals(callType) ? "Video Call" : "Audio Call");
                if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.O) {
                    context.startForegroundService(fg);
                } else {
                    context.startService(fg);
                }
            } catch (Exception ignored) {}

            // Foreground the app so JS can join the LiveKit room.
            try {
                Intent open = new Intent(context, MainActivity.class);
                open.setFlags(
                    Intent.FLAG_ACTIVITY_NEW_TASK
                    | Intent.FLAG_ACTIVITY_CLEAR_TOP
                    | Intent.FLAG_ACTIVITY_SINGLE_TOP
                    | Intent.FLAG_ACTIVITY_REORDER_TO_FRONT
                );
                open.putExtra("action", "accept_call");
                open.putExtra("open_call", true);
                open.putExtra("call_id", callId);
                open.putExtra("caller_id", callerId);
                open.putExtra("call_type", callType);
                context.startActivity(open);
            } catch (Exception ignored) {}
        }
    }
}
