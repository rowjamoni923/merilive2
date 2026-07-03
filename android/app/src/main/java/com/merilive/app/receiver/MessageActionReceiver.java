package com.merilive.app.receiver;

import android.app.NotificationManager;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.os.Bundle;
import android.util.Log;

import androidx.core.app.NotificationCompat;
import androidx.core.app.NotificationManagerCompat;
import androidx.core.app.Person;
import androidx.core.app.RemoteInput;

import com.merilive.app.MainActivity;
import com.merilive.app.R;
import com.merilive.app.plugin.NativeMessageReplyPlugin;
import com.merilive.app.util.NotificationHelper;

import org.json.JSONArray;
import org.json.JSONObject;

/**
 * Pkg209 — DM notification action receiver.
 *
 * Handles two notification actions added in
 * NotificationHelper.showMessageNotification:
 *
 *   ACTION_REPLY   — RemoteInput inline reply (WhatsApp-style "Reply" chip).
 *                    Captures the typed text, queues it in SharedPreferences,
 *                    notifies the JS layer (if running), and updates the
 *                    notification's MessagingStyle so the user sees their
 *                    sent message inline without re-opening the app.
 *
 *   ACTION_MARK_READ — Single tap dismisses the notification + queues a
 *                    read-receipt for the conversation. The JS layer
 *                    drains the queue on next app resume and writes
 *                    `last_read_at` via the Supabase client (RLS-safe).
 *
 * Auth model: the receiver NEVER touches network. It queues structured
 * payloads in `meri_msg_actions` SharedPreferences. The
 * NativeMessageReplyPlugin emits a `message-action` event in real time
 * (when JS is attached) AND a `drainPending()` method that the JS layer
 * calls on app boot / foreground resume to flush leftover queued
 * actions. The actual `messages` insert and `read_receipt` update run
 * through the already-authenticated Supabase client.
 */
public class MessageActionReceiver extends BroadcastReceiver {

    public static final String ACTION_REPLY = "com.merilive.app.MSG_REPLY";
    public static final String ACTION_MARK_READ = "com.merilive.app.MSG_MARK_READ";
    public static final String KEY_REPLY_TEXT = "reply_text";

    private static final String TAG = "MessageActionReceiver";
    private static final String PREFS = "meri_msg_actions";
    private static final String QUEUE_KEY = "pending_queue";
    private static final int MAX_QUEUE = 64;

    @Override
    public void onReceive(Context context, Intent intent) {
        if (intent == null || intent.getAction() == null) return;
        String action = intent.getAction();

        String conversationId = intent.getStringExtra("conversation_id");
        String senderId = intent.getStringExtra("sender_id");
        String senderName = intent.getStringExtra("sender_name");
        String senderAvatar = intent.getStringExtra("sender_avatar");
        int notifId = intent.getIntExtra("notif_id", NotificationHelper.NOTIFICATION_MESSAGE);

        if (ACTION_REPLY.equals(action)) {
            CharSequence typed = extractReplyText(intent);
            if (typed == null || typed.toString().trim().isEmpty()) return;
            String body = typed.toString().trim();

            queueAction(context, "reply", conversationId, senderId, body);
            updateReplyNotification(context, notifId, conversationId, senderId,
                    senderName, senderAvatar, body);
            NativeMessageReplyPlugin.dispatch(context, "reply", conversationId, senderId, body);
            return;
        }

        if (ACTION_MARK_READ.equals(action)) {
            queueAction(context, "mark_read", conversationId, senderId, "");
            try {
                NotificationManagerCompat.from(context).cancel(notifId);
            } catch (Throwable t) {
                Log.w(TAG, "cancel mark-read failed: " + t.getMessage());
            }
            NativeMessageReplyPlugin.dispatch(context, "mark_read", conversationId, senderId, "");
        }
    }

    private static CharSequence extractReplyText(Intent intent) {
        Bundle remote = RemoteInput.getResultsFromIntent(intent);
        return remote != null ? remote.getCharSequence(KEY_REPLY_TEXT) : null;
    }

    /**
     * Append the action to the SharedPreferences queue. Bounded at
     * MAX_QUEUE so a long-offline session can't OOM the prefs blob.
     */
    private static synchronized void queueAction(Context ctx, String type,
                                                 String convId, String senderId, String body) {
        try {
            SharedPreferences sp = ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
            String raw = sp.getString(QUEUE_KEY, "[]");
            JSONArray arr;
            try { arr = new JSONArray(raw); } catch (Throwable t) { arr = new JSONArray(); }

            JSONObject entry = new JSONObject();
            entry.put("type", type);
            entry.put("conversationId", convId == null ? "" : convId);
            entry.put("senderId", senderId == null ? "" : senderId);
            entry.put("body", body == null ? "" : body);
            entry.put("ts", System.currentTimeMillis());
            arr.put(entry);

            while (arr.length() > MAX_QUEUE) arr.remove(0);
            sp.edit().putString(QUEUE_KEY, arr.toString()).apply();
        } catch (Throwable t) {
            Log.w(TAG, "queueAction failed: " + t.getMessage());
        }
    }

    /** Drain helper exposed to the plugin. Caller owns transaction. */
    public static synchronized JSONArray drainQueue(Context ctx) {
        SharedPreferences sp = ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
        String raw = sp.getString(QUEUE_KEY, "[]");
        sp.edit().remove(QUEUE_KEY).apply();
        try { return new JSONArray(raw); } catch (Throwable t) { return new JSONArray(); }
    }

    /**
     * Rebuild the MessagingStyle notification with the user's just-sent
     * reply appended so the shade reflects the action instantly — even
     * if the app process is still cold. The actual durable send happens
     * once JS drains the queue.
     */
    private static void updateReplyNotification(Context ctx, int notifId,
                                                String conversationId, String senderId,
                                                String senderName, String senderAvatar,
                                                String replyBody) {
        try {
            Person me = new Person.Builder().setName("You").setKey("me").build();
            Person other = new Person.Builder()
                .setName(senderName == null || senderName.isEmpty() ? "Friend" : senderName)
                .setKey(senderId == null ? "" : senderId)
                .build();

            NotificationCompat.MessagingStyle style =
                new NotificationCompat.MessagingStyle(me);
            // Show the just-sent reply so the user gets immediate feedback.
            style.addMessage(replyBody, System.currentTimeMillis(), me);

            Intent contentIntent = new Intent(ctx, MainActivity.class);
            contentIntent.setFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP | Intent.FLAG_ACTIVITY_SINGLE_TOP);
            contentIntent.putExtra("type", "message");
            contentIntent.putExtra("conversation_id", conversationId);
            contentIntent.putExtra("sender_id", senderId);
            android.app.PendingIntent contentPI = android.app.PendingIntent.getActivity(
                ctx, notifId, contentIntent,
                android.app.PendingIntent.FLAG_UPDATE_CURRENT | android.app.PendingIntent.FLAG_IMMUTABLE);

            NotificationCompat.Builder builder = new NotificationCompat.Builder(ctx,
                    NotificationHelper.CHANNEL_MESSAGES)
                .setSmallIcon(R.drawable.ic_notification)
                .setColor(NotificationHelper.BRAND_COLOR)
                .setStyle(style)
                .setShortcutId(conversationId == null ? "" : conversationId)
                .setCategory(NotificationCompat.CATEGORY_MESSAGE)
                .setOnlyAlertOnce(true)
                .setAutoCancel(true)
                .setContentIntent(contentPI)
                .setGroup(NotificationHelper.GROUP_MESSAGES);

            NotificationManagerCompat.from(ctx).notify(notifId, builder.build());
        } catch (SecurityException ignored) {
        } catch (Throwable t) {
            Log.w(TAG, "updateReplyNotification failed: " + t.getMessage());
        }
    }
}
