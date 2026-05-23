package com.merilive.app.service;

import android.app.Notification;
import android.app.PendingIntent;
import android.app.Service;
import android.content.Intent;
import android.content.pm.ServiceInfo;
import android.os.Build;
import android.os.IBinder;
import androidx.annotation.Nullable;
import androidx.core.app.NotificationCompat;
import androidx.core.app.ServiceCompat;
import com.merilive.app.MainActivity;
import com.merilive.app.R;
import com.merilive.app.util.NotificationHelper;

public class CallForegroundService extends Service {

    public static final String ACTION_START = "com.merilive.app.START_CALL_SERVICE";
    public static final String ACTION_STOP = "com.merilive.app.STOP_CALL_SERVICE";
    private static final int FOREGROUND_NOTIFICATION_ID = 9001;

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        if (intent != null && ACTION_STOP.equals(intent.getAction())) {
            stopForeground(true);
            stopSelf();
            return START_NOT_STICKY;
        }

        String callerName = intent != null ? intent.getStringExtra("caller_name") : "Unknown";
        String callType = intent != null ? intent.getStringExtra("call_type") : "Video Call";
        if (callerName == null) callerName = "Unknown";
        if (callType == null) callType = "Video Call";

        Intent returnIntent = new Intent(this, MainActivity.class);
        returnIntent.setFlags(Intent.FLAG_ACTIVITY_CLEAR_TOP | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        PendingIntent returnPI = PendingIntent.getActivity(
            this, 0, returnIntent,
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);

        Intent endIntent = new Intent(this, CallForegroundService.class);
        endIntent.setAction(ACTION_STOP);
        PendingIntent endPI = PendingIntent.getService(
            this, 1, endIntent,
            PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);

        Notification notification = new NotificationCompat.Builder(this, NotificationHelper.CHANNEL_CALLS)
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
            .setContentIntent(returnPI)
            .addAction(R.drawable.ic_call_decline, "End Call", endPI)
            .build();

        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
            ServiceCompat.startForeground(this, FOREGROUND_NOTIFICATION_ID, notification,
                ServiceInfo.FOREGROUND_SERVICE_TYPE_PHONE_CALL
                    | ServiceInfo.FOREGROUND_SERVICE_TYPE_MICROPHONE
                    | ServiceInfo.FOREGROUND_SERVICE_TYPE_CAMERA);
        } else {
            startForeground(FOREGROUND_NOTIFICATION_ID, notification);
        }

        return START_STICKY;
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
