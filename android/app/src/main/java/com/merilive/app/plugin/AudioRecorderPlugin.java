package com.merilive.app.plugin;

import android.Manifest;
import android.media.MediaRecorder;
import android.os.Build;
import android.util.Base64;

import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;

import java.io.File;
import java.io.FileInputStream;

/**
 * Pkg271 — Native audio recorder for voice DM.
 *
 * MediaRecorder → AAC (m4a container) — WhatsApp-compatible.
 *   • Source: MIC (Krisp/audio-focus aware via OS routing)
 *   • Format: MPEG_4 / AAC, 44.1kHz mono, 64kbps (good voice quality, small size)
 *   • Cap: 5 minutes hard stop (matches WhatsApp voice note ceiling)
 *
 * Methods:
 *   - start(): begin recording → temp file in cacheDir
 *   - pause()/resume() (API 24+)
 *   - stop(): finalize, return { path, durationMs, sizeBytes, base64? }
 *   - cancel(): abort + delete
 *   - getAmplitude(): peak amplitude 0..32767 for waveform UI
 *
 * Events:
 *   - audioRecorderMaxDuration (auto-stop at 5min)
 */
@CapacitorPlugin(
    name = "AudioRecorder",
    permissions = {
        @Permission(strings = { Manifest.permission.RECORD_AUDIO }, alias = "microphone")
    }
)
public class AudioRecorderPlugin extends Plugin {

    private static final int MAX_DURATION_MS = 5 * 60 * 1000; // 5 minutes
    private static final int SAMPLE_RATE = 44100;
    private static final int BIT_RATE = 64000;

    private MediaRecorder recorder;
    private File outputFile;
    private long startedAtMs;
    private long pausedAccumMs;
    private long pauseStartedMs;
    private boolean isPaused;
    private PluginCall pendingStartCall;

    @PluginMethod
    public void start(PluginCall call) {
        if (recorder != null) {
            call.reject("already_recording");
            return;
        }
        if (getPermissionState("microphone") != PermissionState.GRANTED) {
            pendingStartCall = call;
            requestPermissionForAlias("microphone", call, "micPermCallback");
            return;
        }
        beginRecord(call);
    }

    @PermissionCallback
    private void micPermCallback(PluginCall call) {
        if (getPermissionState("microphone") != PermissionState.GRANTED) {
            call.reject("permission_denied");
            return;
        }
        beginRecord(call);
    }

    private void beginRecord(PluginCall call) {
        try {
            File dir = new File(getContext().getCacheDir(), "voice");
            if (!dir.exists()) dir.mkdirs();
            outputFile = new File(dir, "vm_" + System.currentTimeMillis() + ".m4a");

            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                recorder = new MediaRecorder(getContext());
            } else {
                recorder = new MediaRecorder();
            }
            recorder.setAudioSource(MediaRecorder.AudioSource.MIC);
            recorder.setOutputFormat(MediaRecorder.OutputFormat.MPEG_4);
            recorder.setAudioEncoder(MediaRecorder.AudioEncoder.AAC);
            recorder.setAudioChannels(1);
            recorder.setAudioSamplingRate(SAMPLE_RATE);
            recorder.setAudioEncodingBitRate(BIT_RATE);
            recorder.setMaxDuration(MAX_DURATION_MS);
            recorder.setOutputFile(outputFile.getAbsolutePath());

            recorder.setOnInfoListener((mr, what, extra) -> {
                if (what == MediaRecorder.MEDIA_RECORDER_INFO_MAX_DURATION_REACHED) {
                    JSObject ev = new JSObject();
                    ev.put("reason", "max_duration");
                    notifyListeners("audioRecorderMaxDuration", ev);
                }
            });

            recorder.prepare();
            recorder.start();
            startedAtMs = System.currentTimeMillis();
            pausedAccumMs = 0;
            isPaused = false;

            JSObject ret = new JSObject();
            ret.put("path", outputFile.getAbsolutePath());
            call.resolve(ret);
        } catch (Exception e) {
            cleanup();
            call.reject("start_failed: " + e.getMessage());
        }
    }

    @PluginMethod
    public void pause(PluginCall call) {
        if (recorder == null) { call.reject("not_recording"); return; }
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.N) {
            call.reject("pause_unsupported_below_api24"); return;
        }
        if (isPaused) { call.resolve(); return; }
        try {
            recorder.pause();
            isPaused = true;
            pauseStartedMs = System.currentTimeMillis();
            call.resolve();
        } catch (Exception e) {
            call.reject("pause_failed: " + e.getMessage());
        }
    }

    @PluginMethod
    public void resume(PluginCall call) {
        if (recorder == null) { call.reject("not_recording"); return; }
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.N) {
            call.reject("resume_unsupported_below_api24"); return;
        }
        if (!isPaused) { call.resolve(); return; }
        try {
            recorder.resume();
            pausedAccumMs += System.currentTimeMillis() - pauseStartedMs;
            isPaused = false;
            call.resolve();
        } catch (Exception e) {
            call.reject("resume_failed: " + e.getMessage());
        }
    }

    @PluginMethod
    public void stop(PluginCall call) {
        if (recorder == null) { call.reject("not_recording"); return; }
        boolean wantBase64 = call.getBoolean("includeBase64", false);
        try {
            try { recorder.stop(); } catch (RuntimeException ignored) {
                // stop() throws if started==stopped without any data; treat as cancel
                cleanup();
                call.reject("no_audio_captured");
                return;
            }
            recorder.release();
            recorder = null;

            long now = System.currentTimeMillis();
            if (isPaused) pausedAccumMs += now - pauseStartedMs;
            long durationMs = (now - startedAtMs) - pausedAccumMs;

            JSObject ret = new JSObject();
            ret.put("path", outputFile.getAbsolutePath());
            ret.put("uri", "file://" + outputFile.getAbsolutePath());
            ret.put("mimeType", "audio/mp4");
            ret.put("durationMs", durationMs);
            ret.put("sizeBytes", outputFile.length());

            if (wantBase64 && outputFile.length() <= 25 * 1024 * 1024) {
                byte[] bytes = new byte[(int) outputFile.length()];
                try (FileInputStream fis = new FileInputStream(outputFile)) {
                    fis.read(bytes);
                }
                ret.put("base64", Base64.encodeToString(bytes, Base64.NO_WRAP));
            }

            call.resolve(ret);
        } catch (Exception e) {
            cleanup();
            call.reject("stop_failed: " + e.getMessage());
        } finally {
            isPaused = false;
            pausedAccumMs = 0;
        }
    }

    @PluginMethod
    public void cancel(PluginCall call) {
        cleanup();
        call.resolve();
    }

    @PluginMethod
    public void getAmplitude(PluginCall call) {
        JSObject ret = new JSObject();
        if (recorder == null || isPaused) {
            ret.put("amplitude", 0);
        } else {
            try {
                ret.put("amplitude", recorder.getMaxAmplitude());
            } catch (Exception e) {
                ret.put("amplitude", 0);
            }
        }
        call.resolve(ret);
    }

    @PluginMethod
    public void isRecording(PluginCall call) {
        JSObject ret = new JSObject();
        ret.put("recording", recorder != null && !isPaused);
        ret.put("paused", recorder != null && isPaused);
        call.resolve(ret);
    }

    private void cleanup() {
        if (recorder != null) {
            try { recorder.stop(); } catch (Exception ignored) {}
            try { recorder.release(); } catch (Exception ignored) {}
            recorder = null;
        }
        if (outputFile != null && outputFile.exists()) {
            //noinspection ResultOfMethodCallIgnored
            outputFile.delete();
        }
        outputFile = null;
        isPaused = false;
        pausedAccumMs = 0;
    }

    @Override
    protected void handleOnDestroy() {
        cleanup();
        super.handleOnDestroy();
    }
}
