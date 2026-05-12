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

    public static final String ACTION_ACCEPT = "ACCEPT_CALL";
    public static final String ACTION_DECLINE = "DECLINE_CALL";

    @Override
    public void onReceive(Context context, Intent intent) {
        if (context == null || intent == null) return;
        String action = intent.getAction();
        if (action == null) return;

        String callId = intent.getStringExtra("call_id");
        String callerId = intent.getStringExtra("caller_id");
        String callerName = intent.getStringExtra("caller_name");
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
            // Decline does NOT need the call foreground service.
            try {
                Intent stop = new Intent(context, CallForegroundService.class);
                stop.setAction(CallForegroundService.ACTION_STOP);
                context.startService(stop);
            } catch (Exception ignored) {}
        } else if (ACTION_ACCEPT.equals(action)) {
            NativeCallPlugin.dispatch(context, callId, callerId, callerName, callType, "accept");
            // Foreground the app so JS can join the LiveKit room.
            try {
                Intent open = new Intent(context, MainActivity.class);
                open.setFlags(
                    Intent.FLAG_ACTIVITY_NEW_TASK
                    | Intent.FLAG_ACTIVITY_CLEAR_TOP
                    | Intent.FLAG_ACTIVITY_SINGLE_TOP
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
