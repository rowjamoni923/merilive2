package com.merilive.app.service;

import android.app.PendingIntent;
import android.content.Intent;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
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

        // Launch full-screen incoming call activity
        Intent fullScreenIntent = new Intent(this, IncomingCallActivity.class);
        fullScreenIntent.setFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        fullScreenIntent.putExtra("caller_id", callerId);
        fullScreenIntent.putExtra("caller_name", callerName);
        fullScreenIntent.putExtra("caller_avatar", callerAvatar);
        fullScreenIntent.putExtra("call_type", callType);
        fullScreenIntent.putExtra("call_id", callId);

        PendingIntent fullScreenPI = PendingIntent.getActivity(
            this, 0, fullScreenIntent,
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);

        // Accept action
        Intent acceptIntent = new Intent(this, MainActivity.class);
        acceptIntent.setFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        acceptIntent.putExtra("action", "accept_call");
        acceptIntent.putExtra("call_id", callId);
        acceptIntent.putExtra("caller_id", callerId);
        PendingIntent acceptPI = PendingIntent.getActivity(
            this, 1, acceptIntent,
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);

        // Decline action
        Intent declineIntent = new Intent(this, com.merilive.app.receiver.CallActionReceiver.class);
        declineIntent.setAction("DECLINE_CALL");
        declineIntent.putExtra("call_id", callId);
        PendingIntent declinePI = PendingIntent.getBroadcast(
            this, 2, declineIntent,
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);

        String callLabel = "video".equals(callType) ? "📹 Video Call" : "📞 Audio Call";

        NotificationCompat.Builder builder = new NotificationCompat.Builder(this, NotificationHelper.CHANNEL_CALLS)
            .setSmallIcon(R.drawable.ic_notification)
            .setContentTitle(callerName)
            .setContentText("Incoming " + callLabel)
            .setPriority(NotificationCompat.PRIORITY_MAX)
            .setCategory(NotificationCompat.CATEGORY_CALL)
            .setAutoCancel(true)
            .setOngoing(true)
            .setFullScreenIntent(fullScreenPI, true)
            .addAction(R.drawable.ic_call_accept, "Accept", acceptPI)
            .addAction(R.drawable.ic_call_decline, "Decline", declinePI)
            .setTimeoutAfter(45000)
            .setDefaults(NotificationCompat.DEFAULT_ALL);

        if (callerAvatar != null && !callerAvatar.isEmpty()) {
            Bitmap avatar = loadBitmapFromUrl(callerAvatar);
            if (avatar != null) builder.setLargeIcon(avatar);
        }

        NotificationManagerCompat.from(this).notify(NotificationHelper.NOTIFICATION_CALL, builder.build());
        startActivity(fullScreenIntent);
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
