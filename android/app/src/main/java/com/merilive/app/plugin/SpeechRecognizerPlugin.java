package com.merilive.app.plugin;

import android.Manifest;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.os.Bundle;
import android.speech.RecognitionListener;
import android.speech.RecognizerIntent;
import android.speech.SpeechRecognizer;
import androidx.core.content.ContextCompat;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.PermissionState;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.Permission;
import com.getcapacitor.annotation.PermissionCallback;

import java.util.ArrayList;
import java.util.Locale;

/**
 * Pkg260 — On-device Speech-to-Text via android.speech.SpeechRecognizer.
 * Free, no API key. Streams partial + final results. Use for chat dictation,
 * voice search, comment box voice input.
 */
@CapacitorPlugin(
    name = "SpeechRecognizer",
    permissions = {
        @Permission(alias = "microphone", strings = { Manifest.permission.RECORD_AUDIO })
    }
)
public class SpeechRecognizerPlugin extends Plugin {

    private SpeechRecognizer recognizer;
    private boolean listening = false;

    @PluginMethod
    public void isAvailable(PluginCall call) {
        JSObject o = new JSObject();
        o.put("available", SpeechRecognizer.isRecognitionAvailable(getContext()));
        call.resolve(o);
    }

    @PluginMethod
    public void hasPermission(PluginCall call) {
        boolean granted = ContextCompat.checkSelfPermission(
            getContext(), Manifest.permission.RECORD_AUDIO
        ) == PackageManager.PERMISSION_GRANTED;
        JSObject o = new JSObject(); o.put("granted", granted);
        call.resolve(o);
    }

    @PluginMethod
    public void requestPermission(PluginCall call) {
        if (getPermissionState("microphone") == PermissionState.GRANTED) {
            JSObject o = new JSObject(); o.put("granted", true);
            call.resolve(o);
            return;
        }
        requestPermissionForAlias("microphone", call, "permCallback");
    }

    @PermissionCallback
    private void permCallback(PluginCall call) {
        JSObject o = new JSObject();
        o.put("granted", getPermissionState("microphone") == PermissionState.GRANTED);
        call.resolve(o);
    }

    @PluginMethod
    public void start(PluginCall call) {
        if (!SpeechRecognizer.isRecognitionAvailable(getContext())) {
            call.reject("not_available");
            return;
        }
        if (ContextCompat.checkSelfPermission(getContext(), Manifest.permission.RECORD_AUDIO)
                != PackageManager.PERMISSION_GRANTED) {
            call.reject("no_permission");
            return;
        }
        String lang = call.getString("lang", Locale.getDefault().toLanguageTag());
        Boolean partial = call.getBoolean("partialResults", true);
        Integer maxResults = call.getInt("maxResults", 5);

        Intent intent = new Intent(RecognizerIntent.ACTION_RECOGNIZE_SPEECH);
        intent.putExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL, RecognizerIntent.LANGUAGE_MODEL_FREE_FORM);
        intent.putExtra(RecognizerIntent.EXTRA_LANGUAGE, lang);
        intent.putExtra(RecognizerIntent.EXTRA_PARTIAL_RESULTS, partial);
        intent.putExtra(RecognizerIntent.EXTRA_MAX_RESULTS, maxResults);
        intent.putExtra(RecognizerIntent.EXTRA_CALLING_PACKAGE, getContext().getPackageName());

        getActivity().runOnUiThread(() -> {
            try {
                if (recognizer == null) {
                    recognizer = SpeechRecognizer.createSpeechRecognizer(getContext());
                }
                recognizer.setRecognitionListener(new RecognitionListener() {
                    @Override public void onReadyForSpeech(Bundle p) {
                        notifyListeners("ready", new JSObject());
                    }
                    @Override public void onBeginningOfSpeech() {
                        notifyListeners("begin", new JSObject());
                    }
                    @Override public void onRmsChanged(float v) {
                        JSObject o = new JSObject(); o.put("rms", v);
                        notifyListeners("rms", o);
                    }
                    @Override public void onBufferReceived(byte[] b) {}
                    @Override public void onEndOfSpeech() {
                        notifyListeners("end", new JSObject());
                    }
                    @Override public void onError(int err) {
                        listening = false;
                        JSObject o = new JSObject();
                        o.put("code", err);
                        o.put("message", errorText(err));
                        notifyListeners("error", o);
                    }
                    @Override public void onResults(Bundle results) {
                        listening = false;
                        emitResults(results, true);
                    }
                    @Override public void onPartialResults(Bundle results) {
                        emitResults(results, false);
                    }
                    @Override public void onEvent(int e, Bundle p) {}
                });
                listening = true;
                recognizer.startListening(intent);
                call.resolve();
            } catch (Exception e) {
                listening = false;
                call.reject("start_failed: " + e.getMessage());
            }
        });
    }

    private void emitResults(Bundle results, boolean isFinal) {
        ArrayList<String> matches = results.getStringArrayList(SpeechRecognizer.RESULTS_RECOGNITION);
        if (matches == null) return;
        JSArray arr = new JSArray();
        for (String m : matches) arr.put(m);
        JSObject o = new JSObject();
        o.put("matches", arr);
        o.put("isFinal", isFinal);
        notifyListeners(isFinal ? "result" : "partial", o);
    }

    private String errorText(int code) {
        switch (code) {
            case SpeechRecognizer.ERROR_AUDIO: return "audio";
            case SpeechRecognizer.ERROR_CLIENT: return "client";
            case SpeechRecognizer.ERROR_INSUFFICIENT_PERMISSIONS: return "no_permission";
            case SpeechRecognizer.ERROR_NETWORK: return "network";
            case SpeechRecognizer.ERROR_NETWORK_TIMEOUT: return "network_timeout";
            case SpeechRecognizer.ERROR_NO_MATCH: return "no_match";
            case SpeechRecognizer.ERROR_RECOGNIZER_BUSY: return "busy";
            case SpeechRecognizer.ERROR_SERVER: return "server";
            case SpeechRecognizer.ERROR_SPEECH_TIMEOUT: return "speech_timeout";
            default: return "unknown_" + code;
        }
    }

    @PluginMethod
    public void stop(PluginCall call) {
        getActivity().runOnUiThread(() -> {
            try { if (recognizer != null) recognizer.stopListening(); } catch (Exception ignored) {}
            listening = false;
            call.resolve();
        });
    }

    @PluginMethod
    public void cancel(PluginCall call) {
        getActivity().runOnUiThread(() -> {
            try { if (recognizer != null) recognizer.cancel(); } catch (Exception ignored) {}
            listening = false;
            call.resolve();
        });
    }

    @PluginMethod
    public void isListening(PluginCall call) {
        JSObject o = new JSObject(); o.put("listening", listening);
        call.resolve(o);
    }

    @Override
    protected void handleOnDestroy() {
        if (recognizer != null) {
            try { recognizer.cancel(); } catch (Exception ignored) {}
            try { recognizer.destroy(); } catch (Exception ignored) {}
            recognizer = null;
        }
        super.handleOnDestroy();
    }
}
