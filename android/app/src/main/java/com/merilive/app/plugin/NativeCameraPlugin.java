package com.merilive.app.plugin;

import android.Manifest;
import android.util.Base64;
import android.util.Log;
import android.util.Size;
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
import java.nio.ByteBuffer;
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
    private Size targetResolution = new Size(1920, 1080);

    private ImageCapture imageCapture;
    private VideoCapture<Recorder> videoCapture;
    private Recording activeRecording;
    private File activeRecordingFile;
    private PluginCall pendingStopCall;
    private long recordingStartedAt;

    @Override
    public void load() {
        Log.d(TAG, "NativeCameraPlugin loaded");
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
                removePreviewView();
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
            call.reject("Camera not started");
            return;
        }
        imageCapture.takePicture(
            ContextCompat.getMainExecutor(getContext()),
            new ImageCapture.OnImageCapturedCallback() {
                @Override
                public void onCaptureSuccess(@NonNull ImageProxy image) {
                    try {
                        ByteBuffer buf = image.getPlanes()[0].getBuffer();
                        byte[] bytes = new byte[buf.remaining()];
                        buf.get(bytes);
                        String b64 = Base64.encodeToString(bytes, Base64.NO_WRAP);
                        JSObject ret = new JSObject();
                        ret.put("base64", b64);
                        ret.put("mimeType", "image/jpeg");
                        ret.put("width", image.getWidth());
                        ret.put("height", image.getHeight());
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
        capturePhoto(call);
    }

    // ---------- NEW: video recording ----------
    @PluginMethod
    public void startVideoRecording(PluginCall call) {
        if (videoCapture == null) {
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
        try {
            File outDir = getContext().getCacheDir();
            activeRecordingFile = new File(outDir, "face-verify-" + System.currentTimeMillis() + ".mp4");
            FileOutputOptions outOpts = new FileOutputOptions.Builder(activeRecordingFile).build();

            // withAudioEnabled is allowed only with RECORD_AUDIO permission (checked above)
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
            ensurePreviewViewSync();
            ListenableFuture<ProcessCameraProvider> future =
                ProcessCameraProvider.getInstance(getContext());
            future.addListener(() -> {
                try {
                    cameraProvider = future.get();
                    bindUseCases();
                    JSObject ret = new JSObject();
                    ret.put("started", true);
                    ret.put("lens", lens);
                    ret.put("resolution", res);
                    call.resolve(ret);
                } catch (Exception e) {
                    Log.e(TAG, "bindCameraAsync failed", e);
                    call.reject("Failed to start camera: " + e.getMessage());
                }
            }, ContextCompat.getMainExecutor(getContext()));
        } catch (Exception e) {
            Log.e(TAG, "bindCameraAsync setup failed", e);
            call.reject("Camera setup failed: " + e.getMessage());
        }
    }

    private void bindUseCases() {
        Preview preview = new Preview.Builder()
            .setTargetResolution(targetResolution)
            .build();
        preview.setSurfaceProvider(previewView.getSurfaceProvider());

        ImageAnalysis analysis = new ImageAnalysis.Builder()
            .setTargetResolution(targetResolution)
            .setBackpressureStrategy(ImageAnalysis.STRATEGY_KEEP_ONLY_LATEST)
            .build();

        imageCapture = new ImageCapture.Builder()
            .setCaptureMode(ImageCapture.CAPTURE_MODE_MINIMIZE_LATENCY)
            .setTargetResolution(targetResolution)
            .build();

        Quality preferred = targetResolution.getHeight() >= 1080 ? Quality.FHD : Quality.HD;
        Recorder recorder = new Recorder.Builder()
            .setQualitySelector(QualitySelector.from(
                preferred, FallbackStrategy.lowerQualityOrHigherThan(Quality.SD)))
            .build();
        videoCapture = VideoCapture.withOutput(recorder);

        cameraProvider.unbindAll();
        try {
            // Bind preview + imageCapture + videoCapture (analysis omitted —
            // CameraX max 3 use-cases on most devices, video > analysis here)
            camera = cameraProvider.bindToLifecycle(
                (LifecycleOwner) getActivity(),
                currentSelector,
                preview,
                imageCapture,
                videoCapture
            );
        } catch (Exception e) {
            // Some devices reject 3 use-cases — fall back to preview+video only
            Log.w(TAG, "3-use-case bind failed, retry with preview+video: " + e.getMessage());
            camera = cameraProvider.bindToLifecycle(
                (LifecycleOwner) getActivity(),
                currentSelector,
                preview,
                videoCapture
            );
            imageCapture = null;
        }
    }

    private void ensurePreviewViewSync() {
        if (previewView != null) return;
        previewView = new PreviewView(getContext());
        FrameLayout.LayoutParams lp = new FrameLayout.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT,
            ViewGroup.LayoutParams.MATCH_PARENT
        );
        if (bridge != null && bridge.getWebView() != null) {
            ViewGroup root = (ViewGroup) bridge.getWebView().getParent();
            if (root != null) {
                root.addView(previewView, 0, lp);
                bridge.getWebView().setBackgroundColor(0x00000000);
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
        }
    }
}
