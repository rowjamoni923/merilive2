package com.merilive.app.plugin;

import android.Manifest;
import android.content.pm.PackageManager;
import android.util.Log;
import android.util.Size;
import android.view.ViewGroup;
import android.widget.FrameLayout;

import androidx.annotation.NonNull;
import androidx.camera.core.Camera;
import androidx.camera.core.CameraSelector;
import androidx.camera.core.ImageAnalysis;
import androidx.camera.core.Preview;
import androidx.camera.lifecycle.ProcessCameraProvider;
import androidx.camera.view.PreviewView;
import androidx.core.content.ContextCompat;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;
import com.google.common.util.concurrent.ListenableFuture;

import java.util.concurrent.ExecutionException;

/**
 * NativeCameraPlugin — Step 1 skeleton.
 *
 * Capacitor bridge around Android CameraX. Exposes professional camera
 * controls to JS (start/stop/switch/torch/zoom). Future steps wire the
 * frames into LiveKit Android SDK as a native WebRTC track for Live and
 * Private Call. Replaces the browser getUserMedia() pipeline.
 *
 * JS API (see src/plugins/NativeCamera.ts):
 *   start({ lens: 'front' | 'back', resolution: '1080p' | '720p' })
 *   stop()
 *   switchCamera()
 *   setTorch({ on: boolean })
 *   isAvailable()
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
        call.resolve(ret);
    }

    @PluginMethod
    public void start(PluginCall call) {
        if (getPermissionState("camera") != com.getcapacitor.PermissionState.GRANTED) {
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

        getActivity().runOnUiThread(() -> {
            try {
                bindCamera();
                JSObject ret = new JSObject();
                ret.put("started", true);
                ret.put("lens", lens);
                ret.put("resolution", res);
                call.resolve(ret);
            } catch (Exception e) {
                Log.e(TAG, "Failed to start camera", e);
                call.reject("Failed to start camera: " + e.getMessage());
            }
        });
    }

    @PluginMethod
    public void stop(PluginCall call) {
        getActivity().runOnUiThread(() -> {
            try {
                if (cameraProvider != null) {
                    cameraProvider.unbindAll();
                }
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
            try {
                bindCamera();
                JSObject ret = new JSObject();
                ret.put("lens", currentSelector == CameraSelector.DEFAULT_FRONT_CAMERA ? "front" : "back");
                call.resolve(ret);
            } catch (Exception e) {
                call.reject("Switch failed: " + e.getMessage());
            }
        });
    }

    @PluginMethod
    public void setTorch(PluginCall call) {
        boolean on = Boolean.TRUE.equals(call.getBoolean("on", false));
        if (camera == null || camera.getCameraInfo() == null
                || !camera.getCameraInfo().hasFlashUnit()) {
            call.reject("Torch not available on this lens");
            return;
        }
        camera.getCameraControl().enableTorch(on);
        JSObject ret = new JSObject();
        ret.put("on", on);
        call.resolve(ret);
    }

    // ============================================================
    // INTERNAL
    // ============================================================

    @PermissionCallback
    private void permissionCallback(PluginCall call) {
        if (getPermissionState("camera") == com.getcapacitor.PermissionState.GRANTED) {
            start(call);
        } else {
            call.reject("Camera permission denied");
        }
    }

    private void bindCamera() throws ExecutionException, InterruptedException {
        if (cameraProvider == null) {
            ListenableFuture<ProcessCameraProvider> future =
                ProcessCameraProvider.getInstance(getContext());
            cameraProvider = future.get();
        }

        ensurePreviewView();

        Preview preview = new Preview.Builder()
            .setTargetResolution(targetResolution)
            .build();
        preview.setSurfaceProvider(previewView.getSurfaceProvider());

        ImageAnalysis analysis = new ImageAnalysis.Builder()
            .setTargetResolution(targetResolution)
            .setBackpressureStrategy(ImageAnalysis.STRATEGY_KEEP_ONLY_LATEST)
            .build();

        cameraProvider.unbindAll();
        camera = cameraProvider.bindToLifecycle(
            (androidx.lifecycle.LifecycleOwner) getActivity(),
            currentSelector,
            preview,
            analysis
        );
    }

    private void ensurePreviewView() {
        if (previewView != null) return;
        getActivity().runOnUiThread(() -> {
            previewView = new PreviewView(getContext());
            FrameLayout.LayoutParams lp = new FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.MATCH_PARENT
            );
            // Insert behind the WebView so JS overlay UI stays on top.
            ViewGroup root = (ViewGroup) bridge.getWebView().getParent();
            if (root != null) {
                root.addView(previewView, 0, lp);
                bridge.getWebView().setBackgroundColor(0x00000000);
            }
        });
    }

    private void removePreviewView() {
        if (previewView == null) return;
        ViewGroup parent = (ViewGroup) previewView.getParent();
        if (parent != null) parent.removeView(previewView);
        previewView = null;
    }
}
