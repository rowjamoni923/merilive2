package com.merilive.app.util;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.graphics.Color;
import android.media.AudioAttributes;
import android.media.RingtoneManager;
import android.net.Uri;
import android.os.Build;
import androidx.core.app.NotificationCompat;
import androidx.core.app.NotificationManagerCompat;
import com.merilive.app.MainActivity;
import com.merilive.app.R;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;

public class NotificationHelper {

    public static final String CHANNEL_CALLS = "merilive_calls";
    public static final String CHANNEL_CALL_SERVICE = "merilive_call_service";
    public static final String CHANNEL_MESSAGES = "merilive_messages";
    public static final String CHANNEL_GIFTS = "merilive_gifts";
    public static final String CHANNEL_LIVE = "merilive_live";
    public static final String CHANNEL_SYSTEM = "merilive_system";
    public static final String CHANNEL_DEFAULT = "merilive_default";
    // Pkg425 Phase-8 — promo / marketing channel (silent-ish, low importance,
    // user can mute it independently without losing chat/call alerts).
    public static final String CHANNEL_PROMO = "merilive_promo";

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
        // Honest-private-call fix (L-9): incoming-call notifications must NEVER
        // be turned into chat bubbles. CallStyle + bubble together produces a
        // duplicate floating call surface on Android 12+ that can't be dismissed
        // without ending the call. Disable at channel level so the OS rejects
        // any bubble attempt regardless of per-notification settings.
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            try { callChannel.setAllowBubbles(false); } catch (Throwable ignored) {}
        }
        manager.createNotificationChannel(callChannel);

        // Active-call foreground-service notification.  Incoming ringing must
        // remain high priority, but an already accepted call must not keep a
        // heads-up/CallStyle chip floating over the React call UI after hangup.
        NotificationChannel activeCallChannel = new NotificationChannel(
            CHANNEL_CALL_SERVICE, "Active Call Service", NotificationManager.IMPORTANCE_LOW);
        activeCallChannel.setDescription("Keeps MeriLive calls running in the background");
        activeCallChannel.setSound(null, null);
        activeCallChannel.enableVibration(false);
        activeCallChannel.enableLights(false);
        activeCallChannel.setLockscreenVisibility(Notification.VISIBILITY_PRIVATE);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            try { activeCallChannel.setAllowBubbles(false); } catch (Throwable ignored) {}
        }
        manager.createNotificationChannel(activeCallChannel);


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

        // 7. PROMO — Pkg425 Phase-8. Marketing / re-engagement / event banners.
        // LOW importance: no heads-up, quieter sound, user can mute without
        // losing critical alerts (calls/messages/gifts).
        NotificationChannel promoChannel = new NotificationChannel(
            CHANNEL_PROMO, "Promotions & Events", NotificationManager.IMPORTANCE_LOW);
        promoChannel.setDescription("Offers, events, campaigns, re-engagement");
        // Pkg-audit Tier-3: IMPORTANCE_LOW channels are silenced unconditionally
        // by the OS — setSound() on them is a no-op that misleads readers.
        // Explicit null documents the intent and avoids confusion.
        promoChannel.setSound(null, null);
        promoChannel.enableVibration(false);
        promoChannel.enableLights(false);
        promoChannel.setShowBadge(false);
        manager.createNotificationChannel(promoChannel);
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


    /**
     * Pkg429 — Rich gift notification. Backwards-compat 4-arg overload
     * delegates to the new rich form with no avatar / image.
     */
    public static void showGiftNotification(Context context, String senderName,
                                             String giftName, int giftValue) {
        showGiftNotification(context, senderName, giftName, giftValue, null, null, null);
    }

    /**
     * Pkg429 — Rich gift notification.
     *
     *  - Large icon = sender avatar (Glide-fetched on the caller's
     *    background thread).
     *  - BigPictureStyle = gift artwork (when URL provided).
     *  - "Send Back" action → opens MainActivity at /profile/<senderId>
     *    (no new receiver needed — keeps the manifest clean).
     */
    public static void showGiftNotification(Context context, String senderName,
                                             String giftName, int giftValue,
                                             String senderAvatarUrl, String giftImageUrl,
                                             String senderId) {
        Intent intent = new Intent(context, MainActivity.class);
        intent.setFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        intent.putExtra("type", "gift");
        if (senderId != null && !senderId.isEmpty()) intent.putExtra("sender_id", senderId);

        PendingIntent pendingIntent = PendingIntent.getActivity(
            context, NOTIFICATION_GIFT, intent,
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);

        String body = senderName + " sent you " + giftName + " 🎁 (+" + giftValue + " beans)";

        Bitmap largeIcon = fetchBitmapBestEffort(senderAvatarUrl);
        Bitmap bigPicture = fetchBitmapBestEffort(giftImageUrl);

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
            .setContentIntent(pendingIntent);

        if (largeIcon != null) builder.setLargeIcon(largeIcon);

        if (bigPicture != null) {
            builder.setStyle(new NotificationCompat.BigPictureStyle()
                .bigPicture(bigPicture)
                .bigLargeIcon((Bitmap) null) // collapse thumb when expanded
                .setBigContentTitle("🎁 " + senderName)
                .setSummaryText(body));
        } else {
            builder.setStyle(new NotificationCompat.BigTextStyle().bigText(body));
        }

        // "Send Back" — opens profile of sender so user can return the favor.
        if (senderId != null && !senderId.isEmpty()) {
            Intent sendBack = new Intent(context, MainActivity.class);
            sendBack.setFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP | Intent.FLAG_ACTIVITY_SINGLE_TOP);
            sendBack.putExtra("route", "/profile/" + senderId);
            PendingIntent sendBackPI = PendingIntent.getActivity(
                context, ("gift_back:" + senderId).hashCode(), sendBack,
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
            builder.addAction(new NotificationCompat.Action.Builder(
                    R.drawable.ic_notification, "Send Back 🎁", sendBackPI).build());
        }

        try {
            NotificationManagerCompat.from(context).notify(NOTIFICATION_GIFT, builder.build());
        } catch (SecurityException ignored) {}

        // Pkg-audit Tier-3: post a matching group summary. Without it, grouped
        // notifications using setGroup(GROUP_GIFTS) are silently suppressed on
        // Android 7+ when more than one is active — users would simply never see
        // back-to-back gift notifications.
        NotificationCompat.Builder giftSummary = new NotificationCompat.Builder(context, CHANNEL_GIFTS)
            .setSmallIcon(R.drawable.ic_notification)
            .setColor(BRAND_COLOR)
            .setContentTitle("New gifts")
            .setContentText(senderName + " sent you " + giftName)
            .setGroup(GROUP_GIFTS)
            .setGroupSummary(true)
            .setAutoCancel(true)
            .setCategory(NotificationCompat.CATEGORY_SOCIAL)
            .setContentIntent(pendingIntent);
        try {
            NotificationManagerCompat.from(context).notify(SUMMARY_GIFTS, giftSummary.build());
        } catch (SecurityException ignored) {}
    }

    /**
     * Pkg429 — Rich live notification. Backwards-compat 3-arg overload
     * delegates to the rich form with no images.
     */
    public static void showLiveNotification(Context context, String hostName, String roomId) {
        showLiveNotification(context, hostName, roomId, null, null);
    }

    /**
     * Pkg429 — Rich live notification.
     *
     *  - Large icon = host avatar.
     *  - BigPictureStyle = stream cover (if provided).
     *  - "Join 🔴" action → MainActivity with deep-link to the room.
     *  - "Dismiss" action → cancels just this notification (no new
     *    receiver — uses MainActivity NO_OP extra so the launcher
     *    swallows the tap and the system clears the notification).
     */
    public static void showLiveNotification(Context context, String hostName, String roomId,
                                             String hostAvatarUrl, String coverImageUrl) {
        Intent intent = new Intent(context, MainActivity.class);
        intent.setFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        intent.putExtra("type", "live");
        intent.putExtra("room_id", roomId);
        if (roomId != null && !roomId.isEmpty()) intent.putExtra("route", "/live/" + roomId);

        PendingIntent pendingIntent = PendingIntent.getActivity(
            context, NOTIFICATION_LIVE, intent,
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);

        Bitmap largeIcon = fetchBitmapBestEffort(hostAvatarUrl);
        Bitmap bigPicture = fetchBitmapBestEffort(coverImageUrl);

        String body = "Tap to join the live stream";

        NotificationCompat.Builder builder = new NotificationCompat.Builder(context, CHANNEL_LIVE)
            .setSmallIcon(R.drawable.ic_notification)
            .setColor(BRAND_COLOR)
            .setContentTitle(hostName + " is now LIVE! 🔴")
            .setContentText(body)
            .setAutoCancel(true)
            .setPriority(NotificationCompat.PRIORITY_DEFAULT)
            .setCategory(NotificationCompat.CATEGORY_SOCIAL)
            .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
            .setGroup(GROUP_LIVE)
            .setContentIntent(pendingIntent);

        if (largeIcon != null) builder.setLargeIcon(largeIcon);

        if (bigPicture != null) {
            builder.setStyle(new NotificationCompat.BigPictureStyle()
                .bigPicture(bigPicture)
                .bigLargeIcon((Bitmap) null)
                .setBigContentTitle("🔴 " + hostName + " is LIVE")
                .setSummaryText(body));
        } else {
            builder.setStyle(new NotificationCompat.BigTextStyle().bigText(body));
        }

        builder.addAction(new NotificationCompat.Action.Builder(
                R.drawable.ic_notification, "Join 🔴", pendingIntent).build());

        try {
            NotificationManagerCompat.from(context).notify(NOTIFICATION_LIVE, builder.build());
        } catch (SecurityException ignored) {}

        // Pkg-audit Tier-3: matching group summary for GROUP_LIVE (same
        // rationale as GROUP_GIFTS — grouped notifications without a summary
        // are suppressed by the system on Android 7+).
        NotificationCompat.Builder liveSummary = new NotificationCompat.Builder(context, CHANNEL_LIVE)
            .setSmallIcon(R.drawable.ic_notification)
            .setColor(BRAND_COLOR)
            .setContentTitle("Live now")
            .setContentText(hostName + " is live")
            .setGroup(GROUP_LIVE)
            .setGroupSummary(true)
            .setAutoCancel(true)
            .setCategory(NotificationCompat.CATEGORY_SOCIAL)
            .setContentIntent(pendingIntent);
        try {
            NotificationManagerCompat.from(context).notify(SUMMARY_LIVE, liveSummary.build());
        } catch (SecurityException ignored) {}
    }

    /**
     * Pkg429 — Best-effort blocking bitmap fetch for notification large
     * icon / big picture. MUST be called from a background thread (FCM
     * service handler thread is fine — onMessageReceived runs there).
     * Returns null on any failure so the caller can degrade gracefully.
     */
    private static Bitmap fetchBitmapBestEffort(String url) {
        if (url == null || url.isEmpty()) return null;
        if (!(url.startsWith("http://") || url.startsWith("https://"))) return null;
        // Pkg-audit Tier-11 (Medium): the prior version decoded the remote
        // bitmap at full resolution, which could be 4000x4000 = 64MB heap
        // for a single notification — guaranteed OOM on low-RAM devices.
        // Two-pass decode: read bounds first, then choose inSampleSize
        // targeting ~512px max edge (plenty for notification largeIcon /
        // bigPicture). Bytes are buffered to a small in-memory array so
        // we don't hold the socket open across two reads.
        HttpURLConnection conn = null;
        InputStream is = null;
        try {
            URL u = new URL(url);
            conn = (HttpURLConnection) u.openConnection();
            conn.setInstanceFollowRedirects(true);
            conn.setConnectTimeout(6000);
            conn.setReadTimeout(6000);
            conn.connect();
            is = conn.getInputStream();
            // Cap the raw download at 4MB to avoid pathological payloads.
            java.io.ByteArrayOutputStream baos = new java.io.ByteArrayOutputStream();
            byte[] buf = new byte[8192];
            int total = 0;
            int n;
            while ((n = is.read(buf)) > 0) {
                total += n;
                if (total > 4 * 1024 * 1024) return null;
                baos.write(buf, 0, n);
            }
            byte[] raw = baos.toByteArray();
            if (raw.length == 0) return null;

            BitmapFactory.Options bounds = new BitmapFactory.Options();
            bounds.inJustDecodeBounds = true;
            BitmapFactory.decodeByteArray(raw, 0, raw.length, bounds);
            int maxEdge = Math.max(bounds.outWidth, bounds.outHeight);
            int sample = 1;
            while (maxEdge / sample > 512) sample *= 2;

            BitmapFactory.Options opts = new BitmapFactory.Options();
            opts.inSampleSize = sample;
            opts.inPreferredConfig = Bitmap.Config.ARGB_8888;
            return BitmapFactory.decodeByteArray(raw, 0, raw.length, opts);
        } catch (Throwable ignored) {
            return null;
        } finally {
            try { if (is != null) is.close(); } catch (Throwable ignored) {}
            try { if (conn != null) conn.disconnect(); } catch (Throwable ignored) {}
        }
    }
}
