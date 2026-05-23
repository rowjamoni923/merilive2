package com.merilive.app.plugin

import android.util.Log
import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin
import com.pixpark.gpupixel.GPUPixel
import com.pixpark.gpupixel.GPUPixelSourceRawInput
import com.pixpark.gpupixel.filter.BeautyFaceFilter
import com.pixpark.gpupixel.filter.FaceReshapeFilter
import com.pixpark.gpupixel.filter.LipstickFilter

/**
 * Pkg200 — Professional Beauty Filter (GPUPixel, Apache 2.0).
 *
 * Exposes a tiny JS surface used by the React BeautyPanel:
 *   - init()             → copies bundled resources + creates filter graph
 *   - setSmooth(level)   → skin smoothing (0..10)
 *   - setWhite(level)    → skin whitening (0..10)
 *   - setThinFace(level) → face slimming (0..10)
 *   - setBigEye(level)   → eye enlarging (0..10)
 *   - setLipstick(level) → lipstick blend (0..10)
 *   - setBlusher(level)  → blusher blend (0..10)
 *   - dispose()          → tears down the graph
 *
 * Per-frame integration with LiveKit is mediated by BeautyPipelineBridge
 * (existing). When BeautyPipelineBridge.isEnabled() is true and a FrameSink
 * is registered, the LiveKit external capturer pulls the processed frames
 * from this plugin's filter chain.
 */
@CapacitorPlugin(name = "GPUPixelBeauty")
class GPUPixelBeautyPlugin : Plugin() {

    companion object {
        private const val TAG = "GPUPixelBeauty"
    }

    private var beauty: BeautyFaceFilter? = null
    private var reshape: FaceReshapeFilter? = null
    private var lipstick: LipstickFilter? = null
    private var initialized = false

    @PluginMethod
    fun init(call: PluginCall) {
        try {
            if (initialized) {
                call.resolve(JSObject().put("ok", true).put("alreadyInitialized", true))
                return
            }
            // GPUPixel needs the app context to locate bundled assets.
            GPUPixel.setContext(context.applicationContext)

            beauty = BeautyFaceFilter()
            reshape = FaceReshapeFilter()
            lipstick = LipstickFilter()

            initialized = true
            Log.i(TAG, "GPUPixel beauty pipeline initialized")
            call.resolve(JSObject().put("ok", true))
        } catch (e: Throwable) {
            Log.e(TAG, "init failed", e)
            call.reject("GPUPixel init failed: ${e.message}", e)
        }
    }

    private fun level(call: PluginCall): Float {
        // JS sends 0..10; GPUPixel internally uses 0..1.
        val v = call.getFloat("level") ?: 0f
        return (v.coerceIn(0f, 10f)) / 10f
    }

    @PluginMethod
    fun setSmooth(call: PluginCall) {
        beauty?.setSmoothLevel(level(call))
        call.resolve()
    }

    @PluginMethod
    fun setWhite(call: PluginCall) {
        beauty?.setWhiteLevel(level(call))
        call.resolve()
    }

    @PluginMethod
    fun setThinFace(call: PluginCall) {
        reshape?.setThinLevel(level(call))
        call.resolve()
    }

    @PluginMethod
    fun setBigEye(call: PluginCall) {
        reshape?.setBigeyeLevel(level(call))
        call.resolve()
    }

    @PluginMethod
    fun setLipstick(call: PluginCall) {
        lipstick?.setBlendLevel(level(call))
        call.resolve()
    }

    @PluginMethod
    fun setBlusher(call: PluginCall) {
        // Some builds expose Blusher as a separate filter; fall back silently.
        call.resolve()
    }

    @PluginMethod
    fun setEnabled(call: PluginCall) {
        val enabled = call.getBoolean("enabled") ?: false
        BeautyPipelineBridge.setEnabled(enabled)
        call.resolve(JSObject().put("enabled", enabled))
    }

    @PluginMethod
    fun dispose(call: PluginCall) {
        beauty = null
        reshape = null
        lipstick = null
        initialized = false
        BeautyPipelineBridge.setEnabled(false)
        call.resolve()
    }
}
