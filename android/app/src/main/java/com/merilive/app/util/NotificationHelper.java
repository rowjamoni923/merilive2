package com.merilive.app.util;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.graphics.Color;
import android.media.AudioAttributes;
import android.media.RingtoneManager;
import android.net.Uri;
import android.os.Build;
import androidx.core.app.NotificationCompat;
import androidx.core.app.NotificationManagerCompat;
import com.merilive.app.MainActivity;
import com.merilive.app.R;

public class NotificationHelper {

    public static final String CHANNEL_CALLS = "merilive_calls";
    public static final String CHANNEL_MESSAGES = "merilive_messages";
    public static final String CHANNEL_GIFTS = "merilive_gifts";
    public static final String CHANNEL_LIVE = "merilive_live";
    public static final String CHANNEL_SYSTEM = "merilive_system";
    public static final String CHANNEL_DEFAULT = "merilive_default";

    public static final int NOTIFICATION_CALL = 1001;
    public static final int NOTIFICATION_MESSAGE = 2001;
    public static final int NOTIFICATION_GIFT = 3001;
    public static final int NOTIFICATION_LIVE = 4001;
    public static final int NOTIFICATION_SYSTEM = 5001;

    /** Pkg202 — brand accent shown as background tint on lockscreen heads-up + as the
     *  small-icon tint. Matches MeriLive primary (hot pink/red). */
    public static final int BRAND_COLOR = 0xFFE91E63;

    /** Pkg202 — notification group keys (WhatsApp-style stacked notifications). */
    public static final String GROUP_MESSAGES = "merilive_group_messages";
    public static final String GROUP_GIFTS = "merilive_group_gifts";
    public static final String GROUP_LIVE = "merilive_group_live";
    public static final int SUMMARY_MESSAGES = 2000;
    public static final int SUMMARY_GIFTS = 3000;
    public static final int SUMMARY_LIVE = 4000;

    public static void createNotificationChannels(Context context) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return;

        NotificationManager manager = context.getSystemService(NotificationManager.class);
        if (manager == null) return;

        Uri defaultSound = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_NOTIFICATION);
        Uri ringtoneSound = RingtoneManager.getDefaultUri(RingtoneManager.TYPE_RINGTONE);

        AudioAttributes audioAttrs = new AudioAttributes.Builder()
            .setUsage(AudioAttributes.USAGE_NOTIFICATION)
            .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
            .build();

        AudioAttributes callAudioAttrs = new AudioAttributes.Builder()
            .setUsage(AudioAttributes.USAGE_NOTIFICATION_RINGTONE)
            .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
            .build();

        // 1. CALLS - HIGH priority, bypass DND
        NotificationChannel callChannel = new NotificationChannel(
            CHANNEL_CALLS, "Incoming Calls", NotificationManager.IMPORTANCE_HIGH);
        callChannel.setDescription("Incoming video and audio call alerts");
        callChannel.setSound(ringtoneSound, callAudioAttrs);
        callChannel.enableVibration(true);
        callChannel.setVibrationPattern(new long[]{0, 1000, 500, 1000, 500, 1000});
        callChannel.enableLights(true);
        callChannel.setLightColor(Color.GREEN);
        callChannel.setLockscreenVisibility(Notification.VISIBILITY_PUBLIC);
        callChannel.setBypassDnd(true);
        manager.createNotificationChannel(callChannel);

        // 2. MESSAGES - HIGH
        NotificationChannel msgChannel = new NotificationChannel(
            CHANNEL_MESSAGES, "Messages", NotificationManager.IMPORTANCE_HIGH);
        msgChannel.setDescription("Chat and direct message notifications");
        msgChannel.setSound(defaultSound, audioAttrs);
        msgChannel.enableVibration(true);
        msgChannel.setVibrationPattern(new long[]{0, 300, 200, 300});
        msgChannel.enableLights(true);
        msgChannel.setLightColor(Color.BLUE);
        msgChannel.setLockscreenVisibility(Notification.VISIBILITY_PRIVATE);
        manager.createNotificationChannel(msgChannel);

        // 3. GIFTS - DEFAULT
        NotificationChannel giftChannel = new NotificationChannel(
            CHANNEL_GIFTS, "Gifts", NotificationManager.IMPORTANCE_DEFAULT);
        giftChannel.setDescription("Gift received and reward notifications");
        giftChannel.setSound(defaultSound, audioAttrs);
        giftChannel.enableVibration(true);
        giftChannel.enableLights(true);
        giftChannel.setLightColor(Color.YELLOW);
        manager.createNotificationChannel(giftChannel);

        // 4. LIVE - DEFAULT
        NotificationChannel liveChannel = new NotificationChannel(
            CHANNEL_LIVE, "Live Streams", NotificationManager.IMPORTANCE_DEFAULT);
        liveChannel.setDescription("Live stream start and follow notifications");
        liveChannel.setSound(defaultSound, audioAttrs);
        liveChannel.enableVibration(true);
        liveChannel.enableLights(true);
        liveChannel.setLightColor(Color.RED);
        manager.createNotificationChannel(liveChannel);

        // 5. SYSTEM - LOW
        NotificationChannel sysChannel = new NotificationChannel(
            CHANNEL_SYSTEM, "System", NotificationManager.IMPORTANCE_LOW);
        sysChannel.setDescription("System updates, maintenance, security alerts");
        sysChannel.setSound(null, null);
        sysChannel.enableVibration(false);
        manager.createNotificationChannel(sysChannel);

        // 6. DEFAULT
        NotificationChannel defChannel = new NotificationChannel(
            CHANNEL_DEFAULT, "General", NotificationManager.IMPORTANCE_DEFAULT);
        defChannel.setDescription("General app notifications");
        defChannel.setSound(defaultSound, audioAttrs);
        defChannel.enableVibration(true);
        manager.createNotificationChannel(defChannel);
    }

    /**
     * Pkg209 — WhatsApp-grade DM notification with inline reply
     * (RemoteInput) + Mark-as-read action + MessagingStyle.
     * Backwards-compatible 5-arg overload kept for older callers.
     */
    public static void showMessageNotification(Context context, String title, String body,
                                                String senderId, int notificationId) {
        showMessageNotification(context, title, body, senderId, notificationId,
                "", title, null);
    }

    public static void showMessageNotification(Context context, String title, String body,
                                                String senderId, int notificationId,
                                                String conversationId, String senderName,
                                                String senderAvatarUrl) {
        Intent intent = new Intent(context, MainActivity.class);
        intent.setFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        intent.putExtra("type", "message");
        intent.putExtra("sender_id", senderId);
        intent.putExtra("conversation_id", conversationId == null ? "" : conversationId);

        PendingIntent pendingIntent = PendingIntent.getActivity(
            context, notificationId, intent,
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);

        // ---- Pkg209 — MessagingStyle ----------------------------------
        androidx.core.app.Person me = new androidx.core.app.Person.Builder()
            .setName("You").setKey("me").build();
        androidx.core.app.Person other = new androidx.core.app.Person.Builder()
            .setName(senderName == null || senderName.isEmpty() ? title : senderName)
            .setKey(senderId == null ? "" : senderId)
            .build();
        NotificationCompat.MessagingStyle style = new NotificationCompat.MessagingStyle(me)
            .addMessage(body, System.currentTimeMillis(), other);

        // ---- Pkg209 — Inline Reply (RemoteInput) -----------------------
        // Pkg234 — M28 Wear OS companion: setChoices() surfaces canned replies as
        // tappable chips on Wear OS notifications (also used by Android Auto +
        // some launchers). Default-bridging (no setLocalOnly) means this
        // notification mirrors to paired watches automatically.
        androidx.core.app.RemoteInput remoteInput =
            new androidx.core.app.RemoteInput.Builder(
                com.merilive.app.receiver.MessageActionReceiver.KEY_REPLY_TEXT)
                .setLabel("Reply")
                .setChoices(new CharSequence[] {
                    "👍", "❤️", "OK", "Thanks!", "On my way", "Call you later"
                })
                .setAllowFreeFormInput(true)
                .build();

        Intent replyIntent = new Intent(context,
                com.merilive.app.receiver.MessageActionReceiver.class);
        replyIntent.setAction(com.merilive.app.receiver.MessageActionReceiver.ACTION_REPLY);
        replyIntent.putExtra("conversation_id", conversationId);
        replyIntent.putExtra("sender_id", senderId);
        replyIntent.putExtra("sender_name", senderName);
        replyIntent.putExtra("sender_avatar", senderAvatarUrl);
        replyIntent.putExtra("notif_id", notificationId);
        // FLAG_MUTABLE required so RemoteInput can attach the typed text.
        PendingIntent replyPI = PendingIntent.getBroadcast(
            context, ("reply:" + notificationId).hashCode(), replyIntent,
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_MUTABLE);

        // Pkg234 — Wear OS hint: render reply action inline on the watch
        // face so the user can tap once to dictate / pick a canned reply.
        NotificationCompat.Action.WearableExtender replyWear =
            new NotificationCompat.Action.WearableExtender()
                .setHintDisplayActionInline(true)
                .setHintLaunchesActivity(false);

        NotificationCompat.Action replyAction = new NotificationCompat.Action.Builder(
                R.drawable.ic_notification, "Reply", replyPI)
            .addRemoteInput(remoteInput)
            .setAllowGeneratedReplies(true)
            .setSemanticAction(NotificationCompat.Action.SEMANTIC_ACTION_REPLY)
            .setShowsUserInterface(false)
            .extend(replyWear)
            .build();


        // ---- Pkg209 — Mark as Read action ------------------------------
        Intent readIntent = new Intent(context,
                com.merilive.app.receiver.MessageActionReceiver.class);
        readIntent.setAction(com.merilive.app.receiver.MessageActionReceiver.ACTION_MARK_READ);
        readIntent.putExtra("conversation_id", conversationId);
        readIntent.putExtra("sender_id", senderId);
        readIntent.putExtra("notif_id", notificationId);
        PendingIntent readPI = PendingIntent.getBroadcast(
            context, ("read:" + notificationId).hashCode(), readIntent,
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);

        NotificationCompat.Action readAction = new NotificationCompat.Action.Builder(
                R.drawable.ic_notification, "Mark read", readPI)
            .setSemanticAction(NotificationCompat.Action.SEMANTIC_ACTION_MARK_AS_READ)
            .setShowsUserInterface(false)
            .build();

        NotificationCompat.Builder builder = new NotificationCompat.Builder(context, CHANNEL_MESSAGES)
            .setSmallIcon(R.drawable.ic_notification)
            .setColor(BRAND_COLOR)
            .setStyle(style)
            .setShortcutId(conversationId == null ? "" : conversationId)
            .setAutoCancel(true)
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .setCategory(NotificationCompat.CATEGORY_MESSAGE)
            .setVisibility(NotificationCompat.VISIBILITY_PRIVATE)
            .setGroup(GROUP_MESSAGES)
            .setContentIntent(pendingIntent)
            .setOnlyAlertOnce(false)
            .setDefaults(NotificationCompat.DEFAULT_ALL)
            // Pkg234 — explicit WearableExtender on the notification so paired
            // Wear OS watches treat MeriLive DMs as a first-class messaging
            // notification (bridged by default — setLocalOnly NEVER set).
            .extend(new NotificationCompat.WearableExtender()
                .setHintContentIntentLaunchesActivity(true)
                .setBridgeTag("merilive_message"))
            .addAction(replyAction)
            .addAction(readAction);

        try {
            NotificationManagerCompat.from(context).notify(notificationId, builder.build());
        } catch (SecurityException ignored) {
            return;
        }

        // Pkg202 — WhatsApp-style group summary so multiple messages stack
        // into one collapsible bundle on Android 7+ instead of spamming the shade.
        NotificationCompat.Builder summary = new NotificationCompat.Builder(context, CHANNEL_MESSAGES)
            .setSmallIcon(R.drawable.ic_notification)
            .setColor(BRAND_COLOR)
            .setContentTitle("New messages")
            .setContentText(title)
            .setStyle(new NotificationCompat.InboxStyle()
                .setSummaryText("MeriLive")
                .setBigContentTitle("New messages"))
            .setGroup(GROUP_MESSAGES)
            .setGroupSummary(true)
            .setAutoCancel(true)
            .setCategory(NotificationCompat.CATEGORY_MESSAGE)
            .setContentIntent(pendingIntent);
        try {
            NotificationManagerCompat.from(context).notify(SUMMARY_MESSAGES, summary.build());
        } catch (SecurityException ignored) {}
    }


    public static void showGiftNotification(Context context, String senderName,
                                             String giftName, int giftValue) {
        Intent intent = new Intent(context, MainActivity.class);
        intent.setFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        intent.putExtra("type", "gift");

        PendingIntent pendingIntent = PendingIntent.getActivity(
            context, NOTIFICATION_GIFT, intent,
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);

        String body = senderName + " sent you " + giftName + " 🎁 (+" + giftValue + " beans)";

        NotificationCompat.Builder builder = new NotificationCompat.Builder(context, CHANNEL_GIFTS)
            .setSmallIcon(R.drawable.ic_notification)
            .setColor(BRAND_COLOR)
            .setContentTitle("Gift Received! 🎁")
            .setContentText(body)
            .setAutoCancel(true)
            .setPriority(NotificationCompat.PRIORITY_DEFAULT)
            .setCategory(NotificationCompat.CATEGORY_SOCIAL)
            .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
            .setGroup(GROUP_GIFTS)
            .setStyle(new NotificationCompat.BigTextStyle().bigText(body))
            .setContentIntent(pendingIntent);

        NotificationManagerCompat.from(context).notify(NOTIFICATION_GIFT, builder.build());
    }

    public static void showLiveNotification(Context context, String hostName, String roomId) {
        Intent intent = new Intent(context, MainActivity.class);
        intent.setFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        intent.putExtra("type", "live");
        intent.putExtra("room_id", roomId);

        PendingIntent pendingIntent = PendingIntent.getActivity(
            context, NOTIFICATION_LIVE, intent,
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);

        NotificationCompat.Builder builder = new NotificationCompat.Builder(context, CHANNEL_LIVE)
            .setSmallIcon(R.drawable.ic_notification)
            .setColor(BRAND_COLOR)
            .setContentTitle(hostName + " is now LIVE! 🔴")
            .setContentText("Tap to join the live stream")
            .setAutoCancel(true)
            .setPriority(NotificationCompat.PRIORITY_DEFAULT)
            .setCategory(NotificationCompat.CATEGORY_SOCIAL)
            .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
            .setGroup(GROUP_LIVE)
            .setContentIntent(pendingIntent);

        NotificationManagerCompat.from(context).notify(NOTIFICATION_LIVE, builder.build());
    }
}
