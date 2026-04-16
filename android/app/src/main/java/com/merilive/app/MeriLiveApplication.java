package com.merilive.app;

import android.app.Application;
import com.google.firebase.FirebaseApp;
import com.merilive.app.util.NotificationHelper;

public class MeriLiveApplication extends Application {

    @Override
    public void onCreate() {
        super.onCreate();
        FirebaseApp.initializeApp(this);
        NotificationHelper.createNotificationChannels(this);
    }
}
