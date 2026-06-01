package com.merilive.app.plugin;

import android.Manifest;
import android.graphics.ImageFormat;
import android.graphics.Matrix;
import android.graphics.Rect;
import android.graphics.YuvImage;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.util.Base64;
import android.util.Log;
import android.util.Size;
import android.os.Handler;
import android.os.Looper;
import android.view.ViewGroup;
import android.widget.FrameLayout;

import androidx.annotation.NonNull;
import androidx.camera.core.Camera;
import androidx.camera.core.CameraSelector;
import androidx.camera.core.ImageAnalysis;
import androidx.camera.core.ImageCapture;
import androidx.camera.core.ImageCaptureException;
import androidx.camera.core.ImageProxy;
import androidx.camera.core.Preview;
import androidx.camera.lifecycle.ProcessCameraProvider;
import androidx.camera.video.FallbackStrategy;
import androidx.camera.video.FileOutputOptions;
import androidx.camera.video.Quality;
import androidx.camera.video.QualitySelector;
import androidx.camera.video.Recorder;
import androidx.camera.video.Recording;
import androidx.camera.video.VideoCapture;
import androidx.camera.video.VideoRecordEvent;
import androidx.camera.view.PreviewView;
import androidx.core.content.ContextCompat;
import androidx.lifecycle.LifecycleOwner;

import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;
import com.google.common.util.concurrent.ListenableFuture;

import java.io.File;
import java.io.FileInputStream;
import java.io.IOException;
import java.io.ByteArrayOutputStream;
import java.nio.ByteBuffer;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/**
 * NativeCameraPlugin — Pkg272 (Face Verification native).
 *
 * Adds to existing CameraX bridge:
 *   capturePhoto()                           → JPEG base64 (ImageCapture)
 *   captureFrame()                           → low-overhead JPEG snapshot
 *   startVideoRecording({maxDurationMs})     → MP4 H.264 + AAC via Recorder
 *   stopVideoRecording()                     → returns base64 MP4 + uri
 */
@CapacitorPlugin(
    name = "NativeCamera",
    permissions = {
        @Permission(strings = { Manifest.permission.CAMERA }, alias = "camera"),
        @Permission(strings = { Manifest.permission.RECORD_AUDIO }, alias = "microphone")
    }
)
public class NativeCameraPlugin extends Plugin {

    private static final String TAG = "NativeCameraPlugin";

    private ProcessCameraProvider cameraProvider;
    private Camera camera;
    private PreviewView previewView;
    private CameraSelector currentSelector = CameraSelector.DEFAULT_FRONT_CAMERA;
    private Size targetResolution = new Size(1280, 720);

    private ImageCapture imageCapture;
    private VideoCapture<Recorder> videoCapture;
    private Recording activeRecording;
    private File activeRecordingFile;
    private PluginCall pendingStopCall;
    private long recordingStartedAt;
    private final ExecutorService cameraExecutor = Executors.newSingleThreadExecutor();
    private final Object frameLock = new Object();
    private byte[] latestFrameJpeg;
    private int latestFrameWidth;
    private int latestFrameHeight;
    private int latestFrameRotation;
    private long lastFrameEncodeAt;

    @Override
    public void load() {
        Log.d(TAG, "NativeCameraPlugin loaded");
    }

    @Override
    public void handleOnPause() {
        super.handleOnPause();
        // Do not tear down CameraX on every pause. Android fires onPause for
        // permission sheets, notification shade, focus churn and activity
        // overlays while the GoLive screen is still visible; releasing here
        // removes the native PreviewView behind the WebView, leaving only the
        // transparent/light React shell — the user-visible white preview. The
        // owning React screen calls NativeCamera.stop() on back/unmount, and
        // handleOnDestroy() is still the hard safety release.
        Log.d(TAG, "handleOnPause: keeping native camera alive until explicit stop/destroy");
    }

    @Override
    public void handleOnDestroy() {
        super.handleOnDestroy();
        releaseCameraResources(true);
        cameraExecutor.shutdownNow();
        CameraOwnership.forceRelease();
    }

    // ============================================================
    // PUBLIC API
    // ============================================================

    @PluginMethod
    public void isAvailable(PluginCall call) {
        JSObject ret = new JSObject();
        ret.put("available", true);
        ret.put("backend", "camerax");
        ret.put("livekit", true);
        ret.put("photo", true);
        ret.put("video", true);
        call.resolve(ret);
    }

    @PluginMethod
    public void start(PluginCall call) {
        if (getPermissionState("camera") != PermissionState.GRANTED) {
            requestPermissionForAlias("camera", call, "permissionCallback");
            return;
        }

        // Pkg415: cross-plugin camera arbiter — if LiveKit (or another
        // plugin) currently owns Camera2, refuse rather than racing into a
        // CAMERA_IN_USE white screen. Caller (JS) should disconnect the
        // active session first.
        String existingOwner = CameraOwnership.owner();
        if (existingOwner != null && !CameraOwnership.OWNER_NATIVE_CAMERA.equals(existingOwner)) {
            call.reject("Camera busy: held by " + existingOwner);
            return;
        }
        if (!CameraOwnership.acquire(CameraOwnership.OWNER_NATIVE_CAMERA, false)) {
            call.reject("Camera busy: held by " + CameraOwnership.owner());
            return;
        }

        String lens = call.getString("lens", "front");
        String res = call.getString("resolution", "1080p");

        currentSelector = "back".equalsIgnoreCase(lens)
            ? CameraSelector.DEFAULT_BACK_CAMERA
            : CameraSelector.DEFAULT_FRONT_CAMERA;

        targetResolution = "720p".equalsIgnoreCase(res)
            ? new Size(1280, 720)
            : new Size(1920, 1080);

        getActivity().runOnUiThread(() -> bindCameraAsync(call, lens, res));
    }

    @PluginMethod
    public void stop(PluginCall call) {
        getActivity().runOnUiThread(() -> {
            try {
                if (activeRecording != null) {
                    try { activeRecording.stop(); } catch (Exception ignored) {}
                    activeRecording = null;
                }
                if (cameraProvider != null) cameraProvider.unbindAll();
                // Null the retained use-case references so the next start()
                // rebinds a fresh Preview / ImageCapture / VideoCapture
                // against the current lifecycle. Without this, a stale
                // imageCapture/videoCapture left over from a prior session
                // would be referenced by capturePhoto/startVideoRecording
                // and trigger CameraX "use-case not attached" errors —
                // which surface to the user as a frozen / blank preview.
                imageCapture = null;
                videoCapture = null;
                camera = null;
                synchronized (frameLock) {
                    latestFrameJpeg = null;
                    latestFrameWidth = 0;
                    latestFrameHeight = 0;
                    latestFrameRotation = 0;
                    lastFrameEncodeAt = 0L;
                }
                removePreviewView();
                // Pkg415: release Camera2 ownership so LiveKit (or another plugin) can claim it.
                CameraOwnership.release(CameraOwnership.OWNER_NATIVE_CAMERA);
                call.resolve();
            } catch (Exception e) {
                call.reject("Failed to stop camera: " + e.getMessage());
            }
        });
    }

    @PluginMethod
    public void switchCamera(PluginCall call) {
        currentSelector = (currentSelector == CameraSelector.DEFAULT_FRONT_CAMERA)
            ? CameraSelector.DEFAULT_BACK_CAMERA
            : CameraSelector.DEFAULT_FRONT_CAMERA;

        getActivity().runOnUiThread(() -> {
            String lens = currentSelector == CameraSelector.DEFAULT_FRONT_CAMERA ? "front" : "back";
            bindCameraAsync(call, lens, targetResolution.getHeight() == 720 ? "720p" : "1080p");
        });
    }

    @PluginMethod
    public void setTorch(PluginCall call) {
        boolean on = Boolean.TRUE.equals(call.getBoolean("on", false));
        if (camera == null
                || camera.getCameraInfo() == null
                || !camera.getCameraInfo().hasFlashUnit()) {
            call.reject("Torch not available on this lens");
            return;
        }
        camera.getCameraControl().enableTorch(on);
        JSObject ret = new JSObject();
        ret.put("on", on);
        call.resolve(ret);
    }

    // ---------- NEW: capture photo ----------
    @PluginMethod
    public void capturePhoto(PluginCall call) {
        if (imageCapture == null) {
            resolveLatestFrame(call);
            return;
        }
        // Pkg416: offload base64 encode to background. On main thread it
        // shows up in Logcat as UISlowBinder / Skipped N frames and stalls
        // the preview Surface for ~120ms on slower CPUs.
        imageCapture.takePicture(
            cameraExecutor,
            new ImageCapture.OnImageCapturedCallback() {
                @Override
                public void onCaptureSuccess(@NonNull ImageProxy image) {
                    try {
                        ByteBuffer buf = image.getPlanes()[0].getBuffer();
                        byte[] bytes = new byte[buf.remaining()];
                        buf.get(bytes);
                        final String b64 = Base64.encodeToString(bytes, Base64.NO_WRAP);
                        final int w = image.getWidth();
                        final int h = image.getHeight();
                        JSObject ret = new JSObject();
                        ret.put("base64", b64);
                        ret.put("mimeType", "image/jpeg");
                        ret.put("width", w);
                        ret.put("height", h);
                        call.resolve(ret);
                    } catch (Exception e) {
                        call.reject("Encode failed: " + e.getMessage());
                    } finally {
                        image.close();
                    }
                }
                @Override
                public void onError(@NonNull ImageCaptureException ex) {
                    call.reject("capturePhoto failed: " + ex.getMessage());
                }
            }
        );
    }

    // captureFrame is an alias for capturePhoto used by the pose-frame loop
    @PluginMethod
    public void captureFrame(PluginCall call) {
        resolveLatestFrame(call);
    }

    // ---------- NEW: video recording ----------
    @PluginMethod
    public void startVideoRecording(PluginCall call) {
        if (cameraProvider == null) {
            call.reject("Camera not started");
            return;
        }
        if (activeRecording != null) {
            call.reject("Recording already in progress");
            return;
        }
        if (getPermissionState("microphone") != PermissionState.GRANTED) {
            requestPermissionForAlias("microphone", call, "micPermissionCallback");
            return;
        }
        // Pkg416: VideoCapture is bound lazily — preview+analysis+video at
        // once exceeds the hardware use-case budget on many mid-range
        // devices and abandons the preview Surface (white screen).
        getActivity().runOnUiThread(() -> {
            try {
                if (videoCapture == null) {
                    bindUseCases(true);
                }
                if (videoCapture == null) {
                    call.reject("Native video recording is not available on this device");
                    return;
                }
                File outDir = getContext().getCacheDir();
                activeRecordingFile = new File(outDir, "face-verify-" + System.currentTimeMillis() + ".mp4");
                FileOutputOptions outOpts = new FileOutputOptions.Builder(activeRecordingFile).build();

                //noinspection MissingPermission
                activeRecording = videoCapture.getOutput()
                    .prepareRecording(getContext(), outOpts)
                    .withAudioEnabled()
                    .start(ContextCompat.getMainExecutor(getContext()), event -> {
                        if (event instanceof VideoRecordEvent.Finalize) {
                            VideoRecordEvent.Finalize fin = (VideoRecordEvent.Finalize) event;
                            finalizeRecording(fin.hasError(), fin.getError());
                        }
                    });
                recordingStartedAt = System.currentTimeMillis();
                JSObject ret = new JSObject();
                ret.put("recording", true);
                call.resolve(ret);
            } catch (Exception e) {
                Log.e(TAG, "startVideoRecording failed", e);
                call.reject("startVideoRecording failed: " + e.getMessage());
            }
        });
    }

    @PluginMethod
    public void stopVideoRecording(PluginCall call) {
        if (activeRecording == null) {
            call.reject("No active recording");
            return;
        }
        pendingStopCall = call;
        try {
            activeRecording.stop();
        } catch (Exception e) {
            pendingStopCall = null;
            call.reject("stopVideoRecording failed: " + e.getMessage());
        }
    }

    @PermissionCallback
    private void micPermissionCallback(PluginCall call) {
        if (getPermissionState("microphone") == PermissionState.GRANTED) {
            startVideoRecording(call);
        } else {
            call.reject("Microphone permission denied");
        }
    }

    private void finalizeRecording(boolean hasError, int errCode) {
        Recording r = activeRecording;
        activeRecording = null;
        File f = activeRecordingFile;
        long duration = System.currentTimeMillis() - recordingStartedAt;
        PluginCall call = pendingStopCall;
        pendingStopCall = null;

        // Encode file to base64 on a worker thread
        Executors.newSingleThreadExecutor().execute(() -> {
            try {
                if (hasError) {
                    if (call != null) call.reject("Recording finalize error code=" + errCode);
                    if (f != null && f.exists()) f.delete();
                    return;
                }
                if (f == null || !f.exists()) {
                    if (call != null) call.reject("Recording file missing");
                    return;
                }
                long size = f.length();
                String b64 = readFileBase64(f);
                JSObject ret = new JSObject();
                ret.put("uri", "file://" + f.getAbsolutePath());
                ret.put("base64", b64);
                ret.put("mimeType", "video/mp4");
                ret.put("sizeBytes", size);
                ret.put("durationMs", duration);
                if (call != null) call.resolve(ret);
            } catch (Exception e) {
                if (call != null) call.reject("Read recording failed: " + e.getMessage());
            }
        });
    }

    private String readFileBase64(File f) throws IOException {
        try (FileInputStream fis = new FileInputStream(f)) {
            byte[] buf = new byte[(int) f.length()];
            int read = 0;
            while (read < buf.length) {
                int n = fis.read(buf, read, buf.length - read);
                if (n <= 0) break;
                read += n;
            }
            return Base64.encodeToString(buf, 0, read, Base64.NO_WRAP);
        }
    }

    private void resolveLatestFrame(PluginCall call) {
        byte[] jpeg;
        int width;
        int height;
        int rotation;
        synchronized (frameLock) {
            jpeg = latestFrameJpeg;
            width = latestFrameWidth;
            height = latestFrameHeight;
            rotation = latestFrameRotation;
        }
        if (jpeg == null || jpeg.length == 0) {
            if (imageCapture != null) {
                capturePhoto(call);
                return;
            }
            call.reject("Camera frame not ready");
            return;
        }
        JSObject ret = new JSObject();
        ret.put("base64", Base64.encodeToString(jpeg, Base64.NO_WRAP));
        ret.put("mimeType", "image/jpeg");
        ret.put("width", width);
        ret.put("height", height);
        ret.put("rotation", rotation);
        call.resolve(ret);
    }

    private byte[] imageProxyToJpeg(ImageProxy image, int quality) throws IOException {
        ImageProxy.PlaneProxy[] planes = image.getPlanes();
        ByteBuffer yBuffer = planes[0].getBuffer();
        ByteBuffer uBuffer = planes[1].getBuffer();
        ByteBuffer vBuffer = planes[2].getBuffer();

        int width = image.getWidth();
        int height = image.getHeight();
        byte[] nv21 = new byte[width * height * 3 / 2];

        int yRowStride = planes[0].getRowStride();
        int yPixelStride = planes[0].getPixelStride();
        int pos = 0;
        for (int row = 0; row < height; row++) {
            for (int col = 0; col < width; col++) {
                nv21[pos++] = yBuffer.get(row * yRowStride + col * yPixelStride);
            }
        }

        int chromaHeight = height / 2;
        int chromaWidth = width / 2;
        int uRowStride = planes[1].getRowStride();
        int vRowStride = planes[2].getRowStride();
        int uPixelStride = planes[1].getPixelStride();
        int vPixelStride = planes[2].getPixelStride();
        for (int row = 0; row < chromaHeight; row++) {
            for (int col = 0; col < chromaWidth; col++) {
                nv21[pos++] = vBuffer.get(row * vRowStride + col * vPixelStride);
                nv21[pos++] = uBuffer.get(row * uRowStride + col * uPixelStride);
            }
        }

        YuvImage yuv = new YuvImage(nv21, ImageFormat.NV21, width, height, null);
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        if (!yuv.compressToJpeg(new Rect(0, 0, width, height), quality, out)) {
            throw new IOException("YUV JPEG compression failed");
        }
        return out.toByteArray();
    }

    private byte[] normalizeJpegForFaceDetection(byte[] jpeg, int rotationDegrees, boolean mirrorHorizontal, int quality) throws IOException {
        Bitmap decoded = BitmapFactory.decodeByteArray(jpeg, 0, jpeg.length);
        if (decoded == null) return jpeg;
        Matrix matrix = new Matrix();
        if (rotationDegrees != 0) matrix.postRotate(rotationDegrees);
        if (mirrorHorizontal) {
            matrix.postScale(-1f, 1f);
        }
        Bitmap transformed = Bitmap.createBitmap(decoded, 0, 0, decoded.getWidth(), decoded.getHeight(), matrix, true);
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        transformed.compress(Bitmap.CompressFormat.JPEG, quality, out);
        if (transformed != decoded) transformed.recycle();
        decoded.recycle();
        return out.toByteArray();
    }

    // ============================================================
    // INTERNAL
    // ============================================================

    @PermissionCallback
    private void permissionCallback(PluginCall call) {
        if (getPermissionState("camera") == PermissionState.GRANTED) {
            start(call);
        } else {
            call.reject("Camera permission denied");
        }
    }

    private void bindCameraAsync(PluginCall call, String lens, String res) {
        try {
            // Pkg416: make sure the PreviewView is attached AND laid out before we
            // call setSurfaceProvider — otherwise CameraX binds against a Surface
            // whose isValid()==false, the system logs "handleResized abandoned!"
            // and the WebView's default opaque background paints over the empty
            // PreviewView → the user-visible white screen.
            ensurePreviewViewSync();
            if (previewView == null) {
                CameraOwnership.release(CameraOwnership.OWNER_NATIVE_CAMERA);
                call.reject("Camera setup failed: preview attach failed");
                return;
            }
            // Pkg416: post() guarantees we run AFTER the next layout pass, so the
            // PreviewView has a valid Surface by the time CameraX binds to it.
            previewView.post(() -> {
                try {
                    ListenableFuture<ProcessCameraProvider> future =
                        ProcessCameraProvider.getInstance(getContext());
                    future.addListener(() -> {
                        try {
                            cameraProvider = future.get();
                            // Pkg416: bind preview+analysis only on the hot path.
                            // VideoCapture is rebound lazily inside startVideoRecording.
                            // Binding 3 use-cases simultaneously is what locks the
                            // hardware on Oppo/OnePlus mid-range and causes the
                            // Surface-abandoned white preview.
                            bindUseCases(false);
                            resolveStartWhenPreviewStreams(call, lens, res);
                        } catch (Exception e) {
                            Log.e(TAG, "bindCameraAsync failed", e);
                            CameraOwnership.release(CameraOwnership.OWNER_NATIVE_CAMERA);
                            removePreviewView();
                            call.reject("Failed to start camera: " + e.getMessage());
                        }
                    }, ContextCompat.getMainExecutor(getContext()));
                } catch (Exception e) {
                    Log.e(TAG, "bindCameraAsync post failed", e);
                    CameraOwnership.release(CameraOwnership.OWNER_NATIVE_CAMERA);
                    removePreviewView();
                    call.reject("Camera setup failed: " + e.getMessage());
                }
            });
        } catch (Exception e) {
            Log.e(TAG, "bindCameraAsync setup failed", e);
            CameraOwnership.release(CameraOwnership.OWNER_NATIVE_CAMERA);
            removePreviewView();
            call.reject("Camera setup failed: " + e.getMessage());
        }
    }

    /**
     * Pkg416: bind preview + analysis (+ optional video). VideoCapture is added
     * only when the JS layer actually calls startVideoRecording, because binding
     * Preview + ImageAnalysis + VideoCapture together exceeds the simultaneous
     * use-case limit on many Snapdragon 6xx / MediaTek Helio devices and the
     * preview Surface is silently dropped (UISlowBinder + handleResized
     * abandoned + completely white WebView).
     */
    private void bindUseCases(boolean includeVideo) {
        Preview preview = new Preview.Builder()
            .setTargetResolution(targetResolution)
            .build();
        preview.setSurfaceProvider(previewView.getSurfaceProvider());

        ImageAnalysis analysis = new ImageAnalysis.Builder()
            .setTargetResolution(targetResolution)
            .setBackpressureStrategy(ImageAnalysis.STRATEGY_KEEP_ONLY_LATEST)
            .build();
        analysis.setAnalyzer(cameraExecutor, image -> {
            try {
                long now = System.currentTimeMillis();
                if (now - lastFrameEncodeAt < 350) {
                    return;
                }
                int rotation = image.getImageInfo().getRotationDegrees();
                // Do not mirror analyzer frames. Mirroring is only a preview concern;
                // mirrored JPEGs invert yaw and cause left/right liveness to fail.
                byte[] jpeg = normalizeJpegForFaceDetection(imageProxyToJpeg(image, 82), rotation, false, 82);
                synchronized (frameLock) {
                    latestFrameJpeg = jpeg;
                    latestFrameWidth = (rotation == 90 || rotation == 270) ? image.getHeight() : image.getWidth();
                    latestFrameHeight = (rotation == 90 || rotation == 270) ? image.getWidth() : image.getHeight();
                    latestFrameRotation = 0;
                    lastFrameEncodeAt = now;
                }
            } catch (Exception e) {
                Log.w(TAG, "Frame analyzer encode failed: " + e.getMessage());
            } finally {
                image.close();
            }
        });

        imageCapture = new ImageCapture.Builder()
            .setCaptureMode(ImageCapture.CAPTURE_MODE_MINIMIZE_LATENCY)
            .setTargetResolution(targetResolution)
            .build();

        VideoCapture<Recorder> vc = null;
        if (includeVideo) {
            Quality preferred = targetResolution.getHeight() >= 1080 ? Quality.FHD : Quality.HD;
            Recorder recorder = new Recorder.Builder()
                .setQualitySelector(QualitySelector.from(
                    preferred, FallbackStrategy.lowerQualityOrHigherThan(Quality.SD)))
                .build();
            vc = VideoCapture.withOutput(recorder);
        }

        cameraProvider.unbindAll();
        try {
            if (includeVideo && vc != null) {
                // Recording path: drop ImageCapture to stay within the
                // 3-use-case hardware budget on most phones.
                camera = cameraProvider.bindToLifecycle(
                    (LifecycleOwner) getActivity(),
                    currentSelector,
                    preview,
                    analysis,
                    vc
                );
                videoCapture = vc;
                imageCapture = null;
            } else {
                // Hot path: preview + analysis + imageCapture. Light enough
                // to bind reliably on every device we ship to.
                camera = cameraProvider.bindToLifecycle(
                    (LifecycleOwner) getActivity(),
                    currentSelector,
                    preview,
                    analysis,
                    imageCapture
                );
                videoCapture = null;
            }
        } catch (Exception e) {
            Log.w(TAG, "primary bind failed, retry preview+analysis only: " + e.getMessage());
            try {
                cameraProvider.unbindAll();
                camera = cameraProvider.bindToLifecycle(
                    (LifecycleOwner) getActivity(),
                    currentSelector,
                    preview,
                    analysis
                );
                videoCapture = null;
                imageCapture = null;
            } catch (Exception e2) {
                Log.w(TAG, "preview+analysis bind failed, retry preview only: " + e2.getMessage());
                cameraProvider.unbindAll();
                camera = cameraProvider.bindToLifecycle(
                    (LifecycleOwner) getActivity(),
                    currentSelector,
                    preview
                );
                videoCapture = null;
                imageCapture = null;
            }
        }
    }

    private void resolveStartWhenPreviewStreams(PluginCall call, String lens, String res) {
        if (previewView == null || getActivity() == null) {
            call.reject("Preview surface missing");
            return;
        }

        final boolean[] resolved = new boolean[] { false };
        LifecycleOwner owner = (LifecycleOwner) getActivity();
        Handler handler = new Handler(Looper.getMainLooper());

        Runnable timeout = () -> {
            if (resolved[0]) return;
            resolved[0] = true;
            try { previewView.getPreviewStreamState().removeObservers(owner); } catch (Exception ignored) {}
            Log.w(TAG, "Preview did not reach STREAMING before timeout");
            setWebViewCameraBackground(0xFF000000);
            call.reject("Camera preview did not start");
        };

        try { previewView.getPreviewStreamState().removeObservers(owner); } catch (Exception ignored) {}
        previewView.getPreviewStreamState().observe(owner, state -> {
            if (resolved[0]) return;
            if (state != PreviewView.StreamState.STREAMING) return;
            resolved[0] = true;
            handler.removeCallbacks(timeout);
            try { previewView.getPreviewStreamState().removeObservers(owner); } catch (Exception ignored) {}
            setWebViewCameraBackground(0x00000000);
            JSObject ret = new JSObject();
            ret.put("started", true);
            ret.put("lens", lens);
            ret.put("resolution", res);
            call.resolve(ret);
        });
        handler.postDelayed(timeout, 3500);
    }

    private void setWebViewCameraBackground(int color) {
        if (bridge == null || bridge.getWebView() == null) return;
        bridge.getWebView().setBackgroundColor(color);
        ViewGroup root = (ViewGroup) bridge.getWebView().getParent();
        if (root != null) root.setBackgroundColor(color);
    }

    private void ensurePreviewViewSync() {
        if (previewView != null) return;
        previewView = new PreviewView(getContext());
        // Force TextureView-backed rendering. CameraX PreviewView defaults to
        // PERFORMANCE/SurfaceView on many OnePlus/Oppo devices; SurfaceView is
        // a separate compositor layer and often disappears when placed behind
        // a transparent Capacitor WebView, even though Camera2 keeps producing
        // frames. COMPATIBLE uses TextureView so normal z-order works.
        previewView.setImplementationMode(PreviewView.ImplementationMode.COMPATIBLE);
        previewView.setScaleType(PreviewView.ScaleType.FILL_CENTER);
        previewView.setBackgroundColor(0xFF000000);
        FrameLayout.LayoutParams lp = new FrameLayout.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT,
            ViewGroup.LayoutParams.MATCH_PARENT
        );
        if (bridge != null && bridge.getWebView() != null) {
            ViewGroup root = (ViewGroup) bridge.getWebView().getParent();
            if (root != null) {
                root.addView(previewView, 0, lp);
                setWebViewCameraBackground(0xFF000000);
            }
        }
    }

    private void removePreviewView() {
        if (previewView == null) return;
        ViewGroup parent = (ViewGroup) previewView.getParent();
        if (parent != null) parent.removeView(previewView);
        previewView = null;
        if (bridge != null && bridge.getWebView() != null) {
            bridge.getWebView().setBackgroundColor(0xFF000000);
            ViewGroup root = (ViewGroup) bridge.getWebView().getParent();
            if (root != null) root.setBackgroundColor(0xFF000000);
        }
    }

    private void releaseCameraResources(boolean destroyProvider) {
        try {
            if (getActivity() == null) return;
            Runnable release = () -> {
                try {
                    if (activeRecording != null) {
                        try { activeRecording.stop(); } catch (Exception ignored) {}
                        activeRecording = null;
                    }
                    if (cameraProvider != null) {
                        try { cameraProvider.unbindAll(); } catch (Exception ignored) {}
                        if (destroyProvider) cameraProvider = null;
                    }
                    imageCapture = null;
                    videoCapture = null;
                    camera = null;
                    synchronized (frameLock) {
                        latestFrameJpeg = null;
                        latestFrameWidth = 0;
                        latestFrameHeight = 0;
                        latestFrameRotation = 0;
                        lastFrameEncodeAt = 0L;
                    }
                    removePreviewView();
                    CameraOwnership.release(CameraOwnership.OWNER_NATIVE_CAMERA);
                } catch (Exception e) {
                    Log.w(TAG, "releaseCameraResources failed: " + e.getMessage());
                }
            };
            if (Looper.myLooper() == Looper.getMainLooper()) release.run();
            else getActivity().runOnUiThread(release);
        } catch (Exception e) {
            Log.w(TAG, "releaseCameraResources schedule failed: " + e.getMessage());
            CameraOwnership.release(CameraOwnership.OWNER_NATIVE_CAMERA);
        }
    }
}
