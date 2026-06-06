package com.merilive.app.plugin.video;

import android.graphics.Bitmap;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

@CapacitorPlugin(name = "NativeVideoEngine")
public class NativeVideoEnginePlugin extends Plugin {

    static {
        System.loadLibrary("native_video_engine");
    }

    private native String getEngineVersion();
    private native void processFrameNative(Bitmap bitmap);

    @PluginMethod
    public void getVersion(PluginCall call) {
        JSObject ret = new JSObject();
        ret.put("version", getEngineVersion());
        call.resolve(ret);
    }

    @PluginMethod
    public void processFrame(PluginCall call) {
        // Implementation for frame processing
        // In a real scenario, this would interface with the camera preview
        call.resolve();
    }
}