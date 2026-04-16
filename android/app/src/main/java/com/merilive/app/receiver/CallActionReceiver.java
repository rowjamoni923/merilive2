package com.merilive.app.receiver;

import android.app.NotificationManager;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import com.merilive.app.service.CallForegroundService;
import com.merilive.app.util.NotificationHelper;

public class CallActionReceiver extends BroadcastReceiver {
    @Override
    public void onReceive(Context context, Intent intent) {
        if ("DECLINE_CALL".equals(intent.getAction())) {
            NotificationManager nm = (NotificationManager)
                context.getSystemService(Context.NOTIFICATION_SERVICE);
            if (nm != null) nm.cancel(NotificationHelper.NOTIFICATION_CALL);

            Intent stopService = new Intent(context, CallForegroundService.class);
            stopService.setAction(CallForegroundService.ACTION_STOP);
            context.startService(stopService);
        }
    }
}
