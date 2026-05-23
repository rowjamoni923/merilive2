package com.merilive.app.plugin

import android.util.Log
import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin
import com.pixpark.gpupixel.GPUPixel
import com.pixpark.gpupixel.GPUPixelFilter

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

    private var beauty: GPUPixelFilter? = null
    private var reshape: GPUPixelFilter? = null
    private var lipstick: GPUPixelFilter? = null
    private var blusher: GPUPixelFilter? = null
    private var initialized = false

    @PluginMethod
    fun init(call: PluginCall) {
        try {
            if (initialized) {
                call.resolve(JSObject().put("ok", true).put("alreadyInitialized", true))
                return
            }
            // GPUPixel v1.3+ copies MarsFace 3D landmark models + LUT assets
            // from the AAR into app storage and sets the native resource path.
            GPUPixel.Init(context.applicationContext)

            beauty = GPUPixelFilter.Create(GPUPixelFilter.BEAUTY_FACE_FILTER)
            reshape = GPUPixelFilter.Create(GPUPixelFilter.FACE_RESHAPE_FILTER)
            lipstick = GPUPixelFilter.Create(GPUPixelFilter.LIPSTICK_FILTER)
            blusher = GPUPixelFilter.Create(GPUPixelFilter.BLUSHER_FILTER)

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
        beauty?.SetProperty("skin_smoothing", level(call))
        call.resolve()
    }

    @PluginMethod
    fun setWhite(call: PluginCall) {
        beauty?.SetProperty("whiteness", level(call))
        call.resolve()
    }

    @PluginMethod
    fun setThinFace(call: PluginCall) {
        reshape?.SetProperty("thin_face", level(call))
        call.resolve()
    }

    @PluginMethod
    fun setBigEye(call: PluginCall) {
        reshape?.SetProperty("big_eye", level(call))
        call.resolve()
    }

    @PluginMethod
    fun setLipstick(call: PluginCall) {
        lipstick?.SetProperty("blend_level", level(call))
        call.resolve()
    }

    @PluginMethod
    fun setBlusher(call: PluginCall) {
        blusher?.SetProperty("blend_level", level(call))
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
        blusher = null
        initialized = false
        BeautyPipelineBridge.setEnabled(false)
        try { GPUPixel.Destroy() } catch (_: Throwable) {}
        call.resolve()
    }
}
