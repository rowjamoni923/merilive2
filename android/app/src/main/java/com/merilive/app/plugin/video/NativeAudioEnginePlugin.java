package com.merilive.app.plugin.video;

import android.media.audiofx.AcousticEchoCanceler;
import android.media.audiofx.NoiseSuppressor;
import android.media.audiofx.AutomaticGainControl;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

@CapacitorPlugin(name = "NativeAudioEngine")
public class NativeAudioEnginePlugin extends Plugin {

    @PluginMethod
    public void enableProfessionalAudio(PluginCall call) {
        int sessionId = 0; // In real usage, get this from AudioRecord or MediaPlayer
        
        boolean echoSupported = AcousticEchoCanceler.isAvailable();
        boolean noiseSupported = NoiseSuppressor.isAvailable();
        boolean gainSupported = AutomaticGainControl.isAvailable();

        if (echoSupported) {
            AcousticEchoCanceler.create(sessionId);
        }
        if (noiseSupported) {
            NoiseSuppressor.create(sessionId);
        }
        if (gainSupported) {
            AutomaticGainControl.create(sessionId);
        }

        JSObject ret = new JSObject();
        ret.put("echoCancellation", echoSupported);
        ret.put("noiseSuppression", noiseSupported);
        ret.put("autoGainControl", gainSupported);
        call.resolve(ret);
    }

    @PluginMethod
    public void setAudioEffect(PluginCall call) {
        String type = call.getString("type", "normal");
        // Logic for specialized audio effects (Reverb, Bass Boost etc.)
        call.resolve();
    }
}