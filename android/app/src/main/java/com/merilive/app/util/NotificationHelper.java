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

    public static void showMessageNotification(Context context, String title, String body,
                                                String senderId, int notificationId) {
        Intent intent = new Intent(context, MainActivity.class);
        intent.setFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        intent.putExtra("type", "message");
        intent.putExtra("sender_id", senderId);

        PendingIntent pendingIntent = PendingIntent.getActivity(
            context, notificationId, intent,
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);

        NotificationCompat.Builder builder = new NotificationCompat.Builder(context, CHANNEL_MESSAGES)
            .setSmallIcon(R.drawable.ic_notification)
            .setColor(BRAND_COLOR)
            .setContentTitle(title)
            .setContentText(body)
            .setAutoCancel(true)
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .setCategory(NotificationCompat.CATEGORY_MESSAGE)
            .setVisibility(NotificationCompat.VISIBILITY_PRIVATE)
            .setGroup(GROUP_MESSAGES)
            .setStyle(new NotificationCompat.BigTextStyle().bigText(body))
            .setContentIntent(pendingIntent)
            .setDefaults(NotificationCompat.DEFAULT_ALL);

        NotificationManagerCompat.from(context).notify(notificationId, builder.build());

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
        NotificationManagerCompat.from(context).notify(SUMMARY_MESSAGES, summary.build());
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
