package com.merilive.app;

import android.content.Intent;
import android.content.res.Configuration;
import android.os.Bundle;
import android.view.WindowManager;
import com.getcapacitor.BridgeActivity;
import com.merilive.app.plugin.LiveKitPlugin;
import com.merilive.app.util.NotificationHelper;

public class MainActivity extends BridgeActivity {

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        registerPlugin(com.merilive.app.plugin.PlayStoreBillingPlugin.class);
        registerPlugin(com.merilive.app.plugin.NativePermissionsPlugin.class);
        registerPlugin(com.merilive.app.plugin.NativeCameraPlugin.class);
        registerPlugin(com.merilive.app.plugin.LiveKitPlugin.class);

        super.onCreate(savedInstanceState);

        // SECURITY: Block screenshots & screen recording
        getWindow().setFlags(
            WindowManager.LayoutParams.FLAG_SECURE,
            WindowManager.LayoutParams.FLAG_SECURE
        );

        // Setup notification channels
        NotificationHelper.createNotificationChannels(this);

        // Handle notification route on cold start
        handleNotificationRoute(getIntent());
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        handleNotificationRoute(intent);
    }

    @Override
    public void onResume() {
        super.onResume();
        getWindow().setFlags(
            WindowManager.LayoutParams.FLAG_SECURE,
            WindowManager.LayoutParams.FLAG_SECURE
        );
    }

    private void handleNotificationRoute(Intent intent) {
        if (intent == null) return;

        String linkUrl = intent.getStringExtra("link_url");
        String route = intent.getStringExtra("route");
        String navigateTo = intent.getStringExtra("navigate_to");

        if (linkUrl != null && !linkUrl.isEmpty()) {
            if (linkUrl.startsWith("http")) {
                Intent browserIntent = new Intent(Intent.ACTION_VIEW, android.net.Uri.parse(linkUrl));
                startActivity(browserIntent);
            } else {
                navigateWebView(linkUrl);
            }
            intent.removeExtra("link_url");
        } else if (route != null && !route.isEmpty()) {
            navigateWebView(route);
            intent.removeExtra("route");
        } else if (navigateTo != null && !navigateTo.isEmpty()) {
            navigateWebView(navigateTo);
            intent.removeExtra("navigate_to");
        } else if (intent.getBooleanExtra("open_call", false)) {
            String callId = intent.getStringExtra("call_id");
            String callerId = intent.getStringExtra("caller_id");
            String callType = intent.getStringExtra("call_type");
            if (callType == null) callType = "video";
            navigateWebView("/call/" + callId + "?caller=" + callerId + "&type=" + callType);
            intent.removeExtra("open_call");
        }
    }

    private void navigateWebView(String path) {
        if (getBridge() == null || getBridge().getWebView() == null) return;
        String baseUrl = getBridge().getServerUrl();
        if (baseUrl == null) return;
        getBridge().getWebView().loadUrl(baseUrl + path);
    }
}
