package com.merilive.app.plugin

import android.graphics.Color
import android.view.Gravity
import android.view.ViewGroup
import android.widget.FrameLayout
import com.airbnb.lottie.LottieAnimationView
import com.airbnb.lottie.LottieDrawable
import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin
import java.io.File
import java.net.HttpURLConnection
import java.net.URL
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.Executors

/**
 * Pkg437 — Native Android Lottie player with Disk Cache.
 * 
 * Uses Airbnb's official Lottie library (standard for high-end Android apps).
 */
@CapacitorPlugin(name = "NativeLottie")
class NativeLottiePlugin : Plugin() {

    private var overlay: FrameLayout? = null
    private var lottieView: LottieAnimationView? = null
    
    private val downloadExecutor = Executors.newFixedThreadPool(2)
    private val downloadCache = ConcurrentHashMap<String, File>()

    @PluginMethod
    fun play(call: PluginCall) {
        val url = call.getString("url") ?: return call.reject("url required")
        val loop = call.getBoolean("loop", false) ?: false

        downloadExecutor.execute {
            val localFile = try {
                resolveLocalFile(url)
            } catch (t: Throwable) {
                call.reject("lottie download failed: ${t.message}")
                return@execute
            }
            // Read the JSON OFF the UI thread — large Lottie files can be
            // multi-MB and reading on UI is an ANR risk on slow flash.
            val jsonText = try {
                localFile.readText()
            } catch (t: Throwable) {
                call.reject("lottie read failed: ${t.message}")
                return@execute
            }

            activity.runOnUiThread {
                try {
                    ensureOverlay()
                    val lv = lottieView ?: return@runOnUiThread call.reject("overlay init failed")

                    lv.repeatCount = if (loop) LottieDrawable.INFINITE else 0
                    lv.setAnimationFromJson(jsonText, localFile.absolutePath)
                    lv.playAnimation()

                    call.resolve(JSObject().put("ok", true))
                } catch (t: Throwable) {
                    call.reject("lottie play failed: ${t.message}")
                }
            }
        }
    }

    @PluginMethod
    fun stop(call: PluginCall) {
        activity.runOnUiThread {
            lottieView?.cancelAnimation()
            hideOverlay()
            call.resolve()
        }
    }

    private fun resolveLocalFile(url: String): File {
        downloadCache[url]?.let { if (it.exists() && it.length() > 0) return it }
        val cacheDir = File(context.cacheDir, "lottie_native_cache").apply { mkdirs() }
        val safeName = url.hashCode().toString().replace("-", "n") + ".json"
        val target = File(cacheDir, safeName)
        // Only trust the cached file when it's non-empty — a zero-byte
        // file is a partial download from a previous crash/interrupt.
        if (target.exists() && target.length() > 0) {
            downloadCache[url] = target
            return target
        }

        // Atomic download: write to .tmp first, then rename. Prevents
        // partial JSON from being permanently cached and served back.
        val tmp = File(cacheDir, "$safeName.tmp")
        val conn = (URL(url).openConnection() as HttpURLConnection).apply {
            connectTimeout = 10_000
            readTimeout = 20_000
        }
        try {
            conn.inputStream.use { input ->
                tmp.outputStream().use { out -> input.copyTo(out) }
            }
            if (!tmp.renameTo(target)) {
                tmp.copyTo(target, overwrite = true)
                tmp.delete()
            }
        } finally {
            try { conn.disconnect() } catch (_: Throwable) {}
            try { if (tmp.exists() && !target.exists()) tmp.delete() } catch (_: Throwable) {}
        }
        downloadCache[url] = target
        return target
    }

    private fun ensureOverlay() {
        if (overlay != null) return
        val root = bridge.webView.parent as? ViewGroup ?: return
        val fl = FrameLayout(context).apply {
            setBackgroundColor(Color.TRANSPARENT)
            layoutParams = ViewGroup.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.MATCH_PARENT
            )
        }
        val lv = LottieAnimationView(context).apply {
            layoutParams = FrameLayout.LayoutParams(
                FrameLayout.LayoutParams.MATCH_PARENT,
                FrameLayout.LayoutParams.MATCH_PARENT,
                Gravity.CENTER
            )
        }
        fl.addView(lv)
        root.addView(fl)
        overlay = fl
        lottieView = lv
    }

    private fun hideOverlay() {
        val fl = overlay ?: return
        (fl.parent as? ViewGroup)?.removeView(fl)
        overlay = null
        lottieView = null
    }

    override fun handleOnDestroy() {
        try { downloadExecutor.shutdownNow() } catch (_: Throwable) {}
        try {
            activity?.runOnUiThread {
                try { lottieView?.cancelAnimation() } catch (_: Throwable) {}
                try { (overlay?.parent as? ViewGroup)?.removeView(overlay) } catch (_: Throwable) {}
                overlay = null
                lottieView = null
            }
        } catch (_: Throwable) {}
        super.handleOnDestroy()
    }
}
