package com.merilive.app.service;

import android.app.PendingIntent;
import android.content.Intent;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.os.Build;
import android.util.Log;
import androidx.annotation.NonNull;
import androidx.core.app.NotificationCompat;
import androidx.core.app.NotificationManagerCompat;
import com.google.firebase.messaging.FirebaseMessagingService;
import com.google.firebase.messaging.RemoteMessage;
import com.merilive.app.MainActivity;
import com.merilive.app.R;
import com.merilive.app.activity.IncomingCallActivity;
import com.merilive.app.util.NotificationHelper;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.util.Map;

public class MeriFirebaseMessagingService extends FirebaseMessagingService {

    private static final String TAG = "MeriFirebaseMsgService";

    @Override
    public void onNewToken(@NonNull String token) {
        super.onNewToken(token);
        Log.i(TAG, "FCM Token refreshed (Pkg206)");
        // Pkg206 — persist pending token + timestamp so JS can detect rotation
        // after a Doze/standby/reinstall kill on the next foreground.
        try {
            getSharedPreferences("meri_push_state", MODE_PRIVATE)
                .edit()
                .putString("pending_fcm_token", token)
                .putLong("pending_fcm_token_at", System.currentTimeMillis())
                .apply();
        } catch (Exception e) {
            Log.w(TAG, "Failed to persist rotated FCM token", e);
        }
        // Defensive: re-create channels in case the OS dropped them after
        // a force-stop or data-clear that did NOT trigger BOOT_COMPLETED.
        try { NotificationHelper.createNotificationChannels(this); } catch (Exception ignored) { /* ignore */ }
    }

    @Override
    public void onMessageReceived(@NonNull RemoteMessage remoteMessage) {
        super.onMessageReceived(remoteMessage);

        Map<String, String> data = remoteMessage.getData();
        String type = data.containsKey("type") ? data.get("type") : "default";
        String title = data.containsKey("title") ? data.get("title") : "MeriLive";
        String body = data.containsKey("body") ? data.get("body") : "";

        // Premium banner image + emoji icon from edge functions
        // (push-on-notification / send-push-notification / send-app-notification).
        // Accept both snake_case and camelCase, plus FCM notification.image fallback.
        String imageUrl = firstNonEmpty(
            data.get("image_url"),
            data.get("imageUrl"),
            remoteMessage.getNotification() != null && remoteMessage.getNotification().getImageUrl() != null
                ? remoteMessage.getNotification().getImageUrl().toString()
                : null
        );
        String iconEmoji = firstNonEmpty(data.get("icon_emoji"), data.get("iconEmoji"));

        if (type == null) type = "default";

        switch (type) {
            case "incoming_call":
                handleIncomingCall(data);
                break;
            case "message":
                handleMessage(data, title, body, imageUrl, iconEmoji);
                break;
            case "gift":
                handleGift(data);
                break;
            case "live_start":
                handleLiveStart(data);
                break;
            default:
                handleGeneral(title, body, NotificationHelper.CHANNEL_DEFAULT, imageUrl, iconEmoji);
                break;
        }

        // FCM notification-payload fallback (only when our data switch didn't already render).
        if (remoteMessage.getNotification() != null
                && !"incoming_call".equals(type)
                && !"message".equals(type)
                && !"gift".equals(type)
                && !"live_start".equals(type)
                && !data.containsKey("title")) {
            String nTitle = remoteMessage.getNotification().getTitle();
            String nBody = remoteMessage.getNotification().getBody();
            if (nTitle != null) {
                handleGeneral(nTitle, nBody != null ? nBody : "", NotificationHelper.CHANNEL_DEFAULT, imageUrl, iconEmoji);
            }
        }
    }

    private static String firstNonEmpty(String... vals) {
        if (vals == null) return "";
        for (String v : vals) {
            if (v != null && !v.isEmpty()) return v;
        }
        return "";
    }

    private void handleIncomingCall(Map<String, String> data) {
        String callerId = data.containsKey("caller_id") ? data.get("caller_id") : "";
        String callerName = data.containsKey("caller_name") ? data.get("caller_name") : "Someone";
        String callerAvatar = data.containsKey("caller_avatar") ? data.get("caller_avatar") : "";
        String callType = data.containsKey("call_type") ? data.get("call_type") : "video";
        String callId = data.containsKey("call_id") ? data.get("call_id") : "";

        // Full-screen lock-screen activity.
        Intent fullScreenIntent = new Intent(this, IncomingCallActivity.class);
        fullScreenIntent.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        fullScreenIntent.putExtra("caller_id", callerId);
        fullScreenIntent.putExtra("caller_name", callerName);
        fullScreenIntent.putExtra("caller_avatar", callerAvatar);
        fullScreenIntent.putExtra("call_type", callType);
        fullScreenIntent.putExtra("call_id", callId);

        PendingIntent fullScreenPI = PendingIntent.getActivity(
            this, callId.hashCode(), fullScreenIntent,
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);

        // Step 31 — both Accept and Decline now go through the broadcast
        // receiver so NativeCallPlugin can dispatch the action into JS
        // BEFORE we launch MainActivity. The receiver itself launches
        // MainActivity for Accept after dispatching.
        Intent acceptIntent = new Intent(this, com.merilive.app.receiver.CallActionReceiver.class);
        acceptIntent.setAction(com.merilive.app.receiver.CallActionReceiver.ACTION_ACCEPT);
        acceptIntent.putExtra("call_id", callId);
        acceptIntent.putExtra("caller_id", callerId);
        acceptIntent.putExtra("caller_name", callerName);
        acceptIntent.putExtra("caller_avatar", callerAvatar);
        acceptIntent.putExtra("call_type", callType);
        PendingIntent acceptPI = PendingIntent.getBroadcast(
            this, ("accept:" + callId).hashCode(), acceptIntent,
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);

        Intent declineIntent = new Intent(this, com.merilive.app.receiver.CallActionReceiver.class);
        declineIntent.setAction(com.merilive.app.receiver.CallActionReceiver.ACTION_DECLINE);
        declineIntent.putExtra("call_id", callId);
        declineIntent.putExtra("caller_id", callerId);
        declineIntent.putExtra("caller_name", callerName);
        declineIntent.putExtra("caller_avatar", callerAvatar);
        declineIntent.putExtra("call_type", callType);
        PendingIntent declinePI = PendingIntent.getBroadcast(
            this, ("decline:" + callId).hashCode(), declineIntent,
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);

        String callLabel = "video".equals(callType) ? "📹 Video Call" : "📞 Audio Call";

        Bitmap avatar = null;
        if (callerAvatar != null && !callerAvatar.isEmpty()) {
            avatar = loadBitmapFromUrl(callerAvatar);
        }

        NotificationCompat.Builder builder = new NotificationCompat.Builder(this, NotificationHelper.CHANNEL_CALLS)
            .setSmallIcon(R.drawable.ic_notification)
            .setColor(NotificationHelper.BRAND_COLOR)
            .setColorized(true)
            .setContentTitle(callerName)
            .setContentText("Incoming " + callLabel)
            .setPriority(NotificationCompat.PRIORITY_MAX)
            .setCategory(NotificationCompat.CATEGORY_CALL)
            .setAutoCancel(true)
            .setOngoing(true)
            .setShowWhen(true)
            .setWhen(System.currentTimeMillis())
            .setFullScreenIntent(fullScreenPI, true)
            .setContentIntent(fullScreenPI)
            .setTimeoutAfter(30000)
            .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
            .setDefaults(NotificationCompat.DEFAULT_ALL);

        // Step 31 — use the Android 12+ CallStyle which renders an
        // honest CallKit-style heads-up (large avatar, swipe-to-answer
        // on lock screen, integrates with the system call UI).
        boolean styleApplied = false;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            try {
                androidx.core.app.Person.Builder personBuilder = new androidx.core.app.Person.Builder()
                    .setName(callerName)
                    .setImportant(true);
                if (avatar != null) {
                    personBuilder.setIcon(androidx.core.graphics.drawable.IconCompat.createWithBitmap(avatar));
                }
                androidx.core.app.Person person = personBuilder.build();
                builder.setStyle(
                    androidx.core.app.NotificationCompat.CallStyle.forIncomingCall(person, declinePI, acceptPI)
                );
                styleApplied = true;
            } catch (Throwable t) {
                Log.w(TAG, "CallStyle unavailable: " + t.getMessage());
            }
        }
        if (!styleApplied) {
            builder.addAction(R.drawable.ic_call_decline, "Decline", declinePI)
                   .addAction(R.drawable.ic_call_accept, "Accept", acceptPI);
            if (avatar != null) builder.setLargeIcon(avatar);
        }

        try {
            NotificationManagerCompat.from(this).notify(NotificationHelper.NOTIFICATION_CALL, builder.build());
        } catch (SecurityException se) {
            // POST_NOTIFICATIONS not granted on Android 13+. The
            // full-screen intent below still presents the activity.
            Log.w(TAG, "notify rejected: " + se.getMessage());
        }

        // Step 31 — surface presented event + start the activity for the
        // (relatively common) case where the OS suppresses heads-up but
        // honours full-screen intent (e.g. screen off, DND off).
        com.merilive.app.plugin.NativeCallPlugin.dispatch(
            this, callId, callerId, callerName, callType, "presented");
        try { startActivity(fullScreenIntent); } catch (Exception ignored) {}

        // Pkg208 — also push this into Telecom so BT headset Answer button
        // works + system call log is updated + audio focus is properly
        // grabbed. Self-managed: our own UI above stays the visible surface.
        try {
            com.merilive.app.telecom.TelecomBridge.reportIncoming(
                getApplicationContext(), callId, callerId, callerName, callType);
        } catch (Throwable ignored) {}
    }


    private void handleMessage(Map<String, String> data, String title, String body, String imageUrl, String iconEmoji) {
        String senderId = data.containsKey("sender_id") ? data.get("sender_id") : "";
        String senderName = firstNonEmpty(data.get("sender_name"), data.get("senderName"), title);
        String senderAvatar = firstNonEmpty(data.get("sender_avatar"), data.get("senderAvatar"), "");
        String conversationId = firstNonEmpty(data.get("conversation_id"), data.get("conversationId"), "");
        int notifId = NotificationHelper.NOTIFICATION_MESSAGE + (senderId != null ? senderId.hashCode() % 1000 : 0);
        // Prefer rich banner render when an image_url is present; otherwise use Pkg209 MessagingStyle + RemoteInput.
        if (imageUrl != null && !imageUrl.isEmpty()) {
            handleGeneral(title, body, NotificationHelper.CHANNEL_MESSAGES, imageUrl, iconEmoji);
        } else {
            String richTitle = (iconEmoji != null && !iconEmoji.isEmpty()) ? (iconEmoji + " " + title) : title;
            NotificationHelper.showMessageNotification(this, richTitle, body, senderId, notifId,
                    conversationId, senderName, senderAvatar);
        }
    }


    private void handleGeneral(String title, String body, String channelId, String imageUrl, String iconEmoji) {
        Intent intent = new Intent(this, MainActivity.class);
        intent.setFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        PendingIntent pi = PendingIntent.getActivity(
            this, 0, intent,
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);

        // Prefix title with emoji for premium feel (Recharge Mega → 💎 Recharge Mega)
        String finalTitle = (iconEmoji != null && !iconEmoji.isEmpty())
            ? (iconEmoji + " " + title)
            : title;

        NotificationCompat.Builder builder = new NotificationCompat.Builder(this, channelId)
            .setSmallIcon(R.drawable.ic_notification)
            .setColor(NotificationHelper.BRAND_COLOR)
            .setContentTitle(finalTitle)
            .setContentText(body)
            .setAutoCancel(true)
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .setDefaults(NotificationCompat.DEFAULT_ALL)
            .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
            .setContentIntent(pi);

        // Premium 3D banner — BigPictureStyle expanded view + large icon thumbnail.
        if (imageUrl != null && !imageUrl.isEmpty()) {
            Bitmap banner = loadBitmapFromUrl(imageUrl);
            if (banner != null) {
                builder.setLargeIcon(banner)
                       .setStyle(new NotificationCompat.BigPictureStyle()
                            .bigPicture(banner)
                            .bigLargeIcon((Bitmap) null) // collapse thumb when expanded
                            .setBigContentTitle(finalTitle)
                            .setSummaryText(body));
            } else {
                builder.setStyle(new NotificationCompat.BigTextStyle().bigText(body));
            }
        } else {
            builder.setStyle(new NotificationCompat.BigTextStyle().bigText(body));
        }

        int notifId = (int) (System.currentTimeMillis() % 100000);
        try {
            NotificationManagerCompat.from(this).notify(notifId, builder.build());
        } catch (SecurityException ignored) {
            // POST_NOTIFICATIONS not granted on Android 13+; silently skip.
        }
    }

    /**
     * Pkg202 — gift push handler.
     * Routes the FCM "gift" type into the rich gift notification with
     * sender name / gift name / bean value. Falls back to handleGeneral
     * when sender info is missing so the user still sees something.
     */
    private void handleGift(Map<String, String> data) {
        String senderName = firstNonEmpty(data.get("sender_name"), data.get("senderName"), "Someone");
        String giftName = firstNonEmpty(data.get("gift_name"), data.get("giftName"), "a gift");
        int giftValue = 0;
        try {
            String v = firstNonEmpty(data.get("gift_value"), data.get("giftValue"), "0");
            giftValue = Integer.parseInt(v);
        } catch (NumberFormatException ignored) {}
        NotificationHelper.showGiftNotification(this, senderName, giftName, giftValue);
    }

    /**
     * Pkg202 — live-start push handler.
     * Routes the FCM "live_start" type into the rich live notification.
     */
    private void handleLiveStart(Map<String, String> data) {
        String hostName = firstNonEmpty(data.get("host_name"), data.get("hostName"), "A creator");
        String roomId = firstNonEmpty(data.get("room_id"), data.get("roomId"), "");
        NotificationHelper.showLiveNotification(this, hostName, roomId);
    }

    private Bitmap loadBitmapFromUrl(String urlString) {
        try {
            URL url = new URL(urlString);
            HttpURLConnection conn = (HttpURLConnection) url.openConnection();
            conn.setInstanceFollowRedirects(true);
            conn.setDoInput(true);
            conn.setConnectTimeout(8000);
            conn.setReadTimeout(8000);
            conn.connect();
            InputStream input = conn.getInputStream();
            return BitmapFactory.decodeStream(input);
        } catch (Exception e) {
            Log.w(TAG, "loadBitmapFromUrl failed: " + e.getMessage());
            return null;
        }
    }
}
