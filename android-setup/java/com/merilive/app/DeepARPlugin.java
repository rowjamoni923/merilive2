package com.merilive.app;

import android.Manifest;
import android.annotation.SuppressLint;
import android.app.Activity;
import android.app.ActivityManager;
import android.content.Context;
import android.content.pm.PackageManager;
import android.graphics.Bitmap;
import android.graphics.ImageFormat;
import android.graphics.Rect;
import android.hardware.camera2.CameraAccessException;
import android.hardware.camera2.CameraCaptureSession;
import android.hardware.camera2.CameraCharacteristics;
import android.hardware.camera2.CameraDevice;
import android.hardware.camera2.CameraManager;
import android.hardware.camera2.CaptureRequest;
import android.hardware.camera2.params.StreamConfigurationMap;
import android.media.Image;
import android.media.ImageReader;
import android.os.Build;
import android.os.Handler;
import android.os.HandlerThread;
import android.os.Looper;
import android.util.Log;
import android.util.Size;
import android.view.Display;
import android.view.Gravity;
import android.view.OrientationEventListener;
import android.view.Surface;
import android.view.SurfaceHolder;
import android.view.SurfaceView;
import android.view.View;
import android.view.ViewGroup;
import android.view.WindowManager;
import android.widget.FrameLayout;

import androidx.annotation.NonNull;
import androidx.core.content.ContextCompat;

import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;

import java.io.InputStream;
import java.nio.ByteBuffer;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Collections;
import java.util.List;
import java.util.Locale;
import java.util.concurrent.Semaphore;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.concurrent.atomic.AtomicLong;

import ai.deepar.ar.ARErrorType;
import ai.deepar.ar.AREventListener;
import ai.deepar.ar.DeepAR;
import ai.deepar.ar.DeepARImageFormat;

/**
 * ╔══════════════════════════════════════════════════════════════╗
 * ║       MeriLive DeepAR Camera Plugin — v5.0 ULTRA            ║
 * ╠══════════════════════════════════════════════════════════════╣
 * ║                                                              ║
 * ║  v5.0 Fixes & Improvements:                                  ║
 * ║   🔧 AUTO-TRANSPARENCY: startCamera() automatically sets    ║
 * ║      WebView transparent — no separate showNativeSurface()  ║
 * ║      call needed (fixes "logo instead of camera" bug)       ║
 * ║   🔧 SURFACE Z-ORDER: Proper layering so native surface    ║
 * ║      always renders behind WebView overlay                  ║
 * ║   🔧 CAMERA READY EVENT: JS gets notified when first       ║
 * ║      frame is actually rendered                             ║
 * ║   🚀 FAST START: Camera thread pre-warmed, parallel init   ║
 * ║   🚀 HD QUALITY: Improved resolution selection + HDR       ║
 * ║   🛡️ CRASH GUARD: Full lifecycle checks everywhere         ║
 * ║   🎨 BEAUTY: Enhanced parameter application pipeline       ║
 * ║                                                              ║
 * ╚══════════════════════════════════════════════════════════════╝
 */
@CapacitorPlugin(
    name = "DeepAR",
    permissions = {
        @Permission(strings = { Manifest.permission.CAMERA }, alias = "camera")
    }
)
public class DeepARPlugin extends Plugin implements AREventListener {

    private static final String TAG = "MeriLive_DeepAR";
    private static final String DEEPAR_LICENSE_KEY = "cf1eb9f4e2d9a7fdd208d71e4232eb8d05e09b2e2f9b1de6cc28fb93f0c824c65c9bcc7cfbe0c797";
    private static final int TARGET_WIDTH = 1080;
    private static final int TARGET_HEIGHT = 1920;
    private static final int MAX_IMAGE_READER_BUFFERS = 4;
    private static final long CAMERA_LOCK_TIMEOUT_MS = 2500;
    private static final int ZOOM_ENFORCE_INTERVAL_MS = 2000;

    private static final String[] BEAUTY_KEYS = {
        "smoothness", "whitening", "redness", "eyeEnlarge",
        "faceSlim", "chinSlim", "noseNarrow", "lipColor"
    };

    private static final String[] DEEPAR_NAMES = {
        "Skin Smoothing", "Skin Whitening", "Redness", "Eye Enlargement",
        "Face Slim", "Chin Slim", "Nose Narrow", "Lip Color"
    };

    private final AtomicBoolean isInitialized = new AtomicBoolean(false);
    private final AtomicBoolean isCameraRunning = new AtomicBoolean(false);
    private final AtomicBoolean isCameraOpening = new AtomicBoolean(false);
    private final AtomicBoolean isCaptureSessionConfigured = new AtomicBoolean(false);
    private final AtomicBoolean isBeautyEffectLoaded = new AtomicBoolean(false);
    private final AtomicBoolean isBeautyRuntimeParamsEnabled = new AtomicBoolean(true);
    private final AtomicBoolean isProcessingFrame = new AtomicBoolean(false);
    private final AtomicBoolean firstFrameRendered = new AtomicBoolean(false);
    private final AtomicBoolean sdkAvailable = new AtomicBoolean(true); // v5.1: SDK availability flag

    private final AtomicLong frameCount = new AtomicLong(0);
    private final AtomicLong droppedFrames = new AtomicLong(0);
    private final AtomicLong fpsFrames = new AtomicLong(0);
    private final AtomicLong fpsTime = new AtomicLong(0);

    private final AtomicInteger currentDeviceOrientation = new AtomicInteger(0);

    private DeepAR deepAR;
    private SurfaceView nativeSurfaceView;
    private boolean isFrontCamera = true;
    private boolean isPaused = false;

    private CameraManager cameraManager;
    private CameraDevice cameraDevice;
    private CameraCaptureSession captureSession;
    private ImageReader imageReader;
    private CaptureRequest.Builder currentRequestBuilder;
    private Rect sensorActiveArraySize;
    private int sensorOrientation = 0;
    private String currentCameraId;

    private HandlerThread cameraThread;
    private Handler cameraHandler;
    private Handler mainHandler;
    private Handler zoomEnforceHandler;
    private Runnable zoomEnforceRunnable;

    private OrientationEventListener orientationListener;

    private final Semaphore cameraLock = new Semaphore(1);
    private final float[] beautyParams = new float[8];
    private byte[] reusableNv21Buffer;
    private ByteBuffer reusableDirectNv21Buffer;

    public interface OnFrameAvailableListener {
        void onFrameAvailable(byte[] frameData, int width, int height);
    }

    private OnFrameAvailableListener frameListener;

    public void setOnFrameAvailableListener(OnFrameAvailableListener listener) {
        this.frameListener = listener;
    }

    @Override
    public void load() {
        super.load();
        try {
            // v5.1: Verify DeepAR SDK classes are actually loadable
            Class.forName("ai.deepar.ar.DeepAR");
            
            cameraManager = (CameraManager) getContext().getSystemService(Context.CAMERA_SERVICE);
            mainHandler = new Handler(Looper.getMainLooper());
            // Pre-warm camera thread for faster first-start
            startCameraThreadIfNeeded();
            setupOrientationListener();
            sdkAvailable.set(true);
            Log.i(TAG, "╔══════════════════════════════╗");
            Log.i(TAG, "║  DeepAR v5.1 ULTRA loaded    ║");
            Log.i(TAG, "╚══════════════════════════════╝");
        } catch (ClassNotFoundException e) {
            sdkAvailable.set(false);
            Log.e(TAG, "╔══════════════════════════════════════════╗");
            Log.e(TAG, "║  ❌ DeepAR SDK NOT FOUND — disabled      ║");
            Log.e(TAG, "║  deepar.aar missing from app/libs/       ║");
            Log.e(TAG, "╚══════════════════════════════════════════╝");
            // Still set up basic handlers so plugin methods don't NPE
            cameraManager = (CameraManager) getContext().getSystemService(Context.CAMERA_SERVICE);
            mainHandler = new Handler(Looper.getMainLooper());
        } catch (Throwable t) {
            sdkAvailable.set(false);
            Log.e(TAG, "❌ DeepAR load() fatal error — SDK disabled", t);
            cameraManager = (CameraManager) getContext().getSystemService(Context.CAMERA_SERVICE);
            mainHandler = new Handler(Looper.getMainLooper());
        }
    }

    // ═══════════════════════════════════════════════════════════
    //  INITIALIZE — DeepAR engine start
    // ═══════════════════════════════════════════════════════════

    @PluginMethod
    public void initialize(PluginCall call) {
        // v5.1: Check SDK availability first
        if (!sdkAvailable.get()) {
            call.reject("DeepAR SDK not available. deepar.aar missing from app/libs/");
            return;
        }

        if (isInitialized.get()) {
            call.resolve(ok("Already initialized"));
            return;
        }

        if (isEmulatorEnvironment()) {
            call.reject("DeepAR is blocked on emulator. Use real Android device.");
            return;
        }

        Activity activity = getActivity();
        if (activity == null || activity.isFinishing() || activity.isDestroyed()) {
            call.reject("Activity not available");
            return;
        }

        activity.runOnUiThread(() -> {
            try {
                startCameraThreadIfNeeded();

                deepAR = new DeepAR(getContext());
                deepAR.setLicenseKey(DEEPAR_LICENSE_KEY);
                deepAR.initialize(getContext(), this);

                createNativeSurfaceIfNeeded();
                isInitialized.set(true);

                Log.i(TAG, "✅ DeepAR initialized successfully");
                call.resolve(ok("DeepAR initialized"));
            } catch (UnsatisfiedLinkError ule) {
                // v5.1: Native library (.so) missing or incompatible
                sdkAvailable.set(false);
                Log.e(TAG, "❌ DeepAR native library error — SDK disabled", ule);
                call.reject("DeepAR native library failed: " + ule.getMessage());
            } catch (Exception e) {
                Log.e(TAG, "❌ initialize failed", e);
                call.reject("initialize failed: " + e.getMessage());
            }
        });
    }

    // ═══════════════════════════════════════════════════════════
    //  START CAMERA — v5.0: Auto-transparency + fast start
    // ═══════════════════════════════════════════════════════════

    @PluginMethod
    public void startCamera(PluginCall call) {
        if (!isInitialized.get()) {
            call.reject("Not initialized");
            return;
        }

        if (isEmulatorEnvironment()) {
            call.reject("DeepAR is blocked on emulator. Use real Android device.");
            return;
        }

        if (isCameraRunning.get()) {
            call.resolve(ok("Camera already running"));
            return;
        }

        if (isCameraOpening.get()) {
            call.resolve(ok("Camera opening in progress"));
            return;
        }

        if (!hasCameraPermission()) {
            requestPermissionForAlias("camera", call, "cameraPermissionCallback");
            return;
        }

        Activity activity = getActivity();
        if (activity == null || activity.isFinishing() || activity.isDestroyed()) {
            call.reject("Activity not available");
            return;
        }

        activity.runOnUiThread(() -> {
            try {
                setWebViewTransparent(true);

                if (nativeSurfaceView == null) {
                    createNativeSurfaceIfNeeded();
                }

                if (nativeSurfaceView != null) {
                    nativeSurfaceView.setVisibility(View.VISIBLE);
                    nativeSurfaceView.setZOrderOnTop(false);
                    nativeSurfaceView.setZOrderMediaOverlay(false);
                }

                if (cameraDevice != null || captureSession != null || imageReader != null) {
                    closeCamera();
                }

                // Always start with front camera for host preview
                isFrontCamera = true;

                // Ensure no sticker/background effect is active by default
                if (deepAR != null) {
                    try { deepAR.switchEffect("effect", (String) null); } catch (Exception ignored) {}
                }

                // Reset state
                isCaptureSessionConfigured.set(false);
                isCameraRunning.set(false);
                firstFrameRendered.set(false);

                boolean openRequested = openCamera();
                if (!openRequested) {
                    if (nativeSurfaceView != null) nativeSurfaceView.setVisibility(View.GONE);
                    setWebViewTransparent(false);
                    call.reject("Failed to open camera hardware");
                    return;
                }

                frameCount.set(0);
                droppedFrames.set(0);
                fpsFrames.set(0);
                fpsTime.set(System.currentTimeMillis());

                Log.i(TAG, "✅ Camera start requested");
                call.resolve(ok("Camera starting..."));
            } catch (Exception e) {
                Log.e(TAG, "❌ startCamera failed", e);
                isCameraRunning.set(false);
                isCaptureSessionConfigured.set(false);
                if (nativeSurfaceView != null) nativeSurfaceView.setVisibility(View.GONE);
                setWebViewTransparent(false);
                call.reject("startCamera failed: " + e.getMessage());
            }
        });
    }

    @PermissionCallback
    private void cameraPermissionCallback(PluginCall call) {
        if (!hasCameraPermission()) {
            call.reject("Camera permission denied");
            return;
        }

        if (!isInitialized.get()) {
            call.reject("Not initialized");
            return;
        }

        startCamera(call);
    }

    // ═══════════════════════════════════════════════════════════
    //  STOP CAMERA
    // ═══════════════════════════════════════════════════════════

    @PluginMethod
    public void stopCamera(PluginCall call) {
        Activity activity = getActivity();
        if (activity == null || activity.isFinishing() || activity.isDestroyed()) {
            stopZoomEnforcement();
            isCameraRunning.set(false);
            isCaptureSessionConfigured.set(false);
            firstFrameRendered.set(false);
            call.resolve(ok("Camera stopped (no activity)"));
            return;
        }
        activity.runOnUiThread(() -> {
            stopZoomEnforcement();
            closeCamera();
            if (nativeSurfaceView != null) nativeSurfaceView.setVisibility(View.GONE);
            // v5.0: Reset WebView to opaque when camera stops
            setWebViewTransparent(false);
            isCameraRunning.set(false);
            isCaptureSessionConfigured.set(false);
            firstFrameRendered.set(false);
            call.resolve(ok("Camera stopped"));
        });
    }

    // ═══════════════════════════════════════════════════════════
    //  SWITCH CAMERA (front/back)
    // ═══════════════════════════════════════════════════════════

    @PluginMethod
    public void switchCamera(PluginCall call) {
        if (!isInitialized.get()) {
            call.reject("Not initialized");
            return;
        }

        Activity activity = getActivity();
        if (activity == null || activity.isFinishing() || activity.isDestroyed()) {
            call.reject("Activity not available");
            return;
        }

        activity.runOnUiThread(() -> {
            try {
                stopZoomEnforcement();
                closeCamera();
                isFrontCamera = !isFrontCamera;
                firstFrameRendered.set(false);

                boolean opened = openCamera();
                if (!opened) {
                    isCameraRunning.set(false);
                    isCaptureSessionConfigured.set(false);
                    call.reject("Switch failed");
                    return;
                }

                JSObject result = ok("Camera switching");
                result.put("isFrontCamera", isFrontCamera);
                call.resolve(result);
            } catch (Exception e) {
                isCameraRunning.set(false);
                isCaptureSessionConfigured.set(false);
                call.reject("Switch failed: " + e.getMessage());
            }
        });
    }

    // ═══════════════════════════════════════════════════════════
    //  BEAUTY PARAMETERS
    // ═══════════════════════════════════════════════════════════

    @PluginMethod
    public void setBeautyParam(PluginCall call) {
        if (!isInitialized.get() || deepAR == null) {
            call.reject("Not initialized");
            return;
        }

        String paramRaw = call.getString("param", "");
        final String param = paramRaw == null ? "" : paramRaw;

        Float rawValue = call.getFloat("value", 0f);
        float normalizedValue = rawValue == null ? 0f : rawValue;
        final float value = Math.max(0f, Math.min(1f, normalizedValue));

        Activity activity = getActivity();
        if (activity == null || activity.isFinishing() || activity.isDestroyed()) {
            call.reject("Activity not available");
            return;
        }

        activity.runOnUiThread(() -> {
            applyBeauty(param, value);
            call.resolve(ok(param + "=" + value));
        });
    }

    @PluginMethod
    public void applyBeautyPreset(PluginCall call) {
        if (!isInitialized.get() || deepAR == null) {
            call.reject("Not initialized");
            return;
        }

        String presetRaw = call.getString("preset", "natural");
        final String preset = (presetRaw == null || presetRaw.trim().isEmpty())
            ? "natural"
            : presetRaw;

        Activity activity = getActivity();
        if (activity == null || activity.isFinishing() || activity.isDestroyed()) {
            call.reject("Activity not available");
            return;
        }

        activity.runOnUiThread(() -> {
            float[] vals = getPresetValues(preset);
            for (int i = 0; i < BEAUTY_KEYS.length; i++) {
                applyBeauty(BEAUTY_KEYS[i], vals[i]);
            }
            call.resolve(ok("Preset applied: " + preset));
        });
    }

    // ═══════════════════════════════════════════════════════════
    //  EFFECTS / STICKERS
    // ═══════════════════════════════════════════════════════════

    @PluginMethod
    public void switchEffect(PluginCall call) {
        if (!isInitialized.get() || deepAR == null) {
            call.reject("Not initialized");
            return;
        }

        String effectPath = call.getString("effectPath", "");
        String slot = call.getString("slot", "effect");

        Activity activity = getActivity();
        if (activity == null || activity.isFinishing() || activity.isDestroyed()) {
            call.reject("Activity not available");
            return;
        }

        activity.runOnUiThread(() -> {
            try {
                String normalizedInput = effectPath == null ? "" : effectPath.trim();

                if (normalizedInput.isEmpty()) {
                    deepAR.switchEffect(slot, (String) null);
                    if ("beauty".equalsIgnoreCase(slot)) {
                        isBeautyEffectLoaded.set(false);
                    }
                    call.resolve(ok("Effect cleared"));
                    return;
                }

                String resolvedPath = resolveEffectAssetPath(effectPath);
                if (resolvedPath == null || resolvedPath.isEmpty()) {
                    call.reject("Effect not found: " + effectPath);
                    return;
                }

                deepAR.switchEffect(slot, resolvedPath);
                if ("beauty".equalsIgnoreCase(slot)) {
                    isBeautyEffectLoaded.set(true);
                    reapplyStoredBeautyParams();
                }

                JSObject res = ok("Effect applied");
                res.put("resolvedPath", resolvedPath);
                call.resolve(res);
            } catch (Exception e) {
                Log.e(TAG, "switchEffect failed", e);
                call.reject("switchEffect failed: " + e.getMessage());
            }
        });
    }

    @PluginMethod
    public void clearEffect(PluginCall call) {
        if (!isInitialized.get() || deepAR == null) {
            call.reject("Not initialized");
            return;
        }

        Activity activity = getActivity();
        if (activity == null || activity.isFinishing() || activity.isDestroyed()) {
            call.reject("Activity not available");
            return;
        }

        activity.runOnUiThread(() -> {
            deepAR.switchEffect("effect", (String) null);
            deepAR.switchEffect("Beauty", (String) null);
            isBeautyEffectLoaded.set(false);
            Arrays.fill(beautyParams, 0f);
            call.resolve(ok("All effects cleared"));
        });
    }

    @PluginMethod
    public void toggleStickerPanel(PluginCall call) {
        boolean show = call.getBoolean("show", true);
        JSObject result = ok("Sticker panel toggled");
        result.put("show", show);
        call.resolve(result);
    }

    @PluginMethod
    public void applyStickerEffect(PluginCall call) {
        String effectPath = call.getString("effectPath", "");
        if (!isInitialized.get() || deepAR == null) {
            call.reject("Not initialized");
            return;
        }
        if (effectPath.trim().isEmpty()) {
            call.reject("effectPath is required");
            return;
        }

        Activity activity = getActivity();
        if (activity == null || activity.isFinishing() || activity.isDestroyed()) {
            call.reject("Activity not available");
            return;
        }

        activity.runOnUiThread(() -> {
            try {
                String resolvedPath = resolveEffectAssetPath(effectPath);
                if (resolvedPath == null || resolvedPath.isEmpty()) {
                    call.reject("Effect not found: " + effectPath);
                    return;
                }
                deepAR.switchEffect("effect", resolvedPath);
                call.resolve(ok("Sticker applied"));
            } catch (Exception e) {
                call.reject("Sticker apply failed: " + e.getMessage());
            }
        });
    }

    @PluginMethod
    public void removeStickerEffect(PluginCall call) {
        if (!isInitialized.get() || deepAR == null) {
            call.reject("Not initialized");
            return;
        }

        Activity activity = getActivity();
        if (activity == null || activity.isFinishing() || activity.isDestroyed()) {
            call.reject("Activity not available");
            return;
        }

        activity.runOnUiThread(() -> {
            deepAR.switchEffect("effect", (String) null);
            call.resolve(ok("Sticker removed"));
        });
    }

    // ═══════════════════════════════════════════════════════════
    //  SURFACE VISIBILITY (kept for backward compatibility)
    // ═══════════════════════════════════════════════════════════

    @PluginMethod
    public void showNativeSurface(PluginCall call) {
        Activity activity = getActivity();
        if (activity == null || activity.isFinishing() || activity.isDestroyed()) {
            call.reject("Activity not available");
            return;
        }
        activity.runOnUiThread(() -> {
            if (nativeSurfaceView != null) nativeSurfaceView.setVisibility(View.VISIBLE);
            setWebViewTransparent(true);
            call.resolve(ok("Surface visible"));
        });
    }

    @PluginMethod
    public void hideNativeSurface(PluginCall call) {
        Activity activity = getActivity();
        if (activity == null || activity.isFinishing() || activity.isDestroyed()) {
            call.reject("Activity not available");
            return;
        }
        activity.runOnUiThread(() -> {
            if (nativeSurfaceView != null) nativeSurfaceView.setVisibility(View.GONE);
            setWebViewTransparent(false);
            call.resolve(ok("Surface hidden"));
        });
    }

    // ═══════════════════════════════════════════════════════════
    //  OTHER PLUGIN METHODS
    // ═══════════════════════════════════════════════════════════

    @PluginMethod
    public void takeScreenshot(PluginCall call) {
        if (!isInitialized.get() || deepAR == null) {
            call.reject("Not initialized");
            return;
        }
        deepAR.takeScreenshot();
        call.resolve(ok("Screenshot requested"));
    }

    @PluginMethod
    public void getState(PluginCall call) {
        JSObject s = new JSObject();
        s.put("isInitialized", isInitialized.get());
        s.put("isCameraRunning", isCameraRunning.get());
        s.put("isCaptureSessionConfigured", isCaptureSessionConfigured.get());
        s.put("isBeautyEffectLoaded", isBeautyEffectLoaded.get());
        s.put("isFrontCamera", isFrontCamera);
        s.put("isPaused", isPaused);
        s.put("firstFrameRendered", firstFrameRendered.get());
        s.put("resolution", TARGET_WIDTH + "x" + TARGET_HEIGHT);
        s.put("totalFrames", frameCount.get());
        s.put("droppedFrames", droppedFrames.get());
        s.put("sensorOrientation", sensorOrientation);
        s.put("deviceOrientation", currentDeviceOrientation.get());

        for (int i = 0; i < BEAUTY_KEYS.length; i++) {
            s.put(BEAUTY_KEYS[i], beautyParams[i]);
        }

        call.resolve(s);
    }

    @PluginMethod
    public void pause(PluginCall call) {
        isPaused = true;
        if (deepAR != null) deepAR.setPaused(true);
        call.resolve(ok("Paused"));
    }

    @PluginMethod
    public void resume(PluginCall call) {
        isPaused = false;
        if (deepAR != null) deepAR.setPaused(false);
        if (isCameraRunning.get()) startZoomEnforcement();
        call.resolve(ok("Resumed"));
    }

    @PluginMethod
    public void destroy(PluginCall call) {
        Activity activity = getActivity();
        if (activity == null || activity.isFinishing() || activity.isDestroyed()) {
            fullCleanup();
            call.resolve(ok("Destroyed"));
            return;
        }
        activity.runOnUiThread(() -> {
            fullCleanup();
            call.resolve(ok("Destroyed"));
        });
    }

    // ═══════════════════════════════════════════════════════════
    //  v5.0: WEBVIEW TRANSPARENCY HELPER
    // ═══════════════════════════════════════════════════════════

    /**
     * Central method to control WebView transparency.
     * transparent=true  → WebView becomes see-through, native camera surface visible behind it
     * transparent=false → WebView gets opaque dark background (normal app state)
     */
    private void setWebViewTransparent(boolean transparent) {
        try {
            if (getBridge() == null || getBridge().getWebView() == null) return;

            Activity activity = getActivity();
            if (activity == null || activity.isFinishing() || activity.isDestroyed()) return;

            activity.runOnUiThread(() -> {
                try {
                    if (transparent) {
                        getBridge().getWebView().setBackgroundColor(android.graphics.Color.TRANSPARENT);
                        getBridge().getWebView().setLayerType(View.LAYER_TYPE_HARDWARE, null);
                        Log.d(TAG, "🔍 WebView → TRANSPARENT (camera visible)");
                    } else {
                        getBridge().getWebView().setBackgroundColor(android.graphics.Color.parseColor("#09090b"));
                        getBridge().getWebView().setLayerType(View.LAYER_TYPE_NONE, null);
                        Log.d(TAG, "🔍 WebView → OPAQUE (normal mode)");
                    }
                } catch (Exception uiError) {
                    Log.w(TAG, "setWebViewTransparent UI update failed", uiError);
                }
            });
        } catch (Exception e) {
            Log.w(TAG, "setWebViewTransparent failed", e);
        }
    }

    // ═══════════════════════════════════════════════════════════
    //  BEAUTY ENGINE
    // ═══════════════════════════════════════════════════════════

    private void applyBeauty(String param, float value) {
        if (deepAR == null) return;

        for (int i = 0; i < BEAUTY_KEYS.length; i++) {
            if (BEAUTY_KEYS[i].equals(param)) {
                beautyParams[i] = value;
                ensureBeautyEffectLoaded();

                if (isBeautyEffectLoaded.get() && isBeautyRuntimeParamsEnabled.get()) {
                    try {
                        deepAR.changeParameterFloat("Beauty", "MorphOffset", DEEPAR_NAMES[i], value);
                    } catch (Throwable t) {
                        isBeautyRuntimeParamsEnabled.set(false);
                        Log.w(TAG, "Beauty runtime params disabled (unsupported component): " + t.getMessage());
                    }
                }
                return;
            }
        }

        Log.w(TAG, "Unknown beauty param: " + param);
    }

    private final AtomicBoolean isBeautyEffectLoading = new AtomicBoolean(false);

    private void ensureBeautyEffectLoaded() {
        if (deepAR == null || isBeautyEffectLoaded.get() || isBeautyEffectLoading.get()) return;

        String beautyAsset = resolveDefaultBeautyAsset();
        if (beautyAsset == null) {
            Log.e(TAG, "Beauty asset missing: effects/beauty/beauty.deepar");
            return;
        }

        isBeautyEffectLoading.set(true);
        Log.d(TAG, "Loading beauty effect — params will apply after effectSwitched callback");
        deepAR.switchEffect("Beauty", toAssetUri(beautyAsset));
        // NOTE: isBeautyEffectLoaded is set in effectSwitched() callback, NOT here
    }

    private void reapplyStoredBeautyParams() {
        if (deepAR == null || !isBeautyEffectLoaded.get() || !isBeautyRuntimeParamsEnabled.get()) return;

        for (int i = 0; i < BEAUTY_KEYS.length; i++) {
            try {
                deepAR.changeParameterFloat("Beauty", "MorphOffset", DEEPAR_NAMES[i], beautyParams[i]);
            } catch (Throwable t) {
                isBeautyRuntimeParamsEnabled.set(false);
                Log.w(TAG, "Beauty runtime params disabled during reapply: " + t.getMessage());
                return;
            }
        }
    }

    private float[] getPresetValues(String preset) {
        switch (preset) {
            case "natural":   return new float[]{0.30f, 0.20f, 0.10f, 0.10f, 0.10f, 0.05f, 0.05f, 0.00f};
            case "glamour":   return new float[]{0.60f, 0.40f, 0.20f, 0.30f, 0.30f, 0.15f, 0.10f, 0.30f};
            case "cute":      return new float[]{0.50f, 0.30f, 0.30f, 0.40f, 0.20f, 0.10f, 0.05f, 0.20f};
            case "celebrity": return new float[]{0.70f, 0.50f, 0.15f, 0.25f, 0.35f, 0.20f, 0.15f, 0.40f};
            case "soft":      return new float[]{0.40f, 0.25f, 0.15f, 0.15f, 0.15f, 0.10f, 0.05f, 0.10f};
            case "bold":      return new float[]{0.80f, 0.60f, 0.10f, 0.35f, 0.40f, 0.25f, 0.20f, 0.50f};
            case "flawless":  return new float[]{0.90f, 0.50f, 0.20f, 0.20f, 0.25f, 0.15f, 0.10f, 0.20f};
            case "studio":    return new float[]{0.65f, 0.45f, 0.15f, 0.20f, 0.25f, 0.15f, 0.10f, 0.25f};
            default:          return new float[]{0f, 0f, 0f, 0f, 0f, 0f, 0f, 0f};
        }
    }

    // ═══════════════════════════════════════════════════════════
    //  CAMERA2 API — Open / Close / Session
    // ═══════════════════════════════════════════════════════════

    @SuppressLint("MissingPermission")
    private boolean openCamera() {
        boolean lockAcquired = false;
        boolean openRequested = false;

        if (!isCameraOpening.compareAndSet(false, true)) {
            Log.w(TAG, "⚠️ Camera open already in progress");
            return true;
        }

        try {
            startCameraThreadIfNeeded();

            currentCameraId = findCameraId(isFrontCamera);
            if (currentCameraId == null) {
                Log.e(TAG, "❌ No camera found (front=" + isFrontCamera + ")");
                isCameraOpening.set(false);
                return false;
            }

            CameraCharacteristics chars = cameraManager.getCameraCharacteristics(currentCameraId);
            Integer sensorOri = chars.get(CameraCharacteristics.SENSOR_ORIENTATION);
            sensorOrientation = sensorOri == null ? 0 : sensorOri;
            sensorActiveArraySize = chars.get(CameraCharacteristics.SENSOR_INFO_ACTIVE_ARRAY_SIZE);

            Size selectedSize = selectOptimalSize(currentCameraId);
            Log.i(TAG, "📷 Selected resolution: " + selectedSize.getWidth() + "x" + selectedSize.getHeight());

            imageReader = ImageReader.newInstance(
                selectedSize.getWidth(),
                selectedSize.getHeight(),
                ImageFormat.YUV_420_888,
                3
            );
            imageReader.setOnImageAvailableListener(this::processFrame, cameraHandler);

            if (!cameraLock.tryAcquire(CAMERA_LOCK_TIMEOUT_MS, TimeUnit.MILLISECONDS)) {
                Log.e(TAG, "❌ Camera lock timeout");
                isCameraOpening.set(false);
                return false;
            }
            lockAcquired = true;

            if (!hasCameraPermission()) {
                Log.e(TAG, "❌ Camera permission missing");
                isCameraOpening.set(false);
                return false;
            }

            cameraManager.openCamera(currentCameraId, cameraStateCallback, cameraHandler);
            openRequested = true;
            Log.i(TAG, "📷 Camera open requested: " + currentCameraId);
            return true;
        } catch (InterruptedException e) {
            Log.e(TAG, "❌ openCamera interrupted", e);
            isCameraOpening.set(false);
            Thread.currentThread().interrupt();
            return false;
        } catch (Exception e) {
            Log.e(TAG, "❌ openCamera failed", e);
            isCameraOpening.set(false);
            return false;
        } finally {
            if (lockAcquired && !openRequested) cameraLock.release();
        }
    }

    private void closeCamera() {
        boolean lockAcquired = false;
        try {
            cameraLock.acquire();
            lockAcquired = true;

            if (captureSession != null) {
                try { captureSession.close(); } catch (Exception ignored) {}
                captureSession = null;
            }
            if (cameraDevice != null) {
                try { cameraDevice.close(); } catch (Exception ignored) {}
                cameraDevice = null;
            }
            if (imageReader != null) {
                try { imageReader.close(); } catch (Exception ignored) {}
                imageReader = null;
            }
            currentRequestBuilder = null;
            isCameraOpening.set(false);
            isCameraRunning.set(false);
            isCaptureSessionConfigured.set(false);
        } catch (InterruptedException e) {
            Log.e(TAG, "closeCamera interrupted", e);
            Thread.currentThread().interrupt();
        } finally {
            if (lockAcquired) {
                cameraLock.release();
            }
        }
    }

    private final CameraDevice.StateCallback cameraStateCallback = new CameraDevice.StateCallback() {
        @Override
        public void onOpened(@NonNull CameraDevice camera) {
            if (cameraLock.availablePermits() == 0) cameraLock.release();
            cameraDevice = camera;
            isCameraOpening.set(false);
            isCameraRunning.set(true);
            Log.i(TAG, "📷 Camera opened successfully");

            if (cameraHandler != null) {
                cameraHandler.postDelayed(() -> {
                    if (cameraDevice != null && !isPaused && isInitialized.get()) {
                        createCaptureSession();
                    }
                }, 100);
            } else {
                createCaptureSession();
            }
        }

        @Override
        public void onDisconnected(@NonNull CameraDevice camera) {
            if (cameraLock.availablePermits() == 0) cameraLock.release();
            isCameraOpening.set(false);
            try { camera.close(); } catch (Exception ignored) {}
            cameraDevice = null;
            isCameraRunning.set(false);
            isCaptureSessionConfigured.set(false);
            if (nativeSurfaceView != null) nativeSurfaceView.setVisibility(View.GONE);
            setWebViewTransparentOnMain(false);
            Log.w(TAG, "📷 Camera disconnected — will auto-retry");

            if (!isPaused && isInitialized.get()) {
                if (cameraHandler != null) {
                    cameraHandler.postDelayed(() -> {
                        if (!isPaused && isInitialized.get() && cameraDevice == null) {
                            Log.i(TAG, "📷 Auto-retrying camera after disconnect...");
                            openCamera();
                        }
                    }, 1000);
                }
            }
        }

        @Override
        public void onError(@NonNull CameraDevice camera, int error) {
            if (cameraLock.availablePermits() == 0) cameraLock.release();
            isCameraOpening.set(false);
            try { camera.close(); } catch (Exception ignored) {}
            cameraDevice = null;
            isCameraRunning.set(false);
            isCaptureSessionConfigured.set(false);
            if (nativeSurfaceView != null) nativeSurfaceView.setVisibility(View.GONE);
            setWebViewTransparentOnMain(false);
            Log.e(TAG, "📷 Camera error: " + error);

            if (error == CameraDevice.StateCallback.ERROR_CAMERA_DEVICE && !isPaused && isInitialized.get()) {
                if (cameraHandler != null) {
                    cameraHandler.postDelayed(() -> {
                        if (!isPaused && isInitialized.get() && cameraDevice == null) {
                            Log.i(TAG, "📷 Auto-retrying camera after error " + error);
                            openCamera();
                        }
                    }, 1500);
                }
            }
        }
    };

    private void createCaptureSession() {
        if (cameraDevice == null || imageReader == null) {
            Log.e(TAG, "❌ createCaptureSession: camera or imageReader null");
            return;
        }

        try {
            final Surface surface = imageReader.getSurface();

            cameraDevice.createCaptureSession(
                Collections.singletonList(surface),
                new CameraCaptureSession.StateCallback() {
                    @Override
                    public void onConfigured(@NonNull CameraCaptureSession session) {
                        if (cameraDevice == null) return;
                        captureSession = session;

                        try {
                            CaptureRequest.Builder builder = cameraDevice.createCaptureRequest(CameraDevice.TEMPLATE_PREVIEW);
                            builder.addTarget(surface);

                            // v5.0: Enhanced capture settings for HD quality
                            builder.set(CaptureRequest.CONTROL_AF_MODE, CaptureRequest.CONTROL_AF_MODE_CONTINUOUS_VIDEO);
                            builder.set(CaptureRequest.CONTROL_AE_MODE, CaptureRequest.CONTROL_AE_MODE_ON);
                            builder.set(CaptureRequest.CONTROL_AWB_MODE, CaptureRequest.CONTROL_AWB_MODE_AUTO);
                            builder.set(CaptureRequest.CONTROL_AE_ANTIBANDING_MODE, CaptureRequest.CONTROL_AE_ANTIBANDING_MODE_AUTO);
                            builder.set(CaptureRequest.NOISE_REDUCTION_MODE, CaptureRequest.NOISE_REDUCTION_MODE_HIGH_QUALITY);
                            builder.set(CaptureRequest.EDGE_MODE, CaptureRequest.EDGE_MODE_HIGH_QUALITY);

                            // v5.0: Try to enable tone mapping for better color
                            try {
                                builder.set(CaptureRequest.TONEMAP_MODE, CaptureRequest.TONEMAP_MODE_HIGH_QUALITY);
                            } catch (Exception ignored) {}

                            // Force 1x zoom
                            enforceZoomLock(builder);

                            // Stabilization
                            builder.set(CaptureRequest.CONTROL_VIDEO_STABILIZATION_MODE,
                                CaptureRequest.CONTROL_VIDEO_STABILIZATION_MODE_ON);
                            tryEnableOis(builder);

                            currentRequestBuilder = builder;
                            captureSession.setRepeatingRequest(builder.build(), null, cameraHandler);

                            isCaptureSessionConfigured.set(true);
                            isCameraRunning.set(true);
                            startZoomEnforcement();

                            Log.i(TAG, "✅ Capture session configured — camera LIVE");

                            // v5.0: Notify JS that camera is ready
                            JSObject data = new JSObject();
                            data.put("cameraReady", true);
                            data.put("isFrontCamera", isFrontCamera);
                            notifyListeners("cameraStarted", data);

                        } catch (Exception e) {
                            isCaptureSessionConfigured.set(false);
                            isCameraRunning.set(false);
                            if (nativeSurfaceView != null) nativeSurfaceView.setVisibility(View.GONE);
                            setWebViewTransparentOnMain(false);
                            Log.e(TAG, "❌ Capture request failed", e);
                        }
                    }

                    @Override
                    public void onConfigureFailed(@NonNull CameraCaptureSession session) {
                        isCaptureSessionConfigured.set(false);
                        isCameraRunning.set(false);
                        if (nativeSurfaceView != null) nativeSurfaceView.setVisibility(View.GONE);
                        setWebViewTransparentOnMain(false);
                        Log.e(TAG, "❌ Capture session config failed");
                    }
                },
                cameraHandler
            );
        } catch (Exception e) {
            Log.e(TAG, "❌ createCaptureSession failed", e);
        }
    }

    /**
     * Thread-safe version: post to main thread
     */
    private void setWebViewTransparentOnMain(boolean transparent) {
        if (mainHandler != null) {
            mainHandler.post(() -> setWebViewTransparent(transparent));
        }
    }

    // ═══════════════════════════════════════════════════════════
    //  FRAME PROCESSING — camera thread capture + UI thread DeepAR dispatch
    // ═══════════════════════════════════════════════════════════

    private void processFrame(ImageReader reader) {
        if (isPaused || !isInitialized.get() || deepAR == null || !isCaptureSessionConfigured.get()) return;

        Activity activity = getActivity();
        if (activity == null || activity.isFinishing() || activity.isDestroyed()) return;

        Image image = null;

        try {
            try {
                image = reader.acquireLatestImage();
            } catch (IllegalStateException acquireError) {
                droppedFrames.incrementAndGet();
                Log.w(TAG, "processFrame acquireLatestImage skipped: " + acquireError.getMessage());
                return;
            }
            if (image == null) return;

            if (!isProcessingFrame.compareAndSet(false, true)) {
                droppedFrames.incrementAndGet();
                return;
            }

            final int w = image.getWidth();
            final int h = image.getHeight();
            final Image.Plane[] planes = image.getPlanes();
            if (planes == null || planes.length < 3) {
                droppedFrames.incrementAndGet();
                isProcessingFrame.set(false);
                return;
            }

            final byte[] nv21Bytes = obtainNv21Buffer(w, h);
            yuv420888ToNv21(planes, w, h, nv21Bytes);
            final int rotation = calculateFrameRotation();
            final boolean front = isFrontCamera;

            image.close();
            image = null;

            final ByteBuffer directBuffer = obtainDirectNv21Buffer(w, h);
            directBuffer.clear();
            directBuffer.put(nv21Bytes, 0, nv21Bytes.length);
            directBuffer.flip();

            mainHandler.post(() -> {
                try {
                    if (isPaused || !isInitialized.get() || deepAR == null || !isCaptureSessionConfigured.get()) return;

                    deepAR.receiveFrame(
                        directBuffer,
                        w,
                        h,
                        rotation,
                        front,
                        DeepARImageFormat.YUV_NV21,
                        1
                    );

                    long count = frameCount.incrementAndGet();
                    if (!firstFrameRendered.get() && count >= 3) {
                        firstFrameRendered.set(true);
                        Log.i(TAG, "✅ First frames rendered — camera feed is LIVE");

                        JSObject data = new JSObject();
                        data.put("firstFrame", true);
                        data.put("frameCount", count);
                        notifyListeners("firstFrameRendered", data);
                    }

                    fpsFrames.incrementAndGet();
                    long now = System.currentTimeMillis();
                    long elapsed = now - fpsTime.get();
                    if (elapsed > 5000) {
                        long fps = fpsFrames.getAndSet(0) * 1000 / elapsed;
                        fpsTime.set(now);
                        Log.d(TAG, "📊 FPS=" + fps + " frames=" + count + " dropped=" + droppedFrames.get());
                    }
                } catch (Throwable t) {
                    Log.e(TAG, "receiveFrame failed", t);
                } finally {
                    isProcessingFrame.set(false);
                }
            });
        } catch (Throwable t) {
            Log.e(TAG, "processFrame failed", t);
            isProcessingFrame.set(false);
        } finally {
            if (image != null) {
                try { image.close(); } catch (Exception ignored) {}
            }
        }
    }

    // ═══════════════════════════════════════════════════════════
    //  YUV → NV21 BUFFER (reusable)
    // ═══════════════════════════════════════════════════════════

    private byte[] obtainNv21Buffer(int width, int height) {
        int required = (width * height * 3) / 2;
        synchronized (this) {
            if (reusableNv21Buffer == null || reusableNv21Buffer.length != required) {
                reusableNv21Buffer = new byte[required];
            }
            return reusableNv21Buffer;
        }
    }

    private ByteBuffer obtainDirectNv21Buffer(int width, int height) {
        int required = (width * height * 3) / 2;
        synchronized (this) {
            if (reusableDirectNv21Buffer == null || reusableDirectNv21Buffer.capacity() != required) {
                reusableDirectNv21Buffer = ByteBuffer.allocateDirect(required);
            }
            return reusableDirectNv21Buffer;
        }
    }

    private void yuv420888ToNv21(Image.Plane[] planes, int width, int height, byte[] out) {
        ByteBuffer yBuffer = planes[0].getBuffer();
        ByteBuffer uBuffer = planes[1].getBuffer();
        ByteBuffer vBuffer = planes[2].getBuffer();

        int yRowStride = planes[0].getRowStride();
        int yPixelStride = planes[0].getPixelStride();
        int uRowStride = planes[1].getRowStride();
        int uPixelStride = planes[1].getPixelStride();
        int vRowStride = planes[2].getRowStride();
        int vPixelStride = planes[2].getPixelStride();

        int pos = 0;

        for (int row = 0; row < height; row++) {
            int yRowOffset = row * yRowStride;
            for (int col = 0; col < width; col++) {
                out[pos++] = yBuffer.get(yRowOffset + (col * yPixelStride));
            }
        }

        int chromaHeight = height / 2;
        int chromaWidth = width / 2;
        for (int row = 0; row < chromaHeight; row++) {
            int uRowOffset = row * uRowStride;
            int vRowOffset = row * vRowStride;
            for (int col = 0; col < chromaWidth; col++) {
                out[pos++] = vBuffer.get(vRowOffset + (col * vPixelStride));
                out[pos++] = uBuffer.get(uRowOffset + (col * uPixelStride));
            }
        }
    }

    // ═══════════════════════════════════════════════════════════
    //  ROTATION & ZOOM
    // ═══════════════════════════════════════════════════════════

    private int calculateFrameRotation() {
        int displayRotation = getDisplayRotation();

        if (isFrontCamera) {
            int rotation = (sensorOrientation + displayRotation) % 360;
            return (360 - rotation) % 360;
        } else {
            return (sensorOrientation - displayRotation + 360) % 360;
        }
    }

    private int getDisplayRotation() {
        try {
            WindowManager wm = (WindowManager) getContext().getSystemService(Context.WINDOW_SERVICE);
            if (wm == null) return 0;
            Display display = wm.getDefaultDisplay();
            if (display == null) return 0;

            switch (display.getRotation()) {
                case Surface.ROTATION_90: return 90;
                case Surface.ROTATION_180: return 180;
                case Surface.ROTATION_270: return 270;
                case Surface.ROTATION_0:
                default: return 0;
            }
        } catch (Exception e) {
            return 0;
        }
    }

    private void enforceZoomLock(CaptureRequest.Builder builder) {
        if (sensorActiveArraySize != null) {
            builder.set(CaptureRequest.SCALER_CROP_REGION, sensorActiveArraySize);
        }
    }

    private void startZoomEnforcement() {
        if (cameraThread == null || zoomEnforceHandler != null) return;

        zoomEnforceHandler = new Handler(cameraThread.getLooper());
        zoomEnforceRunnable = new Runnable() {
            @Override
            public void run() {
                if (!isCameraRunning.get() || captureSession == null || currentRequestBuilder == null) return;

                try {
                    enforceZoomLock(currentRequestBuilder);
                    captureSession.setRepeatingRequest(currentRequestBuilder.build(), null, cameraHandler);
                } catch (Exception ignored) {}

                if (isCameraRunning.get() && zoomEnforceHandler != null) {
                    zoomEnforceHandler.postDelayed(this, ZOOM_ENFORCE_INTERVAL_MS);
                }
            }
        };
        zoomEnforceHandler.postDelayed(zoomEnforceRunnable, ZOOM_ENFORCE_INTERVAL_MS);
    }

    private void stopZoomEnforcement() {
        if (zoomEnforceHandler != null && zoomEnforceRunnable != null) {
            zoomEnforceHandler.removeCallbacks(zoomEnforceRunnable);
        }
        zoomEnforceHandler = null;
        zoomEnforceRunnable = null;
    }

    private void tryEnableOis(CaptureRequest.Builder builder) {
        try {
            if (cameraManager == null || currentCameraId == null) return;
            CameraCharacteristics chars = cameraManager.getCameraCharacteristics(currentCameraId);
            int[] modes = chars.get(CameraCharacteristics.LENS_INFO_AVAILABLE_OPTICAL_STABILIZATION);
            if (modes == null) return;

            for (int mode : modes) {
                if (mode == CaptureRequest.LENS_OPTICAL_STABILIZATION_MODE_ON) {
                    builder.set(CaptureRequest.LENS_OPTICAL_STABILIZATION_MODE,
                        CaptureRequest.LENS_OPTICAL_STABILIZATION_MODE_ON);
                    return;
                }
            }
        } catch (Exception ignored) {}
    }

    // ═══════════════════════════════════════════════════════════
    //  NATIVE SURFACE (behind WebView)
    // ═══════════════════════════════════════════════════════════

    private void createNativeSurfaceIfNeeded() {
        if (nativeSurfaceView != null) return;

        Activity activity = getActivity();
        if (activity == null || activity.isFinishing() || activity.isDestroyed()) return;

        nativeSurfaceView = new SurfaceView(getContext());

        // v5.0: Ensure surface renders BEHIND WebView (not on top)
        nativeSurfaceView.setZOrderOnTop(false);
        nativeSurfaceView.setZOrderMediaOverlay(false);

        FrameLayout.LayoutParams params = new FrameLayout.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT,
            ViewGroup.LayoutParams.MATCH_PARENT
        );
        params.gravity = Gravity.CENTER;

        ViewGroup contentView = activity.findViewById(android.R.id.content);
        // Add at index 0 = behind everything else (WebView is on top)
        contentView.addView(nativeSurfaceView, 0, params);

        nativeSurfaceView.getHolder().addCallback(new SurfaceHolder.Callback() {
            @Override
            public void surfaceCreated(@NonNull SurfaceHolder holder) {
                if (deepAR != null) {
                    deepAR.setRenderSurface(holder.getSurface(), TARGET_WIDTH, TARGET_HEIGHT);
                    Log.i(TAG, "🖥 DeepAR render surface created");
                }
            }

            @Override
            public void surfaceChanged(@NonNull SurfaceHolder holder, int format, int width, int height) {
                if (deepAR != null) {
                    deepAR.setRenderSurface(holder.getSurface(), width, height);
                }
            }

            @Override
            public void surfaceDestroyed(@NonNull SurfaceHolder holder) {
                if (deepAR != null) {
                    try { deepAR.setRenderSurface(null, 0, 0); } catch (Exception ignored) {}
                }
            }
        });

        nativeSurfaceView.setVisibility(View.GONE);
        Log.i(TAG, "🖥 Native surface view created (Z-index: behind WebView)");
    }

    // ═══════════════════════════════════════════════════════════
    //  ORIENTATION LISTENER
    // ═══════════════════════════════════════════════════════════

    private void setupOrientationListener() {
        orientationListener = new OrientationEventListener(getContext()) {
            @Override
            public void onOrientationChanged(int orientation) {
                if (orientation == ORIENTATION_UNKNOWN) return;

                int snapped;
                if (orientation >= 315 || orientation < 45) snapped = 0;
                else if (orientation < 135) snapped = 90;
                else if (orientation < 225) snapped = 180;
                else snapped = 270;

                currentDeviceOrientation.set(snapped);
            }
        };

        if (orientationListener.canDetectOrientation()) {
            orientationListener.enable();
        }
    }

    // ═══════════════════════════════════════════════════════════
    //  UTILITY: Emulator check, permission, threads
    // ═══════════════════════════════════════════════════════════

    private boolean isEmulatorEnvironment() {
        String fingerprint = Build.FINGERPRINT == null ? "" : Build.FINGERPRINT.toLowerCase(Locale.US);
        String model = Build.MODEL == null ? "" : Build.MODEL.toLowerCase(Locale.US);
        String brand = Build.BRAND == null ? "" : Build.BRAND.toLowerCase(Locale.US);
        String device = Build.DEVICE == null ? "" : Build.DEVICE.toLowerCase(Locale.US);
        String product = Build.PRODUCT == null ? "" : Build.PRODUCT.toLowerCase(Locale.US);
        String manufacturer = Build.MANUFACTURER == null ? "" : Build.MANUFACTURER.toLowerCase(Locale.US);
        String hardware = Build.HARDWARE == null ? "" : Build.HARDWARE.toLowerCase(Locale.US);

        return fingerprint.startsWith("generic")
            || fingerprint.contains("emulator")
            || model.contains("emulator")
            || model.contains("android sdk built for")
            || manufacturer.contains("genymotion")
            || brand.startsWith("generic")
            || device.startsWith("generic")
            || product.contains("sdk")
            || product.contains("emulator")
            || hardware.contains("goldfish")
            || hardware.contains("ranchu");
    }

    private boolean hasCameraPermission() {
        Activity activity = getActivity();
        if (activity == null) return false;

        boolean androidRuntimeGranted = ContextCompat.checkSelfPermission(
            activity,
            Manifest.permission.CAMERA
        ) == PackageManager.PERMISSION_GRANTED;

        PermissionState capacitorState = getPermissionState("camera");
        boolean capacitorPermissionGranted = capacitorState == PermissionState.GRANTED;

        if (androidRuntimeGranted && !capacitorPermissionGranted) {
            Log.w(TAG, "Camera runtime permission granted but Capacitor alias stale; treating as granted");
        }

        return androidRuntimeGranted || capacitorPermissionGranted;
    }

    private void startCameraThreadIfNeeded() {
        if (cameraThread != null && cameraThread.isAlive()) return;
        cameraThread = new HandlerThread("MeriLive_CameraThread");
        cameraThread.start();
        cameraHandler = new Handler(cameraThread.getLooper());
    }

    private void stopCameraThread() {
        if (cameraThread != null) {
            cameraThread.quitSafely();
            try {
                cameraThread.join(1500);
            } catch (InterruptedException ignored) {}
            cameraThread = null;
            cameraHandler = null;
        }
    }

    private String findCameraId(boolean front) {
        try {
            for (String id : cameraManager.getCameraIdList()) {
                CameraCharacteristics chars = cameraManager.getCameraCharacteristics(id);
                Integer facing = chars.get(CameraCharacteristics.LENS_FACING);
                if (front && facing != null && facing == CameraCharacteristics.LENS_FACING_FRONT) return id;
                if (!front && facing != null && facing == CameraCharacteristics.LENS_FACING_BACK) return id;
            }
        } catch (Exception e) {
            Log.e(TAG, "findCameraId failed", e);
        }
        return null;
    }

    // ═══════════════════════════════════════════════════════════
    //  RESOLUTION SELECTION — v5.0 Enhanced
    // ═══════════════════════════════════════════════════════════

    private Size selectOptimalSize(String cameraId) {
        try {
            CameraCharacteristics chars = cameraManager.getCameraCharacteristics(cameraId);
            StreamConfigurationMap map = chars.get(CameraCharacteristics.SCALER_STREAM_CONFIGURATION_MAP);
            if (map == null) return new Size(TARGET_WIDTH, TARGET_HEIGHT);

            Size[] sizes = map.getOutputSizes(ImageFormat.YUV_420_888);
            if (sizes == null || sizes.length == 0) {
                sizes = map.getOutputSizes(SurfaceHolder.class);
            }
            if (sizes == null || sizes.length == 0) return new Size(TARGET_WIDTH, TARGET_HEIGHT);

            // Exact match first
            for (Size s : sizes) {
                if ((s.getWidth() == TARGET_WIDTH && s.getHeight() == TARGET_HEIGHT) ||
                    (s.getWidth() == TARGET_HEIGHT && s.getHeight() == TARGET_WIDTH)) {
                    Log.i(TAG, "📷 Exact 1080p match found");
                    return s;
                }
            }

            Size best = sizes[0];
            double bestScore = Double.MAX_VALUE;
            double targetAspect = 16.0 / 9.0;
            int targetPixels = TARGET_WIDTH * TARGET_HEIGHT;

            for (Size s : sizes) {
                int w = s.getWidth();
                int h = s.getHeight();
                int longEdge = Math.max(w, h);
                int shortEdge = Math.min(w, h);
                int pixels = w * h;

                double aspect = shortEdge == 0 ? targetAspect : (double) longEdge / (double) shortEdge;
                double aspectPenalty = Math.abs(aspect - targetAspect) * 4000.0;
                double areaPenalty = Math.abs(pixels - targetPixels) / 2500.0;
                double overPenalty = pixels > targetPixels ? (pixels - targetPixels) / 3500.0 : 0.0;
                double lowPenalty = pixels < (640 * 480) ? 8000.0 : (pixels < (1280 * 720) ? 4000.0 : 0.0);

                double score = aspectPenalty + areaPenalty + overPenalty + lowPenalty;
                if (score < bestScore) {
                    bestScore = score;
                    best = s;
                }
            }

            Log.i(TAG, "📷 Best resolution: " + best.getWidth() + "x" + best.getHeight());
            return best;
        } catch (Exception e) {
            return new Size(TARGET_WIDTH, TARGET_HEIGHT);
        }
    }

    // ═══════════════════════════════════════════════════════════
    //  EFFECT ASSET RESOLUTION
    // ═══════════════════════════════════════════════════════════

    private String resolveEffectAssetPath(String effectPath) {
        if (effectPath == null) return null;

        String normalized = effectPath.trim().replace("\\", "/");
        if (normalized.isEmpty()) return null;

        if (normalized.startsWith("file:///")) {
            String filename = normalized.substring(normalized.lastIndexOf('/') + 1).toLowerCase(Locale.US);
            if (shouldSkipDemoAsset(filename)) return null;
            return normalized;
        }

        if (normalized.startsWith("android_asset/")) {
            normalized = normalized.substring("android_asset/".length());
        }

        if ("sticker".equalsIgnoreCase(normalized)) {
            String stickerAsset = resolveStickerAliasAsset();
            return stickerAsset == null ? null : toAssetUri(stickerAsset);
        }

        List<String> candidates = new ArrayList<>();
        candidates.add(normalized);

        if (!normalized.startsWith("effects/")) {
            candidates.add("effects/" + normalized);
        }

        if (!normalized.toLowerCase(Locale.US).endsWith(".deepar")) {
            candidates.add(normalized + ".deepar");
            if (!normalized.startsWith("effects/")) {
                candidates.add("effects/" + normalized + ".deepar");
            }
        }

        for (String candidate : candidates) {
            String filename = candidate.substring(candidate.lastIndexOf('/') + 1).toLowerCase(Locale.US);
            if (shouldSkipDemoAsset(filename)) continue;
            if (assetExists(candidate)) return toAssetUri(candidate);
        }

        return null;
    }

    private String resolveStickerAliasAsset() {
        String[] dirs = new String[] {
            "effects/masks", "effects/fun", "effects/accessories",
            "effects/filters", "effects/makeup"
        };

        for (String dir : dirs) {
            String found = findFirstDeeparInDirectory(dir);
            if (found != null) return found;
        }

        return null;
    }

    private String findFirstDeeparInDirectory(String directory) {
        return findFirstDeeparInDirectoryRecursive(directory, 0);
    }

    private String findFirstDeeparInDirectoryRecursive(String directory, int depth) {
        if (depth > 3) return null;

        try {
            String[] entries = getContext().getAssets().list(directory);
            if (entries == null || entries.length == 0) return null;

            Arrays.sort(entries);
            for (String entry : entries) {
                if (entry == null || entry.trim().isEmpty()) continue;

                String normalizedEntry = entry.toLowerCase(Locale.US);
                String childPath = directory + "/" + entry;

                if (normalizedEntry.endsWith(".deepar")) {
                    if (shouldSkipDemoAsset(normalizedEntry)) continue;
                    return childPath;
                }

                String nested = findFirstDeeparInDirectoryRecursive(childPath, depth + 1);
                if (nested != null) return nested;
            }
        } catch (Exception ignored) {}

        return null;
    }

    private boolean shouldSkipDemoAsset(String normalizedFileName) {
        if (!normalizedFileName.endsWith(".deepar")) return false;

        String base = normalizedFileName.substring(0, normalizedFileName.length() - ".deepar".length());
        return base.equals("demo") || base.equals("sample") || base.equals("test") ||
            base.equals("fake") || base.equals("placeholder") ||
            base.startsWith("demo_") || base.startsWith("sample_") ||
            base.startsWith("test_") || base.startsWith("fake_") ||
            base.startsWith("placeholder_") ||
            base.endsWith("_demo") || base.endsWith("_sample") ||
            base.endsWith("_test") || base.endsWith("_fake") ||
            base.endsWith("_placeholder") ||
            base.contains("_demo_") || base.contains("_sample_") ||
            base.contains("_test_") || base.contains("_fake_") ||
            base.contains("_placeholder_");
    }

    private String resolveDefaultBeautyAsset() {
        String[] candidates = new String[] {
            "effects/beauty/beauty.deepar",
            "effects/beauty.deepar"
        };

        for (String candidate : candidates) {
            if (assetExists(candidate)) return candidate;
        }
        return null;
    }

    private boolean assetExists(String relativePath) {
        try {
            InputStream stream = getContext().getAssets().open(relativePath);
            stream.close();
            return true;
        } catch (Exception e) {
            return false;
        }
    }

    private String toAssetUri(String relativePath) {
        return "file:///android_asset/" + relativePath;
    }

    // ═══════════════════════════════════════════════════════════
    //  CLEANUP & LIFECYCLE
    // ═══════════════════════════════════════════════════════════

    private void fullCleanup() {
        stopZoomEnforcement();
        closeCamera();

        if (orientationListener != null) {
            orientationListener.disable();
        }

        if (deepAR != null) {
            try {
                deepAR.setRenderSurface(null, 0, 0);
                deepAR.release();
            } catch (Exception ignored) {}
            deepAR = null;
        }

        if (nativeSurfaceView != null) {
            ViewGroup parent = (ViewGroup) nativeSurfaceView.getParent();
            if (parent != null) parent.removeView(nativeSurfaceView);
            nativeSurfaceView = null;
        }

        // Reset WebView to opaque
        try {
            Activity activity = getActivity();
            if (activity != null && !activity.isFinishing() && !activity.isDestroyed()) {
                activity.runOnUiThread(() -> setWebViewTransparent(false));
            }
        } catch (Exception ignored) {}

        stopCameraThread();

        isInitialized.set(false);
        isCameraRunning.set(false);
        isCaptureSessionConfigured.set(false);
        isBeautyEffectLoaded.set(false);
        isProcessingFrame.set(false);
        firstFrameRendered.set(false);
        isPaused = false;
        reusableNv21Buffer = null;

        Arrays.fill(beautyParams, 0f);
        Log.i(TAG, "🧹 Full cleanup complete");
    }

    @Override
    protected void handleOnPause() {
        super.handleOnPause();
        isPaused = true;
        stopZoomEnforcement();
        closeCamera();
        if (deepAR != null) deepAR.setPaused(true);
        Log.d(TAG, "⏸ handleOnPause — camera closed, DeepAR paused");
    }

    @Override
    protected void handleOnResume() {
        super.handleOnResume();
        isPaused = false;
        if (deepAR != null) deepAR.setPaused(false);

        if (isInitialized.get() && hasCameraPermission()) {
            startCameraThreadIfNeeded();
            if (cameraHandler != null) {
                cameraHandler.postDelayed(() -> {
                    if (!isPaused && isInitialized.get() && cameraDevice == null) {
                        Log.i(TAG, "▶ handleOnResume — reopening camera...");
                        boolean opened = openCamera();
                        if (opened) {
                            startZoomEnforcement();
                            // v5.0: Re-apply transparency on resume if camera was active
                            mainHandler.post(() -> {
                                if (nativeSurfaceView != null && nativeSurfaceView.getVisibility() == View.VISIBLE) {
                                    setWebViewTransparent(true);
                                }
                            });
                        }
                    }
                }, 300); // v5.0: Reduced from 500ms to 300ms for faster resume
            }
        }

        if (orientationListener != null) orientationListener.enable();
    }

    @Override
    protected void handleOnDestroy() {
        fullCleanup();
        super.handleOnDestroy();
    }

    // ═══════════════════════════════════════════════════════════
    //  DeepAR EVENT CALLBACKS
    // ═══════════════════════════════════════════════════════════

    @Override
    public void initialized() {
        if (deepAR != null) {
            String beautyAsset = resolveDefaultBeautyAsset();
            if (beautyAsset != null) {
                deepAR.switchEffect("Beauty", toAssetUri(beautyAsset));
                isBeautyEffectLoaded.set(true);
                reapplyStoredBeautyParams();
                Log.i(TAG, "✅ Beauty effect auto-loaded");
            } else {
                isBeautyEffectLoaded.set(false);
                Log.w(TAG, "⚠ Beauty effect not found");
            }
        }

        JSObject data = new JSObject();
        data.put("ready", true);
        notifyListeners("initialized", data);
    }

    @Override
    public void screenshotTaken(Bitmap bitmap) {
        JSObject data = new JSObject();
        data.put("width", bitmap.getWidth());
        data.put("height", bitmap.getHeight());
        notifyListeners("screenshotTaken", data);
    }

    @Override
    public void faceVisibilityChanged(boolean visible) {
        JSObject data = new JSObject();
        data.put("faceVisible", visible);
        notifyListeners("faceVisibilityChanged", data);
    }

    @Override
    public void frameAvailable(android.media.Image image) {
        if (frameListener == null || image == null) return;

        try {
            ByteBuffer buffer = image.getPlanes()[0].getBuffer();
            byte[] bytes = new byte[buffer.remaining()];
            buffer.get(bytes);
            frameListener.onFrameAvailable(bytes, image.getWidth(), image.getHeight());
        } catch (Exception e) {
            Log.e(TAG, "frameAvailable callback failed", e);
        } finally {
            try { image.close(); } catch (Exception ignored) {}
        }
    }

    @Override
    public void error(ARErrorType errorType, String message) {
        Log.e(TAG, "DeepAR error [" + errorType + "]: " + message);

        if (message != null && message.contains("No Component with name MorphOffset")) {
            if (isBeautyRuntimeParamsEnabled.getAndSet(false)) {
                Log.w(TAG, "Beauty runtime params auto-disabled: MorphOffset component not found in current beauty effect");
            }
        }

        JSObject data = new JSObject();
        data.put("type", errorType.toString());
        data.put("message", message);
        notifyListeners("error", data);
    }

    @Override
    public void effectSwitched(String slot) {
        Log.d(TAG, "Effect switched: " + slot);

        if ("Beauty".equals(slot)) {
            isBeautyEffectLoading.set(false);
            isBeautyEffectLoaded.set(true);
            isBeautyRuntimeParamsEnabled.set(true);
            Log.d(TAG, "Beauty effect loaded — applying stored params");

            Activity activity = getActivity();
            if (activity != null && !activity.isFinishing()) {
                activity.runOnUiThread(this::reapplyStoredBeautyParams);
            }
        }
    }

    @Override public void imageVisibilityChanged(String gameObject, boolean visible) {}
    @Override public void videoRecordingStarted() { notifyListeners("recordingStarted", new JSObject()); }
    @Override public void videoRecordingFinished() { notifyListeners("recordingFinished", new JSObject()); }
    @Override public void videoRecordingFailed() { notifyListeners("recordingFailed", new JSObject()); }
    @Override public void videoRecordingPrepared() {}
    @Override public void shutdownFinished() {}

    private JSObject ok(String msg) {
        JSObject obj = new JSObject();
        obj.put("success", true);
        obj.put("message", msg);
        return obj;
    }
}
