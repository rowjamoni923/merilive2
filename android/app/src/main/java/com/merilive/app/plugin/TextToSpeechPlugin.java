package com.merilive.app.plugin;

import android.os.Bundle;
import android.speech.tts.TextToSpeech;
import android.speech.tts.UtteranceProgressListener;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.util.Locale;
import java.util.Set;

/**
 * Pkg259 — Text-to-Speech for accessibility (read DM aloud, voice
 * announcements, low-vision support). Wraps android.speech.tts.TextToSpeech.
 */
@CapacitorPlugin(name = "TextToSpeech")
public class TextToSpeechPlugin extends Plugin {

    private TextToSpeech tts;
    private boolean ready = false;
    private int utterCount = 0;

    @Override
    public void load() {
        tts = new TextToSpeech(getContext(), status -> {
            ready = (status == TextToSpeech.SUCCESS);
            if (ready) {
                tts.setOnUtteranceProgressListener(new UtteranceProgressListener() {
                    @Override public void onStart(String id) {
                        JSObject o = new JSObject(); o.put("id", id);
                        notifyListeners("start", o);
                    }
                    @Override public void onDone(String id) {
                        JSObject o = new JSObject(); o.put("id", id);
                        notifyListeners("done", o);
                    }
                    @Override public void onError(String id) {
                        JSObject o = new JSObject(); o.put("id", id);
                        notifyListeners("error", o);
                    }
                });
            }
            JSObject o = new JSObject(); o.put("ready", ready);
            notifyListeners("ready", o);
        });
    }

    @PluginMethod
    public void speak(PluginCall call) {
        if (!ready || tts == null) { call.reject("TTS not ready"); return; }
        String text = call.getString("text", "");
        String lang = call.getString("lang", null);
        Float rate = call.getFloat("rate", 1.0f);
        Float pitch = call.getFloat("pitch", 1.0f);
        Boolean queue = call.getBoolean("queue", false);

        if (lang != null) {
            try { tts.setLanguage(Locale.forLanguageTag(lang)); } catch (Exception ignored) {}
        }
        tts.setSpeechRate(rate);
        tts.setPitch(pitch);

        String id = "u" + (++utterCount);
        Bundle params = new Bundle();
        int mode = queue ? TextToSpeech.QUEUE_ADD : TextToSpeech.QUEUE_FLUSH;
        int rc = tts.speak(text, mode, params, id);
        if (rc != TextToSpeech.SUCCESS) { call.reject("speak failed: " + rc); return; }
        JSObject o = new JSObject(); o.put("id", id);
        call.resolve(o);
    }

    @PluginMethod
    public void stop(PluginCall call) {
        if (tts != null) tts.stop();
        call.resolve();
    }

    @PluginMethod
    public void isSpeaking(PluginCall call) {
        JSObject o = new JSObject();
        o.put("speaking", tts != null && tts.isSpeaking());
        call.resolve(o);
    }

    @PluginMethod
    public void getLanguages(PluginCall call) {
        JSObject o = new JSObject();
        JSArray arr = new JSArray();
        if (tts != null) {
            try {
                Set<Locale> locs = tts.getAvailableLanguages();
                if (locs != null) for (Locale l : locs) arr.put(l.toLanguageTag());
            } catch (Exception ignored) {}
        }
        o.put("languages", arr);
        call.resolve(o);
    }

    @Override
    protected void handleOnDestroy() {
        if (tts != null) {
            try { tts.stop(); tts.shutdown(); } catch (Exception ignored) {}
            tts = null;
        }
    }
}
