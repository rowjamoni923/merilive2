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
        Log.d(TAG, "FCM Token refreshed: " + token);
    }

    @Override
    public void onMessageReceived(@NonNull RemoteMessage remoteMessage) {
        super.onMessageReceived(remoteMessage);

        Map<String, String> data = remoteMessage.getData();
        String type = data.containsKey("type") ? data.get("type") : "default";
        String title = data.containsKey("title") ? data.get("title") : "MeriLive";
        String body = data.containsKey("body") ? data.get("body") : "";

        if (type == null) type = "default";

        switch (type) {
            case "incoming_call":
                handleIncomingCall(data);
                break;
            case "message":
                handleMessage(data, title, body);
                break;
            case "gift":
                handleGift(data);
                break;
            case "live_start":
                handleLiveStart(data);
                break;
            default:
                handleGeneral(title, body, NotificationHelper.CHANNEL_DEFAULT);
                break;
        }

        // Also handle Firebase notification payload if present
        if (remoteMessage.getNotification() != null && !"incoming_call".equals(type)) {
            String nTitle = remoteMessage.getNotification().getTitle();
            String nBody = remoteMessage.getNotification().getBody();
            if (nTitle != null) {
                handleGeneral(nTitle, nBody != null ? nBody : "", NotificationHelper.CHANNEL_DEFAULT);
            }
        }
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
        acceptIntent.putExtra("call_type", callType);
        PendingIntent acceptPI = PendingIntent.getBroadcast(
            this, ("accept:" + callId).hashCode(), acceptIntent,
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);

        Intent declineIntent = new Intent(this, com.merilive.app.receiver.CallActionReceiver.class);
        declineIntent.setAction(com.merilive.app.receiver.CallActionReceiver.ACTION_DECLINE);
        declineIntent.putExtra("call_id", callId);
        declineIntent.putExtra("caller_id", callerId);
        declineIntent.putExtra("caller_name", callerName);
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
    }

    private void handleMessage(Map<String, String> data, String title, String body) {
        String senderId = data.containsKey("sender_id") ? data.get("sender_id") : "";
        int notifId = NotificationHelper.NOTIFICATION_MESSAGE + (senderId != null ? senderId.hashCode() % 1000 : 0);
        NotificationHelper.showMessageNotification(this, title, body, senderId, notifId);
    }

    private void handleGift(Map<String, String> data) {
        String senderName = data.containsKey("sender_name") ? data.get("sender_name") : "Someone";
        String giftName = data.containsKey("gift_name") ? data.get("gift_name") : "a gift";
        int giftValue = 0;
        try {
            String val = data.get("gift_value");
            if (val != null) giftValue = Integer.parseInt(val);
        } catch (NumberFormatException ignored) {}
        NotificationHelper.showGiftNotification(this, senderName, giftName, giftValue);
    }

    private void handleLiveStart(Map<String, String> data) {
        String hostName = data.containsKey("host_name") ? data.get("host_name") : "Someone";
        String roomId = data.containsKey("room_id") ? data.get("room_id") : "";
        NotificationHelper.showLiveNotification(this, hostName, roomId);
    }

    private void handleGeneral(String title, String body, String channelId) {
        Intent intent = new Intent(this, MainActivity.class);
        intent.setFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        PendingIntent pi = PendingIntent.getActivity(
            this, 0, intent,
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);

        NotificationCompat.Builder builder = new NotificationCompat.Builder(this, channelId)
            .setSmallIcon(R.drawable.ic_notification)
            .setContentTitle(title)
            .setContentText(body)
            .setAutoCancel(true)
            .setPriority(NotificationCompat.PRIORITY_DEFAULT)
            .setContentIntent(pi);

        int notifId = (int) System.currentTimeMillis() % 100000;
        NotificationManagerCompat.from(this).notify(notifId, builder.build());
    }

    private Bitmap loadBitmapFromUrl(String urlString) {
        try {
            URL url = new URL(urlString);
            HttpURLConnection conn = (HttpURLConnection) url.openConnection();
            conn.setDoInput(true);
            conn.setConnectTimeout(5000);
            conn.setReadTimeout(5000);
            conn.connect();
            InputStream input = conn.getInputStream();
            return BitmapFactory.decodeStream(input);
        } catch (Exception e) {
            return null;
        }
    }
}
