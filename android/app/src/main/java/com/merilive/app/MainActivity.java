package com.merilive.app;

import android.content.Intent;
import android.content.res.Configuration;
import android.graphics.Color;
import android.os.Build;
import android.os.Bundle;
import android.view.View;
import android.view.Window;
import android.view.WindowManager;
import androidx.core.splashscreen.SplashScreen;
import androidx.core.view.WindowCompat;
import com.merilive.app.plugin.CameraOwnership;
import com.getcapacitor.BridgeActivity;
import com.merilive.app.plugin.LiveKitPlugin;
import com.merilive.app.util.NotificationHelper;
import com.merilive.app.BuildConfig;

public class MainActivity extends BridgeActivity {

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        // Pkg239 / M33 — StrictMode in debug builds only. Catches main-thread
        // disk/network IO + leaked closables/SQLite/registration so they never
        // ship to production. No-op in release (BuildConfig.DEBUG=false).
        if (BuildConfig.DEBUG) {
            android.os.StrictMode.setThreadPolicy(
                new android.os.StrictMode.ThreadPolicy.Builder()
                    .detectDiskReads()
                    .detectDiskWrites()
                    .detectNetwork()
                    .detectCustomSlowCalls()
                    .penaltyLog()
                    .build()
            );
            android.os.StrictMode.setVmPolicy(
                new android.os.StrictMode.VmPolicy.Builder()
                    .detectLeakedSqlLiteObjects()
                    .detectLeakedClosableObjects()
                    .detectLeakedRegistrationObjects()
                    .detectActivityLeaks()
                    .penaltyLog()
                    .build()
            );
        }

        // Pkg231 — Android 12+ native splash screen. Must be installed BEFORE
        // super.onCreate so the system can intercept the window creation.
        SplashScreen.installSplashScreen(this);

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
        registerPlugin(com.merilive.app.plugin.AnalyticsPlugin.class);
        registerPlugin(com.merilive.app.plugin.ShareTargetPlugin.class);
        registerPlugin(com.merilive.app.plugin.PhotoPickerPlugin.class);
        registerPlugin(com.merilive.app.plugin.BackgroundSyncPlugin.class);
        registerPlugin(com.merilive.app.plugin.AppLocalePlugin.class);
        registerPlugin(com.merilive.app.plugin.InAppUpdatePlugin.class);
        registerPlugin(com.merilive.app.plugin.InAppReviewPlugin.class);
        registerPlugin(com.merilive.app.plugin.HibernationPlugin.class);
        registerPlugin(com.merilive.app.plugin.PlayIntegrityPlugin.class);
        registerPlugin(com.merilive.app.plugin.MemoryTrimPlugin.class);
        registerPlugin(com.merilive.app.plugin.AdaptiveRefreshPlugin.class);
        registerPlugin(com.merilive.app.plugin.ConversationShortcutsPlugin.class);
        registerPlugin(com.merilive.app.plugin.LocationPlugin.class);
        registerPlugin(com.merilive.app.plugin.VibrationPlugin.class);
        registerPlugin(com.merilive.app.plugin.ShakeDetectorPlugin.class);
        registerPlugin(com.merilive.app.plugin.NfcPlugin.class);
        registerPlugin(com.merilive.app.plugin.MediaSessionPlugin.class);
        registerPlugin(com.merilive.app.plugin.SecureStoragePlugin.class);
        registerPlugin(com.merilive.app.plugin.TextToSpeechPlugin.class);
        registerPlugin(com.merilive.app.plugin.SpeechRecognizerPlugin.class);
        registerPlugin(com.merilive.app.plugin.DocumentPickerPlugin.class);
        registerPlugin(com.merilive.app.plugin.PrintPlugin.class);
        registerPlugin(com.merilive.app.plugin.CalendarBridgePlugin.class);
        registerPlugin(com.merilive.app.plugin.ContactsPickerPlugin.class);
        registerPlugin(com.merilive.app.plugin.ScreenControlPlugin.class);
        registerPlugin(com.merilive.app.plugin.ProximityLockPlugin.class);
        registerPlugin(com.merilive.app.plugin.AudioFocusPlugin.class);
        registerPlugin(com.merilive.app.plugin.AudioRecorderPlugin.class);
        registerPlugin(com.merilive.app.plugin.NativeSVGAPlugin.class);
        // Pkg426 — Native Android VAP (Tencent alpha-MP4 player). Additive:
        // registered for JS callers, but no existing animation component
        // calls it yet (gated behind vapNativeFlag, default OFF).
        registerPlugin(com.merilive.app.plugin.NativeVAPPlugin.class);
        registerPlugin(com.merilive.app.plugin.NativeLottiePlugin.class);
        registerPlugin(com.merilive.app.plugin.NativeToastPlugin.class);
        registerPlugin(com.merilive.app.plugin.BatteryOptimizationPlugin.class);
        registerPlugin(com.merilive.app.plugin.NativePerformanceOptimizerPlugin.class);


        // Pkg427 — Native Android Reels Player (ExoPlayer / Media3).
        // Additive: registered for JS callers; Reels.tsx only switches to
        // it when reelsNativeFlag is ON (default OFF). Existing WebView
        // <video> path is unchanged for everyone else.
        registerPlugin(com.merilive.app.plugin.NativeReelsPlayerPlugin.class);
        // Pkg428 — Native Image Loader (Glide). Additive prefetch +
        // optional WebView image interceptor. Default OFF; gated by
        // imageNativeFlag. Existing <img> path unchanged for everyone
        // else (web, iOS, older APKs, gated-off cohort).
        registerPlugin(com.merilive.app.plugin.NativeImageLoaderPlugin.class);
        // Pkg430 — Native Storage (SQLiteOpenHelper key/value cache with TTL,
        // namespace, batch ops, WAL). Additive: web/iOS/older APKs keep using
        // localStorage; only opt-in callers using `useNativeStorage` /
        // `nsGetJSON` hit this. No JS bundle reads from it by default.
        registerPlugin(com.merilive.app.plugin.NativeStoragePlugin.class);
        // Pkg431 — WebSocketBridge (OkHttp native socket). Additive transport
        // for Supabase Realtime / Phoenix Channels — survives WebView doze on
        // aggressive OEMs (Xiaomi/Vivo/Oppo). NOT wired into the Supabase
        // client yet; gated by `socketNativeFlag` (default OFF) for a future
        // Pkg integration. Existing WebView WebSocket path unchanged.
        registerPlugin(com.merilive.app.plugin.WebSocketBridgePlugin.class);
        // Pkg432 — NativeChatUI (RecyclerView overlay for 1000+ message
        // threads at 60fps). Additive: no JS caller wires it by default;
        // gated by `chatUINativeFlag` (localStorage 'chatui:native'='on').
        // Existing Chat.tsx React UI unchanged.
        registerPlugin(com.merilive.app.plugin.NativeChatUIPlugin.class);
        // Pkg433 — NativeFeed (RecyclerView 2-col grid + Glide thumbnails
        // for Home/Discover). Additive: no JS caller wires it by default;
        // gated by `feedNativeFlag` (localStorage 'feed:native'='on').
        // Existing Index.tsx / Discover.tsx React grids unchanged.
        registerPlugin(com.merilive.app.plugin.NativeFeedPlugin.class);
        // Pkg434 — NativeRouterShell (native top-bar + bottom-tab overlay
        // on decorView). Additive: WebView still renders route content,
        // React Router still drives nav. Gated by `routerShellNativeFlag`
        // (localStorage 'routerShell:native'='on'). Default OFF — no JS
        // caller opens it unless explicitly opted in.
        registerPlugin(com.merilive.app.plugin.NativeRouterShellPlugin.class);
        registerPlugin(com.merilive.app.plugin.NativeGiftPanelPlugin.class);




        super.onCreate(savedInstanceState);

        // Pkg214 — cold-start share intent
        com.merilive.app.plugin.ShareTargetPlugin.handleIntent(getIntent());
        if (isShareIntent(getIntent())) {
            routeToShare();
        }

        // Pkg227 — edge-to-edge (Android 15 enforces this when targetSdk=35;
        // we opt in now for consistent behavior on 14 too). System bars stay
        // transparent; JS already pads via env(safe-area-inset-*).
        WindowCompat.setDecorFitsSystemWindows(getWindow(), false);
        Window window = getWindow();
        window.setStatusBarColor(Color.TRANSPARENT);
        window.setNavigationBarColor(Color.TRANSPARENT);
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            window.setStatusBarContrastEnforced(false);
            window.setNavigationBarContrastEnforced(false);
        }

        // SECURITY: Block screenshots & screen recording
        getWindow().setFlags(
            WindowManager.LayoutParams.FLAG_SECURE,
            WindowManager.LayoutParams.FLAG_SECURE
        );

        // Setup notification channels
        NotificationHelper.createNotificationChannels(this);

        // Pkg-fix: allow muted autoplay for in-app <video> previews (LiveKit /
        // GoLive / Party / Face Verify / Reels). Without this the WebView
        // injects a native play-icon overlay on every video surface.
        try {
            if (getBridge() != null && getBridge().getWebView() != null) {
                android.webkit.WebSettings ws = getBridge().getWebView().getSettings();
                ws.setMediaPlaybackRequiresUserGesture(false);
            }
        } catch (Throwable ignored) {}

        // Handle notification route on cold start
        handleNotificationRoute(getIntent());
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        com.merilive.app.plugin.ShareTargetPlugin.handleIntent(intent);
        if (isShareIntent(intent)) {
            routeToShare();
            return;
        }
        handleNotificationRoute(intent);
    }

    private boolean isShareIntent(Intent intent) {
        if (intent == null) return false;
        String a = intent.getAction();
        return Intent.ACTION_SEND.equals(a) || Intent.ACTION_SEND_MULTIPLE.equals(a);
    }

    private void routeToShare() {
        // Defer until WebView ready
        getWindow().getDecorView().post(() -> navigateWebView("/share"));
    }

    @Override
    public void onResume() {
        super.onResume();
        getWindow().setFlags(
            WindowManager.LayoutParams.FLAG_SECURE,
            WindowManager.LayoutParams.FLAG_SECURE
        );
    }

    @Override
    protected void onDestroy() {
        try {
            CameraOwnership.forceRelease();
        } catch (Throwable ignored) {}
        super.onDestroy();
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
