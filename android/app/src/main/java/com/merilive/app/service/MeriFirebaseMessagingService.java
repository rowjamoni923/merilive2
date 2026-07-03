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
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

public class MeriFirebaseMessagingService extends FirebaseMessagingService {

    private static final String TAG = "MeriFirebaseMsgService";

    // Honest-private-call fix (F-1): off-thread avatar loader.
    // FCM gives us ~20 s on this thread before Android force-stops the
    // service. Doing two 8 s socket reads here can blow that budget and
    // the incoming-call notification never posts. We post immediately
    // with no avatar, then re-post with the same notification id once
    // the bitmap arrives. Single shared thread keeps burst pushes cheap.
    private static final ExecutorService AVATAR_LOADER =
        Executors.newSingleThreadExecutor(r -> {
            Thread t = new Thread(r, "meri-fcm-avatar");
            t.setDaemon(true);
            t.setPriority(Thread.MIN_PRIORITY);
            return t;
        });

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

        // Pkg-audit Tier-3: track whether the switch already rendered something
        // so the notification-payload fallback below never double-fires.
        boolean handledBySwitch = true;
        switch (type) {
            case "incoming_call":
                // Honest-private-call fix (F-2): log a warning if the backend
                // accidentally dispatches a call push at normal priority —
                // Doze won't wake the device and the user misses the ring.
                // Diagnostic only; we still attempt the call notification.
                try {
                    if (remoteMessage.getPriority() != RemoteMessage.PRIORITY_HIGH) {
                        Log.w(TAG, "incoming_call push delivered at non-HIGH priority " +
                            "(priority=" + remoteMessage.getPriority() + "). " +
                            "Doze devices will miss this ring — fix the backend send.");
                    }
                } catch (Throwable ignored) {}
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
                // Only render a generic default-channel banner when the data
                // payload carries its own title; otherwise let the notification-
                // payload fallback below handle it (prevents the double-fire
                // where the default branch posts "MeriLive" + an empty body and
                // the fallback then posts the real notification.title moments
                // later).
                if (data.containsKey("title")) {
                    handleGeneral(title, body, NotificationHelper.CHANNEL_DEFAULT, imageUrl, iconEmoji);
                } else {
                    handledBySwitch = false;
                }
                break;
        }

        // FCM notification-payload fallback (only when our data switch didn't already render).
        if (!handledBySwitch && remoteMessage.getNotification() != null) {
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
        String ringTimeoutSec = data.containsKey("ring_timeout_seconds")
            ? data.get("ring_timeout_seconds") : "30";

        // Full-screen lock-screen activity.
        Intent fullScreenIntent = new Intent(this, IncomingCallActivity.class);
        fullScreenIntent.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        fullScreenIntent.putExtra("caller_id", callerId);
        fullScreenIntent.putExtra("caller_name", callerName);
        fullScreenIntent.putExtra("caller_avatar", callerAvatar);
        fullScreenIntent.putExtra("call_type", callType);
        fullScreenIntent.putExtra("call_id", callId);
        fullScreenIntent.putExtra("ring_timeout_seconds", ringTimeoutSec);

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

        // Pkg-audit Tier-3: honour server-supplied ring_timeout_seconds instead
        // of hardcoded 30s. Clamp to [10s, 120s] to defend against bad payloads.
        long timeoutMs = 30_000L;
        try {
            long parsed = Long.parseLong(ringTimeoutSec.trim());
            if (parsed >= 10) timeoutMs = Math.min(parsed, 120L) * 1000L;
        } catch (NumberFormatException ignored) {}

        // Honest-private-call fix (F-1): post the notification + start the
        // full-screen activity FIRST, with no avatar. Avatar arrives a few
        // hundred ms later via a re-notify with the same id, so the heads-up
        // updates in place.
        try {
            postIncomingCallNotification(
                callId, callerName, callType, callLabel,
                fullScreenPI, acceptPI, declinePI, timeoutMs, /*avatar*/ null);
        } catch (Throwable t) {
            Log.w(TAG, "post(no-avatar) failed: " + t.getMessage());
        }

        com.merilive.app.plugin.NativeCallPlugin.dispatch(
            this, callId, callerId, callerName, callType, "presented");
        // Honest-private-call fix (B-1): removed dead `startActivity(fullScreenIntent)`.
        // The FSI PendingIntent attached to the notification (line 261) is the
        // only supported path to launch IncomingCallActivity from a background
        // FCM service on API 29+ (BAL restrictions silently block direct
        // startActivity here, so the call simply swallowed the exception).


        try {
            com.merilive.app.telecom.TelecomBridge.reportIncoming(
                getApplicationContext(), callId, callerId, callerName, callType);
        } catch (Throwable ignored) {}

        // Off-thread avatar load + re-notify with the same id.
        if (callerAvatar != null && !callerAvatar.isEmpty()) {
            final String avatarUrl = callerAvatar;
            final long timeoutMsFinal = timeoutMs;
            AVATAR_LOADER.submit(() -> {
                Bitmap loaded = loadBitmapFromUrl(avatarUrl);
                if (loaded == null) return;
                try {
                    postIncomingCallNotification(
                        callId, callerName, callType, callLabel,
                        fullScreenPI, acceptPI, declinePI, timeoutMsFinal, loaded);
                } catch (Throwable t) {
                    Log.w(TAG, "post(with-avatar) failed: " + t.getMessage());
                }
            });
        }
    }

    /**
     * Honest-private-call fix (F-1) helper. Builds and posts the incoming-call
     * notification. Called twice per ring: once immediately (avatar=null), then
     * again after the async fetch resolves. Same id → in-place update.
     */
    private void postIncomingCallNotification(
        String callId,
        String callerName,
        String callType,
        String callLabel,
        PendingIntent fullScreenPI,
        PendingIntent acceptPI,
        PendingIntent declinePI,
        long timeoutMs,
        Bitmap avatar
    ) {
        // Honest-private-call fix (L-5): on Android 14+, only attach the
        // full-screen-intent when the OS has actually granted USE_FULL_SCREEN_INTENT.
        // Google Play auto-revokes FSI from non-calling apps since Jan 2025; if we
        // still attach it the OS silently downgrades to a heads-up — same UX as
        // not setting it, but the API ref count is wasted. Gate the attach so the
        // notification stays a clean high-priority heads-up when FSI is denied.
        boolean canUseFsi = true;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
            try {
                android.app.NotificationManager nm =
                    (android.app.NotificationManager) getSystemService(NOTIFICATION_SERVICE);
                if (nm != null) canUseFsi = nm.canUseFullScreenIntent();
                if (!canUseFsi) {
                    Log.w(TAG, "Full-screen-intent NOT granted on Android 14+ — " +
                        "falling back to high-priority heads-up only. " +
                        "Prompt user via Settings → Notifications → Full-screen.");
                }
            } catch (Throwable ignored) {}
        }

        NotificationCompat.Builder builder = new NotificationCompat.Builder(this, NotificationHelper.CHANNEL_CALLS)
            .setSmallIcon(R.drawable.ic_notification)
            .setColor(NotificationHelper.BRAND_COLOR)
            .setColorized(true)
            .setContentTitle(callerName)
            .setContentText("Incoming " + callLabel)
            .setPriority(NotificationCompat.PRIORITY_MAX)
            .setCategory(NotificationCompat.CATEGORY_MESSAGE)
            .setAutoCancel(true)
            .setOngoing(true)
            .setShowWhen(true)
            .setWhen(System.currentTimeMillis())
            .setContentIntent(fullScreenPI)
            .setTimeoutAfter(timeoutMs)
            .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
            .setDefaults(NotificationCompat.DEFAULT_ALL);

        if (canUseFsi) {
            builder.setFullScreenIntent(fullScreenPI, true);
        }

        // 2026-06-30: Do NOT use NotificationCompat.CallStyle here. On Samsung,
        // MIUI, Vivo/Oppo and Android 12+ it can promote the notification into an
        // OEM/system call chip that survives over our React ActiveCallScreen and
        // looks like a third-party/phone call UI. MeriLive uses only our custom
        // IncomingCallActivity + React call screen; this notification is just the
        // wake/ring delivery surface with explicit Accept/Decline actions.
        builder.addAction(R.drawable.ic_call_decline, "Decline", declinePI)
               .addAction(R.drawable.ic_call_accept, "Accept", acceptPI);
        if (avatar != null) builder.setLargeIcon(avatar);

        try {
            NotificationManagerCompat.from(this).notify(NotificationHelper.NOTIFICATION_CALL, builder.build());
        } catch (SecurityException se) {
            Log.w(TAG, "notify rejected: " + se.getMessage());
        }
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
        // Pkg-audit Tier-3: compute the unique notification id FIRST and reuse it
        // as the PendingIntent request code. Previously the request code was
        // hardcoded 0 + FLAG_UPDATE_CURRENT, so every general notification
        // overwrote the extras of all prior ones (tapping a newer "live_start"
        // banner could open MainActivity with stale "gift" extras).
        int notifId = (int) (System.currentTimeMillis() % 100000);

        Intent intent = new Intent(this, MainActivity.class);
        intent.setFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        PendingIntent pi = PendingIntent.getActivity(
            this, notifId, intent,
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
        // Pkg429 — rich-push enrichment: sender avatar + gift artwork + senderId
        // for the "Send Back 🎁" action. All fields optional; helper degrades
        // gracefully to the plain BigTextStyle path when missing.
        String senderAvatar = firstNonEmpty(data.get("sender_avatar_url"),
                data.get("senderAvatarUrl"), data.get("avatar_url"), "");
        String giftImage = firstNonEmpty(data.get("gift_image_url"),
                data.get("giftImageUrl"), data.get("image_url"), "");
        String senderId = firstNonEmpty(data.get("sender_id"), data.get("senderId"), "");
        NotificationHelper.showGiftNotification(this, senderName, giftName, giftValue,
                senderAvatar.isEmpty() ? null : senderAvatar,
                giftImage.isEmpty() ? null : giftImage,
                senderId.isEmpty() ? null : senderId);
    }

    /**
     * Pkg202 — live-start push handler.
     * Routes the FCM "live_start" type into the rich live notification.
     */
    private void handleLiveStart(Map<String, String> data) {
        String hostName = firstNonEmpty(data.get("host_name"), data.get("hostName"), "A creator");
        String roomId = firstNonEmpty(data.get("room_id"), data.get("roomId"), "");
        // Pkg429 — rich-push enrichment: host avatar + cover image for the
        // expanded BigPictureStyle layout. Optional, degrades gracefully.
        String hostAvatar = firstNonEmpty(data.get("host_avatar_url"),
                data.get("hostAvatarUrl"), data.get("avatar_url"), "");
        String cover = firstNonEmpty(data.get("cover_image_url"),
                data.get("coverImageUrl"), data.get("image_url"), "");
        NotificationHelper.showLiveNotification(this, hostName, roomId,
                hostAvatar.isEmpty() ? null : hostAvatar,
                cover.isEmpty() ? null : cover);
    }

    private Bitmap loadBitmapFromUrl(String urlString) {
        // Pkg-audit Tier-3: always release stream + connection in finally —
        // burst push delivery (e.g. gift storms) was leaking file descriptors
        // and sockets until SocketException: Too many open files.
        // Pkg-audit Tier-12 (Medium): also subsample to ≤512px max edge so a
        // single oversized banner JPEG can't OOM-kill the FCM service.
        HttpURLConnection conn = null;
        InputStream input = null;
        try {
            URL url = new URL(urlString);
            conn = (HttpURLConnection) url.openConnection();
            conn.setInstanceFollowRedirects(true);
            conn.setDoInput(true);
            conn.setConnectTimeout(8000);
            conn.setReadTimeout(8000);
            conn.connect();
            input = conn.getInputStream();
            java.io.ByteArrayOutputStream baos = new java.io.ByteArrayOutputStream();
            byte[] buf = new byte[8192];
            int total = 0, n;
            while ((n = input.read(buf)) > 0) {
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
        } catch (Exception e) {
            Log.w(TAG, "loadBitmapFromUrl failed: " + e.getMessage());
            return null;
        } finally {
            try { if (input != null) input.close(); } catch (Exception ignored) {}
            try { if (conn != null) conn.disconnect(); } catch (Exception ignored) {}
        }
    }
}
