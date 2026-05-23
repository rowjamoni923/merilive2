package com.merilive.app.service;

import android.app.Notification;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Intent;
import android.content.pm.ServiceInfo;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.os.Build;
import android.os.IBinder;
import android.util.Log;

import androidx.annotation.Nullable;
import androidx.core.app.NotificationCompat;
import androidx.core.app.NotificationManagerCompat;
import androidx.core.app.Person;
import androidx.core.app.ServiceCompat;
import androidx.core.graphics.drawable.IconCompat;

import com.merilive.app.MainActivity;
import com.merilive.app.R;
import com.merilive.app.receiver.CallActionReceiver;
import com.merilive.app.util.NotificationHelper;

import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;

/**
 * Pkg220 — M15 CallStyle (ongoing).
 * Active-call foreground notification now uses Android 12+ CallStyle.forOngoingCall
 * so the heads-up matches the system call UI (large avatar, chronometer, CallKit-style
 * hang-up button). Hang-up routes through CallActionReceiver so JS + Telecom learn
 * about the end and the call is properly torn down everywhere.
 */
public class CallForegroundService extends Service {

    private static final String TAG = "CallFGS";
    public static final String ACTION_START = "com.merilive.app.START_CALL_SERVICE";
    public static final String ACTION_STOP = "com.merilive.app.STOP_CALL_SERVICE";
    private static final int FOREGROUND_NOTIFICATION_ID = 9001;

    private String currentCallId = "";
    private String currentCallerId = "";
    private String currentCallerName = "";
    private String currentCallType = "";

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        if (intent != null && ACTION_STOP.equals(intent.getAction())) {
            stopForeground(true);
            stopSelf();
            return START_NOT_STICKY;
        }

        String callerName = intent != null ? intent.getStringExtra("caller_name") : null;
        String callType = intent != null ? intent.getStringExtra("call_type") : null;
        String callerAvatar = intent != null ? intent.getStringExtra("caller_avatar") : null;
        String callId = intent != null ? intent.getStringExtra("call_id") : null;
        String callerId = intent != null ? intent.getStringExtra("caller_id") : null;
        if (callerName == null || callerName.isEmpty()) callerName = "Live session";
        if (callType == null || callType.isEmpty()) callType = "Call";
        if (callId == null) callId = "";
        if (callerId == null) callerId = "";

        currentCallId = callId;
        currentCallerId = callerId;
        currentCallerName = callerName;
        currentCallType = callType;

        Notification notification = buildNotification(callerName, callType, callId, callerId, null);

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
            ServiceCompat.startForeground(this, FOREGROUND_NOTIFICATION_ID, notification,
                ServiceInfo.FOREGROUND_SERVICE_TYPE_PHONE_CALL
                    | ServiceInfo.FOREGROUND_SERVICE_TYPE_MICROPHONE
                    | ServiceInfo.FOREGROUND_SERVICE_TYPE_CAMERA);
        } else {
            startForeground(FOREGROUND_NOTIFICATION_ID, notification);
        }

        // Async-load avatar then re-issue the same notification id so the
        // ongoing call heads-up upgrades to the avatar-rich CallStyle render.
        if (callerAvatar != null && !callerAvatar.isEmpty()) {
            final String avatarUrl = callerAvatar;
            new Thread(() -> {
                Bitmap bmp = loadBitmapFromUrl(avatarUrl);
                if (bmp == null) return;
                try {
                    Notification withAvatar = buildNotification(
                        currentCallerName, currentCallType, currentCallId, currentCallerId, bmp);
                    NotificationManagerCompat.from(getApplicationContext())
                        .notify(FOREGROUND_NOTIFICATION_ID, withAvatar);
                } catch (Throwable t) {
                    Log.w(TAG, "avatar re-notify failed: " + t.getMessage());
                }
            }, "CallFGS-avatar").start();
        }

        return START_STICKY;
    }

    private Notification buildNotification(String callerName, String callType,
                                           String callId, String callerId, @Nullable Bitmap avatar) {
        Intent returnIntent = new Intent(this, MainActivity.class);
        returnIntent.setFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        PendingIntent returnPI = PendingIntent.getActivity(
            this, 0, returnIntent,
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);

        // Hang-up routes through CallActionReceiver (DECLINE path) so JS and
        // Telecom are notified — not just the FGS stopped.
        Intent hangupIntent = new Intent(this, CallActionReceiver.class);
        hangupIntent.setAction(CallActionReceiver.ACTION_DECLINE);
        hangupIntent.putExtra("call_id", callId);
        hangupIntent.putExtra("caller_id", callerId);
        hangupIntent.putExtra("caller_name", callerName);
        hangupIntent.putExtra("call_type", callType);
        PendingIntent hangupPI = PendingIntent.getBroadcast(
            this, ("hangup:" + callId).hashCode(), hangupIntent,
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);

        NotificationCompat.Builder builder = new NotificationCompat.Builder(this, NotificationHelper.CHANNEL_CALLS)
            .setSmallIcon(R.drawable.ic_notification)
            .setColor(NotificationHelper.BRAND_COLOR)
            .setColorized(true)
            .setContentTitle("Call in progress")
            .setContentText(callType + " with " + callerName)
            .setOngoing(true)
            .setUsesChronometer(true)
            .setShowWhen(true)
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .setCategory(NotificationCompat.CATEGORY_CALL)
            .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
            .setContentIntent(returnPI);

        boolean styleApplied = false;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            try {
                Person.Builder pb = new Person.Builder().setName(callerName).setImportant(true);
                if (avatar != null) pb.setIcon(IconCompat.createWithBitmap(avatar));
                Person person = pb.build();
                builder.setStyle(NotificationCompat.CallStyle.forOngoingCall(person, hangupPI));
                styleApplied = true;
            } catch (Throwable t) {
                Log.w(TAG, "CallStyle.forOngoingCall unavailable: " + t.getMessage());
            }
        }
        if (!styleApplied) {
            builder.addAction(R.drawable.ic_call_decline, "End Call", hangupPI);
            if (avatar != null) builder.setLargeIcon(avatar);
        }

        return builder.build();
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

    @Nullable
    @Override
    public IBinder onBind(Intent intent) { return null; }

    @Override
    public void onDestroy() {
        super.onDestroy();
        stopForeground(true);
    }
}
