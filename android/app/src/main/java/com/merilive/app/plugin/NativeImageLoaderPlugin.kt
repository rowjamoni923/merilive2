package com.merilive.app.plugin

import android.graphics.Bitmap
import android.os.Build
import android.webkit.WebResourceRequest
import android.webkit.WebResourceResponse
import android.webkit.WebView
import android.webkit.WebViewClient
import com.bumptech.glide.Glide
import com.bumptech.glide.load.engine.DiskCacheStrategy
import com.bumptech.glide.request.FutureTarget
import com.getcapacitor.JSArray
import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin
import java.io.ByteArrayInputStream
import java.io.ByteArrayOutputStream
import java.util.concurrent.Executors

/**
 * Pkg428 — Native Image Loader (Glide-backed).
 *
 * Additive, zero-risk Capacitor plugin that lets the WebView UI warm the
 * native Glide bitmap + disk cache for any HTTPS image URL (avatars, gift
 * thumbs, banners, feed posters). Glide already ships in this APK (used by
 * NotificationHelper rich layouts), so no new APK size.
 *
 * APIs exposed to JS:
 *   - prefetch({ urls: string[] })             → bulk-download into cache
 *   - clearCache()                              → wipe disk + memory cache
 *   - getCacheStats()                           → { bytes, count } (best-effort)
 *   - setInterceptorEnabled({ enabled: bool })  → install/uninstall a
 *       WebViewClient that serves matching .jpg/.jpeg/.png/.webp/.gif/.avif
 *       requests from the Glide cache (zero-network on repeat view).
 *
 * Gated entirely by JS feature flag (imageNativeFlag). Default OFF —
 * existing WebView <img>/CSS background-image path keeps running unchanged
 * for web, iOS, older APKs, and the gated-off cohort.
 */
@CapacitorPlugin(name = "NativeImageLoader")
class NativeImageLoaderPlugin : Plugin() {

    private val ioPool = Executors.newFixedThreadPool(2)

    @Volatile
    private var interceptorInstalled = false

    @Volatile
    private var originalClient: WebViewClient? = null

    @PluginMethod
    fun prefetch(call: PluginCall) {
        val arr: JSArray = call.getArray("urls") ?: run {
            call.reject("urls array required")
            return
        }
        val urls = mutableListOf<String>()
        for (i in 0 until arr.length()) {
            val s = arr.optString(i, null)
            if (!s.isNullOrBlank() && (s.startsWith("https://") || s.startsWith("http://"))) {
                urls.add(s)
            }
        }
        if (urls.isEmpty()) {
            val res = JSObject()
            res.put("prefetched", 0)
            call.resolve(res)
            return
        }

        ioPool.execute {
            var ok = 0
            for (u in urls) {
                var ft: FutureTarget<java.io.File>? = null
                try {
                    ft = Glide.with(context.applicationContext)
                        .downloadOnly()
                        .load(u)
                        .submit()
                    ft.get() // blocks on this background thread only
                    ok++
                } catch (_: Throwable) {
                    /* swallow — prefetch is best-effort */
                } finally {
                    if (ft != null) {
                        try { Glide.with(context.applicationContext).clear(ft) } catch (_: Throwable) {}
                    }
                }
            }
            val res = JSObject()
            res.put("prefetched", ok)
            res.put("requested", urls.size)
            call.resolve(res)
        }
    }

    @PluginMethod
    fun clearCache(call: PluginCall) {
        try {
            // Memory cache must be cleared on main thread.
            activity?.runOnUiThread {
                try { Glide.get(context.applicationContext).clearMemory() } catch (_: Throwable) {}
            }
            ioPool.execute {
                try { Glide.get(context.applicationContext).clearDiskCache() } catch (_: Throwable) {}
                call.resolve()
            }
        } catch (e: Throwable) {
            call.reject(e.message ?: "clearCache failed")
        }
    }

    @PluginMethod
    fun getCacheStats(call: PluginCall) {
        ioPool.execute {
            var bytes = 0L
            var count = 0
            try {
                val dir = java.io.File(context.cacheDir, "image_manager_disk_cache")
                if (dir.exists()) {
                    dir.walkTopDown().forEach { f ->
                        if (f.isFile) {
                            bytes += f.length()
                            count++
                        }
                    }
                }
            } catch (_: Throwable) {}
            val res = JSObject()
            res.put("bytes", bytes)
            res.put("count", count)
            call.resolve(res)
        }
    }

    @PluginMethod
    fun setInterceptorEnabled(call: PluginCall) {
        val enabled = call.getBoolean("enabled", false) == true
        try {
            activity?.runOnUiThread {
                val wv: WebView? = bridge?.webView
                if (wv == null) {
                    call.reject("webview not ready")
                    return@runOnUiThread
                }
                if (enabled && !interceptorInstalled) {
                    installInterceptor(wv)
                    interceptorInstalled = true
                } else if (!enabled && interceptorInstalled) {
                    originalClient?.let { wv.webViewClient = it }
                    interceptorInstalled = false
                }
                val res = JSObject()
                res.put("installed", interceptorInstalled)
                call.resolve(res)
            }
        } catch (e: Throwable) {
            call.reject(e.message ?: "setInterceptorEnabled failed")
        }
    }

    private fun installInterceptor(wv: WebView) {
        val previous = try { wv.webViewClient } catch (_: Throwable) { null }
        originalClient = previous

        wv.webViewClient = object : WebViewClient() {
            override fun shouldInterceptRequest(
                view: WebView?,
                request: WebResourceRequest?
            ): WebResourceResponse? {
                val url = request?.url?.toString() ?: return passThrough(view, request)
                if (!isImageUrl(url)) return passThrough(view, request)
                if (request.method?.uppercase() != "GET") return passThrough(view, request)

                return try {
                    val file = Glide.with(context.applicationContext)
                        .downloadOnly()
                        .load(url)
                        .submit()
                        .get()
                    val bytes = file.readBytes()
                    val mime = guessMime(url)
                    WebResourceResponse(
                        mime,
                        "UTF-8",
                        200,
                        "OK",
                        mutableMapOf(
                            "Access-Control-Allow-Origin" to "*",
                            "Cache-Control" to "public, max-age=604800"
                        ),
                        ByteArrayInputStream(bytes)
                    )
                } catch (_: Throwable) {
                    passThrough(view, request)
                }
            }

            // Forward every other callback to the previous client so Capacitor's
            // bridge (route handling, console logging, etc.) keeps working.
            override fun shouldOverrideUrlLoading(view: WebView?, request: WebResourceRequest?): Boolean {
                return originalClient?.shouldOverrideUrlLoading(view, request) ?: false
            }
            override fun onPageFinished(view: WebView?, url: String?) {
                originalClient?.onPageFinished(view, url)
            }
            override fun onPageStarted(view: WebView?, url: String?, favicon: Bitmap?) {
                originalClient?.onPageStarted(view, url, favicon)
            }
        }
    }

    private fun passThrough(view: WebView?, req: WebResourceRequest?): WebResourceResponse? {
        return try {
            if (Build.VERSION.SDK_INT >= 21 && view != null && req != null) {
                originalClient?.shouldInterceptRequest(view, req)
            } else null
        } catch (_: Throwable) { null }
    }

    private fun isImageUrl(url: String): Boolean {
        val q = url.indexOf('?')
        val clean = (if (q > 0) url.substring(0, q) else url).lowercase()
        return clean.endsWith(".jpg") || clean.endsWith(".jpeg") ||
               clean.endsWith(".png") || clean.endsWith(".webp") ||
               clean.endsWith(".gif") || clean.endsWith(".avif")
    }

    private fun guessMime(url: String): String {
        val l = url.lowercase()
        return when {
            l.contains(".png") -> "image/png"
            l.contains(".webp") -> "image/webp"
            l.contains(".gif") -> "image/gif"
            l.contains(".avif") -> "image/avif"
            else -> "image/jpeg"
        }
    }

    override fun handleOnDestroy() {
        // Restore the original WebViewClient so the destroyed plugin isn't
        // pinned in memory by the WebView's reference to our anonymous client.
        try {
            if (interceptorInstalled) {
                activity?.runOnUiThread {
                    try {
                        val wv = bridge?.webView
                        val prev = originalClient
                        if (wv != null && prev != null) {
                            wv.webViewClient = prev
                        }
                    } catch (_: Throwable) {}
                    interceptorInstalled = false
                    originalClient = null
                }
            }
        } catch (_: Throwable) {}
        try { ioPool.shutdownNow() } catch (_: Throwable) {}
        super.handleOnDestroy()
    }
}
