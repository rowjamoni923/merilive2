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
        registerPlugin(com.merilive.app.plugin.NativeCallPlugin.class);
        registerPlugin(com.merilive.app.plugin.InstallReferrerPlugin.class);
        registerPlugin(com.merilive.app.plugin.GPUPixelBeautyPlugin.class);
        registerPlugin(com.merilive.app.plugin.NativeMessageReplyPlugin.class);
        registerPlugin(com.merilive.app.plugin.BiometricAuthPlugin.class);
        registerPlugin(com.merilive.app.plugin.ScreenCaptureDetectorPlugin.class);

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

    // Step 29 — Picture-in-Picture lifecycle. Forward both events to
    // LiveKitPlugin so it can (a) auto-enter PiP on user-leave when the
    // host opted in for an active call, and (b) emit pip-changed events
    // to JS so the in-call UI can collapse/expand.
    @Override
    public void onUserLeaveHint() {
        super.onUserLeaveHint();
        LiveKitPlugin.notifyUserLeaveHint(this);
    }

    @Override
    public void onPictureInPictureModeChanged(boolean isInPictureInPictureMode, Configuration newConfig) {
        super.onPictureInPictureModeChanged(isInPictureInPictureMode, newConfig);
        LiveKitPlugin.notifyPipModeChanged(isInPictureInPictureMode);
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
            navigateWebView("/");
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
