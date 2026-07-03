package com.merilive.app;

import android.content.Intent;
import android.content.res.Configuration;
import android.graphics.Color;
import android.os.Build;
import android.os.Bundle;
import android.view.View;
import android.view.Window;
import android.view.WindowManager;
import android.webkit.WebSettings;
import android.webkit.WebView;
import androidx.core.splashscreen.SplashScreen;
import androidx.core.view.WindowCompat;
// CameraOwnership removed in 2026-06-14 rebuild — no arbiter needed.
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
        registerPlugin(com.merilive.app.plugin.ViewerSessionPlugin.class);
        registerPlugin(com.merilive.app.plugin.NativeCallPlugin.class);
        registerPlugin(com.merilive.app.plugin.InstallReferrerPlugin.class);
        // Camera rebuild 2026-06-14: native beauty is intentionally NOT
        // registered. Streaming camera is owned only by LiveKitPlugin;
        // Face Verification alone uses NativeCameraPlugin/CameraX.
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
        // Pkg438 — unified native gift + entry animation overlays.
        registerPlugin(com.merilive.app.plugin.NativeGiftAnimationPlugin.class);
        registerPlugin(com.merilive.app.plugin.NativeEntryAnimationPlugin.class);
        // Pkg438 Phase C — animated heart sprites for Reels double-tap like.
        registerPlugin(com.merilive.app.plugin.NativeHeartBurstPlugin.class);
        registerPlugin(com.merilive.app.plugin.NativeToastPlugin.class);
        registerPlugin(com.merilive.app.plugin.BatteryOptimizationPlugin.class);
        registerPlugin(com.merilive.app.plugin.NativePerformanceOptimizerPlugin.class);
        registerPlugin(com.merilive.app.plugin.DeepLinkHandlerPlugin.class);
        registerPlugin(com.merilive.app.plugin.NativeSpeedOptimizerPlugin.class);
        registerPlugin(com.merilive.app.plugin.NativeCrashReporterPlugin.class);


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
        registerPlugin(com.merilive.app.plugin.ImageCropperPlugin.class);
        // Pkg441 — Phase-1 live-streaming stability
        registerPlugin(com.merilive.app.plugin.NetworkQualityPlugin.class);
        registerPlugin(com.merilive.app.plugin.ThermalBatteryPlugin.class);
        // Pkg442 — Phase-2 PiP + headset routing
        registerPlugin(com.merilive.app.plugin.PictureInPicturePlugin.class);
        registerPlugin(com.merilive.app.plugin.HeadsetRoutingPlugin.class);
        // Video sub-namespace — security shields for billing + streaming.
        registerPlugin(com.merilive.app.plugin.video.NativeBillingSecurityPlugin.class);
        registerPlugin(com.merilive.app.plugin.video.NativeSecurityShieldPlugin.class);




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

        // Android instant-start policy: the packaged dist/ assets should come
        // from WebView's HTTP/cache store immediately on repeat launch, while
        // dynamic Supabase/LiveKit requests still use normal network freshness.
        // This also keeps the compositor black/transparent instead of default
        // white while React is mounting.
        try {
            if (getBridge() != null && getBridge().getWebView() != null) {
                WebView webView = getBridge().getWebView();
                WebSettings ws = webView.getSettings();
                ws.setMediaPlaybackRequiresUserGesture(false);
                ws.setCacheMode(WebSettings.LOAD_DEFAULT);
                ws.setDomStorageEnabled(true);
                ws.setDatabaseEnabled(true);
                ws.setLoadsImagesAutomatically(true);
                ws.setBlockNetworkImage(false);
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                    ws.setOffscreenPreRaster(true);
                }
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                    webView.setRendererPriorityPolicy(WebView.RENDERER_PRIORITY_IMPORTANT, true);
                }
                webView.setLayerType(View.LAYER_TYPE_HARDWARE, null);
                webView.setBackgroundColor(Color.TRANSPARENT);
            }
        } catch (Throwable ignored) {}

        // Phase 2B — install the WebView permission gate so any stray
        // 2026-06-14 rebuild: WebViewPermissionGate removed along with the
        // rtc/ folder. The minimal LiveKit plugin owns Camera2 directly via
        // the SDK, so there is no in-WebView getUserMedia path to gate.

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
        // CameraOwnership.forceRelease() removed in 2026-06-14 rebuild —
        // LiveKit SDK owns camera teardown internally.
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
        com.merilive.app.plugin.PictureInPicturePlugin.notifyModeChanged(isInPictureInPictureMode);
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
