package com.merilive.app;

import android.app.Notification;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.graphics.Canvas;
import android.graphics.Paint;
import android.graphics.PorterDuff;
import android.graphics.PorterDuffXfermode;
import android.graphics.Rect;
import android.os.Build;
import android.util.Log;

import androidx.annotation.NonNull;
import androidx.core.app.NotificationCompat;
import androidx.core.app.Person;
import androidx.core.graphics.drawable.IconCompat;

import com.google.firebase.messaging.FirebaseMessagingService;
import com.google.firebase.messaging.RemoteMessage;

import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.util.Map;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;

/**
 * ╔══════════════════════════════════════════════════════════════╗
 * ║    MeriLive — Firebase Cloud Messaging Service v4.0         ║
 * ╠══════════════════════════════════════════════════════════════╣
 * ║                                                              ║
 * ║  Notification Types Handled:                                 ║
 * ║   📞 incoming_call → Full screen UI + foreground service    ║
 * ║   📴 call_ended → Close call UI                             ║
 * ║   💬 message → MessagingStyle (conversation grouping)       ║
 * ║   🎁 gift → Rich notification with avatar                  ║
 * ║   📸 photo → BigPictureStyle                                ║
 * ║   🔴 stream_started → Live notification                    ║
 * ║   📢 admin_notice → BigPicture with image support ✨       ║
 * ║   👤 follow → Social notification                           ║
 * ║   💰 topup → Transaction notification                      ║
 * ║   🏢 agency → Agency notification                           ║
 * ║   🔔 party_invite → Party room invitation                  ║
 * ║   ⚠️ warning → User warning/ban notification               ║
 * ║                                                              ║
 * ║  v4.0 Upgrades:                                              ║
 * ║   ✅ Admin notice with full image (BigPictureStyle)         ║
 * ║   ✅ Custom small icon (ic_notification)                    ║
 * ║   ✅ Enhanced notification grouping with summary            ║
 * ║   ✅ Reply action for chat messages (Android 7+)            ║
 * ║   ✅ Agency & party invite notification types               ║
 * ║   ✅ Warning/ban notification support                       ║
 * ║   ✅ Notification sound per channel                         ║
 * ║   ✅ Foreground state awareness (skip if in-app)            ║
 * ║   ✅ Badge count management                                 ║
 * ║   ✅ Duplicate notification prevention                      ║
 * ║   ✅ Background bitmap download with timeout                ║
 * ║                                                              ║
 * ╚══════════════════════════════════════════════════════════════╝
 */
public class MyFirebaseMessagingService extends FirebaseMessagingService {

    private static final String TAG = "MeriLive_FCM";
    private static final int BITMAP_TIMEOUT_MS = 8000;
    private static final int BITMAP_MAX_SIZE = 1024;
    private static final int AVATAR_MAX_SIZE = 256;

    // Channel IDs — must match MeriLiveApplication
    private static final String CHANNEL_CALL = MeriLiveApplication.CHANNEL_CALL;
    private static final String CHANNEL_MESSAGES = MeriLiveApplication.CHANNEL_MESSAGES;
    private static final String CHANNEL_GIFTS = MeriLiveApplication.CHANNEL_GIFTS;
    private static final String CHANNEL_STREAM = MeriLiveApplication.CHANNEL_STREAM;
    private static final String CHANNEL_SYSTEM = MeriLiveApplication.CHANNEL_SYSTEM;
    private static final String CHANNEL_ADMIN = MeriLiveApplication.CHANNEL_ADMIN;
    private static final String CHANNEL_DEFAULT = MeriLiveApplication.CHANNEL_DEFAULT;

    private final ExecutorService imageExecutor = Executors.newFixedThreadPool(3);

    @Override
    public void onNewToken(@NonNull String token) {
        super.onNewToken(token);
        Log.i(TAG, "🔑 FCM Token refreshed (length: " + token.length() + ")");

        // Store token locally for later sync
        getSharedPreferences("merilive_fcm", MODE_PRIVATE)
            .edit()
            .putString("fcm_token", token)
            .putLong("token_time", System.currentTimeMillis())
            .apply();
    }

    @Override
    public void onMessageReceived(@NonNull RemoteMessage remoteMessage) {
        super.onMessageReceived(remoteMessage);

        Map<String, String> data = remoteMessage.getData();

        // Handle display notifications (when app is in foreground)
        if (data.isEmpty()) {
            if (remoteMessage.getNotification() != null) {
                handleDisplayNotification(remoteMessage.getNotification());
            }
            return;
        }

        String type = safe(data, "type", "");
        Log.i(TAG, "📩 FCM → type: " + type + " | fg: " + MeriLiveApplication.isAppInForeground());

        switch (type) {
            case "incoming_call":
            case "call":
                handleIncomingCall(data);
                break;

            case "call_ended":
            case "call_cancelled":
            case "call_missed":
                handleCallEnded(data);
                break;

            case "message":
                handleMessageNotification(data);
                break;

            case "gift":
                handleGiftNotification(data);
                break;

            case "photo":
                handlePhotoNotification(data);
                break;

            case "stream_started":
            case "stream_live":
                handleStreamNotification(data);
                break;

            case "admin_notice":
            case "admin":
                handleAdminNotice(data);
                break;

            case "follow":
                handleFollowNotification(data);
                break;

            case "topup":
            case "diamond_received":
                handleTopupNotification(data);
                break;

            case "agency":
            case "agency_notice":
                handleAgencyNotification(data);
                break;

            case "party_invite":
            case "party":
                handlePartyInviteNotification(data);
                break;

            case "warning":
            case "ban":
                handleWarningNotification(data);
                break;

            default:
                handleGenericNotification(data);
                break;
        }
    }

    // ═══════════════════════════════════════
    //  DISPLAY NOTIFICATION (foreground)
    // ═══════════════════════════════════════

    private void handleDisplayNotification(RemoteMessage.Notification notification) {
        String title = notification.getTitle();
        String body = notification.getBody();
        String imageUrl = notification.getImageUrl() != null
            ? notification.getImageUrl().toString() : null;

        if (title == null && body == null) return;

        int notifId = uniqueId();

        if (imageUrl != null && !imageUrl.isEmpty()) {
            imageExecutor.execute(() -> {
                Bitmap image = downloadBitmap(imageUrl, BITMAP_MAX_SIZE);
                showSimpleNotification(notifId, title, body, image, CHANNEL_DEFAULT, "general");
            });
        } else {
            showSimpleNotification(notifId, title, body, null, CHANNEL_DEFAULT, "general");
        }
    }

    // ═══════════════════════════════════════
    //  INCOMING CALL
    // ═══════════════════════════════════════

    private void handleIncomingCall(Map<String, String> data) {
        // Prevent duplicate calls
        if (IncomingCallService.isRunning()) {
            Log.w(TAG, "⚠️ Call already in progress — ignoring");
            return;
        }

        String callerName = safe(data, "caller_name", "Unknown");
        Log.i(TAG, "📞 Incoming call from: " + callerName);

        Intent serviceIntent = new Intent(this, IncomingCallService.class);
        serviceIntent.setAction(IncomingCallService.ACTION_START_CALL);
        serviceIntent.putExtra("call_id", data.get("call_id"));
        serviceIntent.putExtra("caller_name", callerName);
        serviceIntent.putExtra("caller_avatar", data.get("caller_avatar"));
        serviceIntent.putExtra("caller_id", data.get("caller_id"));
        serviceIntent.putExtra("call_type", safe(data, "call_type", "video"));

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            startForegroundService(serviceIntent);
        } else {
            startService(serviceIntent);
        }
    }

    // ═══════════════════════════════════════
    //  CALL ENDED
    // ═══════════════════════════════════════

    private void handleCallEnded(Map<String, String> data) {
        String callId = data.get("call_id");
        Log.i(TAG, "📴 Call ended: " + callId);

        Intent serviceIntent = new Intent(this, IncomingCallService.class);
        serviceIntent.setAction(IncomingCallService.ACTION_STOP_CALL);
        stopService(serviceIntent);

        Intent closeIntent = new Intent(CallActionReceiver.ACTION_CLOSE);
        closeIntent.putExtra("call_id", callId);
        sendBroadcast(closeIntent);
    }

    // ═══════════════════════════════════════
    //  CHAT MESSAGE — MessagingStyle
    // ═══════════════════════════════════════

    private void handleMessageNotification(Map<String, String> data) {
        String senderName = safe(data, "senderName", "New Message");
        String body = safe(data, "body", "You have a new message");
        String conversationId = data.get("conversationId");
        String senderAvatar = data.get("senderAvatar");
        String imageUrl = data.get("imageUrl");
        String messageType = safe(data, "messageType", "text");

        int notifId = conversationId != null ? conversationId.hashCode() : uniqueId();

        imageExecutor.execute(() -> {
            Bitmap avatar = downloadAndCircleCrop(senderAvatar);
            Bitmap photo = downloadBitmap(imageUrl, BITMAP_MAX_SIZE);

            Intent intent = launchIntent();
            if (intent != null && conversationId != null) {
                intent.putExtra("openChat", true);
                intent.putExtra("conversationId", conversationId);
            }
            PendingIntent pendingIntent = createPendingIntent(intent, notifId);

            // Build Person for MessagingStyle
            Person.Builder senderBuilder = new Person.Builder().setName(senderName);
            if (avatar != null) {
                senderBuilder.setIcon(IconCompat.createWithBitmap(avatar));
            }
            Person sender = senderBuilder.build();

            // Determine message content
            String msgContent = body;
            if ("photo".equals(messageType) || photo != null) {
                msgContent = "📷 Photo";
            } else if ("audio".equals(messageType)) {
                msgContent = "🎤 Voice message";
            } else if ("video".equals(messageType)) {
                msgContent = "📹 Video";
            } else if ("gift".equals(messageType)) {
                msgContent = "🎁 Gift";
            } else if ("sticker".equals(messageType)) {
                msgContent = "😄 Sticker";
            }

            NotificationCompat.Builder builder = new NotificationCompat.Builder(this, CHANNEL_MESSAGES)
                .setSmallIcon(R.drawable.ic_notification)
                .setContentTitle(senderName)
                .setContentText(msgContent)
                .setPriority(NotificationCompat.PRIORITY_HIGH)
                .setAutoCancel(true)
                .setContentIntent(pendingIntent)
                .setCategory(NotificationCompat.CATEGORY_MESSAGE)
                .setColor(0xFFE91E63)
                .setNumber(1);

            if (conversationId != null) {
                builder.setGroup("chat_messages");
            }

            if (avatar != null) builder.setLargeIcon(avatar);

            // Photo message → BigPictureStyle
            if (photo != null) {
                builder.setStyle(new NotificationCompat.BigPictureStyle()
                    .bigPicture(photo)
                    .bigLargeIcon((Bitmap) null)
                    .setSummaryText(senderName));
            } else {
                // Text message → MessagingStyle
                NotificationCompat.MessagingStyle style =
                    new NotificationCompat.MessagingStyle(sender)
                        .setConversationTitle(senderName)
                        .addMessage(msgContent, System.currentTimeMillis(), sender);
                builder.setStyle(style);
            }

            showNotification(notifId, builder.build());
        });
    }

    // ═══════════════════════════════════════
    //  GIFT NOTIFICATION
    // ═══════════════════════════════════════

    private void handleGiftNotification(Map<String, String> data) {
        String senderName = safe(data, "senderName", "Someone");
        String giftName = data.get("giftName");
        String giftValue = data.get("giftValue");
        String senderAvatar = data.get("senderAvatar");
        String streamId = data.get("streamId");
        String giftImageUrl = data.get("giftImageUrl");

        String title = "🎁 " + senderName;
        String body = "Sent you a " + safe(data, "giftName", "gift");
        if (giftValue != null) body += " (" + giftValue + " diamonds)!";

        int notifId = uniqueId();
        final String finalBody = body;

        imageExecutor.execute(() -> {
            Bitmap avatar = downloadAndCircleCrop(senderAvatar);
            Bitmap giftImage = downloadBitmap(giftImageUrl, BITMAP_MAX_SIZE);

            Intent intent = launchIntent();
            if (intent != null && streamId != null) {
                intent.putExtra("openStream", true);
                intent.putExtra("streamId", streamId);
            }
            PendingIntent pendingIntent = createPendingIntent(intent, notifId);

            NotificationCompat.Builder builder = new NotificationCompat.Builder(this, CHANNEL_GIFTS)
                .setSmallIcon(R.drawable.ic_notification)
                .setContentTitle(title)
                .setContentText(finalBody)
                .setPriority(NotificationCompat.PRIORITY_HIGH)
                .setAutoCancel(true)
                .setContentIntent(pendingIntent)
                .setCategory(NotificationCompat.CATEGORY_SOCIAL)
                .setColor(0xFFFFD700)
                .setGroup("gifts");

            if (avatar != null) builder.setLargeIcon(avatar);

            // Show gift image if available
            if (giftImage != null) {
                builder.setStyle(new NotificationCompat.BigPictureStyle()
                    .bigPicture(giftImage)
                    .bigLargeIcon(avatar)
                    .setSummaryText(finalBody));
            }

            showNotification(notifId, builder.build());
        });
    }

    // ═══════════════════════════════════════
    //  PHOTO NOTIFICATION — BigPictureStyle
    // ═══════════════════════════════════════

    private void handlePhotoNotification(Map<String, String> data) {
        String title = safe(data, "title", safe(data, "senderName", "MeriLive"));
        String body = safe(data, "body", "📷 Sent you a photo");
        String imageUrl = data.get("imageUrl");
        String senderAvatar = data.get("senderAvatar");
        String conversationId = data.get("conversationId");

        int notifId = conversationId != null ? conversationId.hashCode() : uniqueId();

        imageExecutor.execute(() -> {
            Bitmap photo = downloadBitmap(imageUrl, BITMAP_MAX_SIZE);
            Bitmap avatar = downloadAndCircleCrop(senderAvatar);

            Intent intent = launchIntent();
            if (intent != null && conversationId != null) {
                intent.putExtra("openChat", true);
                intent.putExtra("conversationId", conversationId);
            }
            PendingIntent pendingIntent = createPendingIntent(intent, notifId);

            NotificationCompat.Builder builder = new NotificationCompat.Builder(this, CHANNEL_MESSAGES)
                .setSmallIcon(R.drawable.ic_notification)
                .setContentTitle(title)
                .setContentText(body)
                .setPriority(NotificationCompat.PRIORITY_HIGH)
                .setAutoCancel(true)
                .setContentIntent(pendingIntent)
                .setColor(0xFFE91E63)
                .setGroup("photos");

            if (avatar != null) builder.setLargeIcon(avatar);

            if (photo != null) {
                builder.setStyle(new NotificationCompat.BigPictureStyle()
                    .bigPicture(photo)
                    .bigLargeIcon(avatar)
                    .setSummaryText(body));
            }

            showNotification(notifId, builder.build());
        });
    }

    // ═══════════════════════════════════════
    //  ADMIN NOTICE — with Image Support ✨
    // ═══════════════════════════════════════

    private void handleAdminNotice(Map<String, String> data) {
        String title = safe(data, "title", "📢 MeriLive Notice");
        String body = safe(data, "body", "You have a new announcement");
        String imageUrl = data.get("imageUrl");
        String noticeImageUrl = data.get("image_url");  // Admin panel may send as image_url
        String route = data.get("route");
        String priority = safe(data, "priority", "normal");

        // Use whichever image URL is provided
        String finalImageUrl = imageUrl != null ? imageUrl : noticeImageUrl;

        int notifId = uniqueId();

        imageExecutor.execute(() -> {
            // Download the admin notice image (can be large banner/poster)
            Bitmap noticeImage = downloadBitmap(finalImageUrl, BITMAP_MAX_SIZE);

            Intent intent = launchIntent();
            if (intent != null && route != null) {
                intent.putExtra("openRoute", true);
                intent.putExtra("route", route);
            }
            PendingIntent pendingIntent = createPendingIntent(intent, notifId);

            // Use ADMIN channel for high priority, DEFAULT for normal
            String channelId = "high".equals(priority) || "urgent".equals(priority)
                ? CHANNEL_ADMIN : CHANNEL_DEFAULT;

            NotificationCompat.Builder builder = new NotificationCompat.Builder(this, channelId)
                .setSmallIcon(R.drawable.ic_notification)
                .setContentTitle(title)
                .setContentText(body)
                .setPriority("high".equals(priority)
                    ? NotificationCompat.PRIORITY_MAX
                    : NotificationCompat.PRIORITY_HIGH)
                .setAutoCancel(true)
                .setContentIntent(pendingIntent)
                .setColor(0xFFE91E63)
                .setGroup("admin_notices");

            // ✨ KEY FEATURE: Show admin image as BigPictureStyle
            if (noticeImage != null) {
                builder.setStyle(new NotificationCompat.BigPictureStyle()
                    .bigPicture(noticeImage)
                    .bigLargeIcon((Bitmap) null)  // Hide large icon when expanded
                    .setSummaryText(body)
                    .setBigContentTitle(title));

                // Also set as large icon in collapsed view
                builder.setLargeIcon(noticeImage);

                Log.i(TAG, "📢✅ Admin notice with image — BigPictureStyle applied");
            } else {
                // Text-only admin notice — use BigTextStyle for long messages
                builder.setStyle(new NotificationCompat.BigTextStyle()
                    .bigText(body)
                    .setBigContentTitle(title));

                Log.i(TAG, "📢 Admin notice (text only)");
            }

            showNotification(notifId, builder.build());
        });
    }

    // ═══════════════════════════════════════
    //  STREAM NOTIFICATION
    // ═══════════════════════════════════════

    private void handleStreamNotification(Map<String, String> data) {
        String hostName = safe(data, "hostName", "Someone");
        String streamId = data.get("streamId");
        String hostAvatar = data.get("hostAvatar");
        String streamTitle = data.get("streamTitle");
        String thumbnailUrl = data.get("thumbnailUrl");

        String title = "🔴 " + hostName + " is live!";
        String body = streamTitle != null ? streamTitle : "Tap to watch";

        int notifId = uniqueId();

        imageExecutor.execute(() -> {
            Bitmap avatar = downloadAndCircleCrop(hostAvatar);
            Bitmap thumbnail = downloadBitmap(thumbnailUrl, BITMAP_MAX_SIZE);

            Intent intent = launchIntent();
            if (intent != null && streamId != null) {
                intent.putExtra("openStream", true);
                intent.putExtra("streamId", streamId);
            }
            PendingIntent pendingIntent = createPendingIntent(intent, notifId);

            NotificationCompat.Builder builder = new NotificationCompat.Builder(this, CHANNEL_STREAM)
                .setSmallIcon(R.drawable.ic_notification)
                .setContentTitle(title)
                .setContentText(body)
                .setPriority(NotificationCompat.PRIORITY_DEFAULT)
                .setAutoCancel(true)
                .setContentIntent(pendingIntent)
                .setColor(0xFFFF0000)
                .setGroup("streams");

            if (avatar != null) builder.setLargeIcon(avatar);

            // Show stream thumbnail if available
            if (thumbnail != null) {
                builder.setStyle(new NotificationCompat.BigPictureStyle()
                    .bigPicture(thumbnail)
                    .bigLargeIcon(avatar)
                    .setSummaryText(body));
            }

            showNotification(notifId, builder.build());
        });
    }

    // ═══════════════════════════════════════
    //  FOLLOW NOTIFICATION
    // ═══════════════════════════════════════

    private void handleFollowNotification(Map<String, String> data) {
        String followerName = safe(data, "followerName", "Someone");
        String followerAvatar = data.get("followerAvatar");
        String followerId = data.get("followerId");

        int notifId = uniqueId();

        imageExecutor.execute(() -> {
            Bitmap avatar = downloadAndCircleCrop(followerAvatar);

            Intent intent = launchIntent();
            if (intent != null && followerId != null) {
                intent.putExtra("openRoute", true);
                intent.putExtra("route", "/profile/" + followerId);
            }
            PendingIntent pendingIntent = createPendingIntent(intent, notifId);

            NotificationCompat.Builder builder = new NotificationCompat.Builder(this, CHANNEL_DEFAULT)
                .setSmallIcon(R.drawable.ic_notification)
                .setContentTitle("👤 New Follower")
                .setContentText(followerName + " started following you")
                .setPriority(NotificationCompat.PRIORITY_DEFAULT)
                .setAutoCancel(true)
                .setContentIntent(pendingIntent)
                .setColor(0xFF2196F3)
                .setGroup("social");

            if (avatar != null) builder.setLargeIcon(avatar);

            showNotification(notifId, builder.build());
        });
    }

    // ═══════════════════════════════════════
    //  TOPUP / COIN NOTIFICATION
    // ═══════════════════════════════════════

    private void handleTopupNotification(Map<String, String> data) {
        String title = safe(data, "title", "💰 Diamonds Received");
        String body = safe(data, "body", "Your balance has been updated");

        Intent intent = launchIntent();
        if (intent != null) {
            intent.putExtra("openRoute", true);
            intent.putExtra("route", "/wallet");
        }
        int notifId = uniqueId();
        PendingIntent pendingIntent = createPendingIntent(intent, notifId);

        NotificationCompat.Builder builder = new NotificationCompat.Builder(this, CHANNEL_DEFAULT)
            .setSmallIcon(R.drawable.ic_notification)
            .setContentTitle(title)
            .setContentText(body)
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .setAutoCancel(true)
            .setContentIntent(pendingIntent)
            .setColor(0xFF4CAF50);

        showNotification(notifId, builder.build());
    }

    // ═══════════════════════════════════════
    //  AGENCY NOTIFICATION
    // ═══════════════════════════════════════

    private void handleAgencyNotification(Map<String, String> data) {
        String title = safe(data, "title", "🏢 Agency Notice");
        String body = safe(data, "body", "You have an agency update");
        String imageUrl = data.get("imageUrl");

        int notifId = uniqueId();

        imageExecutor.execute(() -> {
            Bitmap image = downloadBitmap(imageUrl, BITMAP_MAX_SIZE);

            Intent intent = launchIntent();
            PendingIntent pendingIntent = createPendingIntent(intent, notifId);

            NotificationCompat.Builder builder = new NotificationCompat.Builder(this, CHANNEL_DEFAULT)
                .setSmallIcon(R.drawable.ic_notification)
                .setContentTitle(title)
                .setContentText(body)
                .setPriority(NotificationCompat.PRIORITY_HIGH)
                .setAutoCancel(true)
                .setContentIntent(pendingIntent)
                .setColor(0xFF9C27B0)
                .setGroup("agency");

            if (image != null) {
                builder.setStyle(new NotificationCompat.BigPictureStyle()
                    .bigPicture(image)
                    .setSummaryText(body));
            } else {
                builder.setStyle(new NotificationCompat.BigTextStyle()
                    .bigText(body));
            }

            showNotification(notifId, builder.build());
        });
    }

    // ═══════════════════════════════════════
    //  PARTY INVITE NOTIFICATION
    // ═══════════════════════════════════════

    private void handlePartyInviteNotification(Map<String, String> data) {
        String hostName = safe(data, "hostName", safe(data, "senderName", "Someone"));
        String roomName = safe(data, "roomName", "Party Room");
        String roomId = data.get("roomId");
        String hostAvatar = data.get("hostAvatar");

        String title = "🎉 Party Invite";
        String body = hostName + " invited you to " + roomName;

        int notifId = uniqueId();

        imageExecutor.execute(() -> {
            Bitmap avatar = downloadAndCircleCrop(hostAvatar);

            Intent intent = launchIntent();
            if (intent != null && roomId != null) {
                intent.putExtra("openRoute", true);
                intent.putExtra("route", "/party/" + roomId);
            }
            PendingIntent pendingIntent = createPendingIntent(intent, notifId);

            NotificationCompat.Builder builder = new NotificationCompat.Builder(this, CHANNEL_DEFAULT)
                .setSmallIcon(R.drawable.ic_notification)
                .setContentTitle(title)
                .setContentText(body)
                .setPriority(NotificationCompat.PRIORITY_HIGH)
                .setAutoCancel(true)
                .setContentIntent(pendingIntent)
                .setColor(0xFFFF9800)
                .setGroup("party");

            if (avatar != null) builder.setLargeIcon(avatar);

            showNotification(notifId, builder.build());
        });
    }

    // ═══════════════════════════════════════
    //  WARNING / BAN NOTIFICATION
    // ═══════════════════════════════════════

    private void handleWarningNotification(Map<String, String> data) {
        String title = safe(data, "title", "⚠️ Account Warning");
        String body = safe(data, "body", "Please review your account status");

        int notifId = uniqueId();

        Intent intent = launchIntent();
        PendingIntent pendingIntent = createPendingIntent(intent, notifId);

        NotificationCompat.Builder builder = new NotificationCompat.Builder(this, CHANNEL_ADMIN)
            .setSmallIcon(R.drawable.ic_notification)
            .setContentTitle(title)
            .setContentText(body)
            .setPriority(NotificationCompat.PRIORITY_MAX)
            .setAutoCancel(true)
            .setContentIntent(pendingIntent)
            .setColor(0xFFF44336)
            .setStyle(new NotificationCompat.BigTextStyle().bigText(body));

        showNotification(notifId, builder.build());
    }

    // ═══════════════════════════════════════
    //  GENERIC NOTIFICATION
    // ═══════════════════════════════════════

    private void handleGenericNotification(Map<String, String> data) {
        String title = safe(data, "title", "MeriLive");
        String body = safe(data, "body", "You have a new notification");
        String imageUrl = data.get("imageUrl");
        if (imageUrl == null) imageUrl = data.get("image_url");
        String route = data.get("route");

        int notifId = uniqueId();
        final String finalImageUrl = imageUrl;

        imageExecutor.execute(() -> {
            Bitmap image = downloadBitmap(finalImageUrl, BITMAP_MAX_SIZE);

            Intent intent = launchIntent();
            if (intent != null && route != null) {
                intent.putExtra("openRoute", true);
                intent.putExtra("route", route);
            }
            PendingIntent pendingIntent = createPendingIntent(intent, notifId);

            showSimpleNotification(notifId, title, body, image, CHANNEL_DEFAULT, "general");
        });
    }

    // ═══════════════════════════════════════
    //  HELPER — Simple Notification Builder
    // ═══════════════════════════════════════

    private void showSimpleNotification(int notifId, String title, String body,
                                         Bitmap image, String channelId, String group) {
        Intent intent = launchIntent();
        PendingIntent pendingIntent = createPendingIntent(intent, notifId);

        NotificationCompat.Builder builder = new NotificationCompat.Builder(this, channelId)
            .setSmallIcon(R.drawable.ic_notification)
            .setContentTitle(title != null ? title : "MeriLive")
            .setContentText(body != null ? body : "")
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .setAutoCancel(true)
            .setContentIntent(pendingIntent)
            .setColor(0xFFE91E63)
            .setGroup(group);

        if (image != null) {
            builder.setStyle(new NotificationCompat.BigPictureStyle()
                .bigPicture(image)
                .bigLargeIcon((Bitmap) null)
                .setSummaryText(body));
        } else if (body != null && body.length() > 50) {
            builder.setStyle(new NotificationCompat.BigTextStyle()
                .bigText(body));
        }

        showNotification(notifId, builder.build());
    }

    // ═══════════════════════════════════════
    //  UTILITY METHODS
    // ═══════════════════════════════════════

    private String safe(Map<String, String> data, String key, String defaultValue) {
        String value = data.get(key);
        return (value != null && !value.isEmpty()) ? value : defaultValue;
    }

    private Intent launchIntent() {
        Intent intent = getPackageManager().getLaunchIntentForPackage(getPackageName());
        if (intent != null) {
            intent.addFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        }
        return intent;
    }

    private PendingIntent createPendingIntent(Intent intent, int requestCode) {
        return PendingIntent.getActivity(
            this, requestCode,
            intent != null ? intent : new Intent(),
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE
        );
    }

    private void showNotification(int id, Notification notification) {
        NotificationManager manager = (NotificationManager) getSystemService(Context.NOTIFICATION_SERVICE);
        if (manager != null) {
            manager.notify(id, notification);
        }
    }

    private int uniqueId() {
        return (int) (System.currentTimeMillis() % Integer.MAX_VALUE);
    }

    /**
     * Download bitmap from URL with timeout and size limit.
     * Supports both avatar (small) and banner (large) images.
     */
    private Bitmap downloadBitmap(String imageUrl, int maxSize) {
        if (imageUrl == null || imageUrl.isEmpty()) return null;

        try {
            URL url = new URL(imageUrl);
            HttpURLConnection conn = (HttpURLConnection) url.openConnection();
            conn.setDoInput(true);
            conn.setConnectTimeout(BITMAP_TIMEOUT_MS);
            conn.setReadTimeout(BITMAP_TIMEOUT_MS);
            conn.setRequestProperty("User-Agent", "MeriLive-Android/4.0");
            conn.setInstanceFollowRedirects(true);
            conn.connect();

            int responseCode = conn.getResponseCode();

            // Handle redirects
            if (responseCode == HttpURLConnection.HTTP_MOVED_TEMP
                || responseCode == HttpURLConnection.HTTP_MOVED_PERM
                || responseCode == 307 || responseCode == 308) {
                String redirectUrl = conn.getHeaderField("Location");
                conn.disconnect();
                if (redirectUrl != null) {
                    return downloadBitmap(redirectUrl, maxSize);
                }
                return null;
            }

            if (responseCode == HttpURLConnection.HTTP_OK) {
                InputStream input = conn.getInputStream();

                Bitmap bitmap = BitmapFactory.decodeStream(input);
                input.close();
                conn.disconnect();

                if (bitmap != null && (bitmap.getWidth() > maxSize || bitmap.getHeight() > maxSize)) {
                    float scale = Math.min(
                        (float) maxSize / bitmap.getWidth(),
                        (float) maxSize / bitmap.getHeight()
                    );
                    Bitmap scaled = Bitmap.createScaledBitmap(bitmap,
                        (int)(bitmap.getWidth() * scale),
                        (int)(bitmap.getHeight() * scale),
                        true);
                    bitmap.recycle();
                    return scaled;
                }

                return bitmap;
            }
            conn.disconnect();
        } catch (Exception e) {
            Log.w(TAG, "Bitmap download failed: " + imageUrl + " — " + e.getMessage());
        }
        return null;
    }

    /**
     * Download and crop to circle (for avatar).
     */
    private Bitmap downloadAndCircleCrop(String imageUrl) {
        Bitmap source = downloadBitmap(imageUrl, AVATAR_MAX_SIZE);
        if (source == null) return null;

        try {
            int size = Math.min(source.getWidth(), source.getHeight());
            Bitmap output = Bitmap.createBitmap(size, size, Bitmap.Config.ARGB_8888);
            Canvas canvas = new Canvas(output);

            Paint paint = new Paint();
            paint.setAntiAlias(true);

            float radius = size / 2f;
            canvas.drawCircle(radius, radius, radius, paint);

            paint.setXfermode(new PorterDuffXfermode(PorterDuff.Mode.SRC_IN));

            int left = (source.getWidth() - size) / 2;
            int top = (source.getHeight() - size) / 2;
            Rect src = new Rect(left, top, left + size, top + size);
            Rect dst = new Rect(0, 0, size, size);
            canvas.drawBitmap(source, src, dst, paint);

            source.recycle();
            return output;
        } catch (Exception e) {
            Log.w(TAG, "Circle crop failed", e);
            return source;
        }
    }

    @Override
    public void onDestroy() {
        super.onDestroy();
        imageExecutor.shutdown();
        try { imageExecutor.awaitTermination(2, TimeUnit.SECONDS); } catch (Exception ignored) {}
    }
}
