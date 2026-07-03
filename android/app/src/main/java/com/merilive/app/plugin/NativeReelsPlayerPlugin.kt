package com.merilive.app.plugin

import android.graphics.Color
import android.net.Uri
import android.view.SurfaceView
import android.view.View
import android.view.ViewGroup
import android.widget.FrameLayout
import androidx.media3.common.C
import androidx.media3.common.MediaItem
import androidx.media3.common.PlaybackException
import androidx.media3.common.Player
import androidx.media3.datasource.DataSpec
import androidx.media3.datasource.DefaultHttpDataSource
import androidx.media3.datasource.cache.CacheDataSource
import androidx.media3.datasource.cache.CacheWriter
import androidx.media3.datasource.cache.LeastRecentlyUsedCacheEvictor
import androidx.media3.datasource.cache.SimpleCache
import androidx.media3.exoplayer.ExoPlayer
import androidx.media3.exoplayer.source.DefaultMediaSourceFactory
import androidx.media3.exoplayer.source.ProgressiveMediaSource
import com.getcapacitor.JSArray
import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin
import java.io.File
import java.util.concurrent.Executors
import java.util.concurrent.Future
import java.util.concurrent.atomic.AtomicBoolean

/**
 * Pkg427 — Native Android Reels Player.
 *
 * High-performance ExoPlayer (Media3) replacement for the WebView <video>
 * tag inside Reels.tsx. Hardware-accelerated MediaCodec decoder, smooth
 * 60fps scrolling, instant seek, gapless reel transitions, and a 256MB
 * disk cache so swiping back to a previously-watched reel is byte-for-byte
 * instant (zero network).
 *
 *   • Surface inserted BELOW the WebView (index 0 of webview's parent).
 *   • WebView is transparent; the <video> rect is hidden in JS while
 *     native is active, leaving a transparent hole through which the
 *     surface is visible. All UI overlays (like / gift / comments /
 *     captions) continue to live in the WebView ABOVE the video, exactly
 *     as today — zero UI regression.
 *   • Camera-conflict safe: ExoPlayer uses MediaCodec DECODER only, never
 *     touches Camera2 — no contention with LiveKit / CameraOwnership.
 *
 * ZERO-RISK ROLLOUT (Pkg427 mandate, mirrors Pkg426):
 *
 *   • Plugin is ADDITIVE — registered as `NativeReelsPlayer` but Reels.tsx
 *     only uses it when the `reelsNativeFlag` is ON (default OFF).
 *   • Old APKs that pre-date Pkg427 report `available:false` via the
 *     `Class.forName` check; JS falls back to the existing WebView
 *     <video> path — no regression possible.
 *   • Any runtime failure → reel:error event → JS un-hides the <video>
 *     and continues playing the existing path.
 */
@CapacitorPlugin(name = "NativeReelsPlayer")
class NativeReelsPlayerPlugin : Plugin() {

    private var overlay: FrameLayout? = null
    private var surface: SurfaceView? = null
    private var player: ExoPlayer? = null
    private var currentUrl: String? = null

    // Single-threaded executor — serialise warm-cache jobs so a fast
    // scroll doesn't spawn 30 parallel downloads. Latest batch wins
    // (older batches are cancelled via Future.cancel(true) before the
    // new ones are submitted).
    private val prefetchExecutor = Executors.newSingleThreadExecutor { r ->
        Thread(r, "reels-prefetch").apply { isDaemon = true; priority = Thread.MIN_PRIORITY }
    }
    private val inFlightLock = Any()
    private val inFlightFutures = mutableListOf<Future<*>>()

    companion object {
        // Shared 256MB on-disk cache for reel MP4s. Survives plugin
        // re-init and is keyed by URL fragment so swiping back replays
        // instantly with no network.
        @Volatile
        private var simpleCache: SimpleCache? = null
        private const val CACHE_SIZE_BYTES = 256L * 1024L * 1024L // 256MB
        // Default bytes to warm per URL — ~2MB covers the moov atom +
        // first ~3-5 seconds of a typical 720p reel MP4. Enough for
        // instant first-frame; the rest streams as user watches.
        private const val DEFAULT_PREFETCH_BYTES = 2L * 1024L * 1024L

        private fun cache(ctx: android.content.Context): SimpleCache {
            simpleCache?.let { return it }
            synchronized(this) {
                simpleCache?.let { return it }
                val cacheDir = File(ctx.cacheDir, "reels-exo").apply { mkdirs() }
                val evictor = LeastRecentlyUsedCacheEvictor(CACHE_SIZE_BYTES)
                val db = androidx.media3.database.StandaloneDatabaseProvider(ctx)
                val c = SimpleCache(cacheDir, evictor, db)
                simpleCache = c
                return c
            }
        }
    }

    @PluginMethod
    fun isAvailable(call: PluginCall) {
        val available = try {
            Class.forName("androidx.media3.exoplayer.ExoPlayer")
            true
        } catch (_: Throwable) {
            false
        }
        call.resolve(JSObject().put("available", available))
    }

    @PluginMethod
    fun play(call: PluginCall) {
        val url = call.getString("url") ?: run {
            call.reject("url required")
            return
        }
        val muted = call.getBoolean("muted", true) ?: true
        val loop = call.getBoolean("loop", true) ?: true
        val autoplay = call.getBoolean("autoplay", true) ?: true

        activity.runOnUiThread {
            try {
                ensureOverlay()
                ensurePlayer()
                val p = player ?: run {
                    call.reject("player init failed")
                    return@runOnUiThread
                }

                // Same URL already loaded → just resume/restart.
                if (url == currentUrl && p.currentMediaItem != null) {
                    p.volume = if (muted) 0f else 1f
                    p.repeatMode = if (loop) Player.REPEAT_MODE_ONE else Player.REPEAT_MODE_OFF
                    if (autoplay) p.play()
                    call.resolve(JSObject().put("ok", true))
                    return@runOnUiThread
                }

                currentUrl = url
                val mediaItem = MediaItem.fromUri(Uri.parse(url))
                p.setMediaItem(mediaItem)
                p.volume = if (muted) 0f else 1f
                p.repeatMode = if (loop) Player.REPEAT_MODE_ONE else Player.REPEAT_MODE_OFF
                p.playWhenReady = autoplay
                p.prepare()
                showOverlay()
                call.resolve(JSObject().put("ok", true))
            } catch (t: Throwable) {
                call.reject("reel play failed: ${t.message}")
            }
        }
    }

    @PluginMethod
    fun pause(call: PluginCall) {
        activity.runOnUiThread {
            try { player?.pause() } catch (_: Throwable) {}
            call.resolve()
        }
    }

    @PluginMethod
    fun resume(call: PluginCall) {
        activity.runOnUiThread {
            try { player?.play() } catch (_: Throwable) {}
            call.resolve()
        }
    }

    @PluginMethod
    fun setMuted(call: PluginCall) {
        val muted = call.getBoolean("muted", true) ?: true
        activity.runOnUiThread {
            try { player?.volume = if (muted) 0f else 1f } catch (_: Throwable) {}
            call.resolve()
        }
    }

    @PluginMethod
    fun seek(call: PluginCall) {
        val positionMs = call.getInt("positionMs") ?: 0
        activity.runOnUiThread {
            try { player?.seekTo(positionMs.toLong()) } catch (_: Throwable) {}
            call.resolve()
        }
    }

    @PluginMethod
    fun stop(call: PluginCall) {
        activity.runOnUiThread {
            try {
                player?.stop()
                hideOverlay()
                currentUrl = null
            } catch (_: Throwable) {}
            call.resolve()
        }
    }

    @PluginMethod
    fun dispose(call: PluginCall) {
        activity.runOnUiThread {
            try {
                player?.release()
                player = null
                hideOverlay()
                try { (overlay?.parent as? ViewGroup)?.removeView(overlay) } catch (_: Throwable) {}
                surface = null
                overlay = null
                currentUrl = null
            } catch (_: Throwable) {}
            call.resolve()
        }
    }

    @PluginMethod
    fun prefetch(call: PluginCall) {
        val url = call.getString("url") ?: run {
            call.reject("url required")
            return
        }
        val bytes = (call.getInt("bytes") ?: DEFAULT_PREFETCH_BYTES).toLong()
            .coerceIn(64L * 1024L, 8L * 1024L * 1024L)
        prefetchExecutor.submit {
            val ok = warmCache(url, bytes)
            try {
                call.resolve(JSObject().put("ok", ok).put("url", url))
            } catch (_: Throwable) {}
        }
    }

    /**
     * Queue a batch of URLs (next-N reels) for background warming.
     * Skips URLs already fully cached. Cancels any in-flight batch first.
     */
    @PluginMethod
    fun prefetchBatch(call: PluginCall) {
        val arr: JSArray = call.getArray("urls") ?: run {
            call.reject("urls required")
            return
        }
        val bytes = (call.getInt("bytesPerUrl") ?: DEFAULT_PREFETCH_BYTES).toLong()
            .coerceIn(64L * 1024L, 8L * 1024L * 1024L)
        val urls = mutableListOf<String>()
        for (i in 0 until arr.length()) {
            val s = arr.optString(i, "")
            if (!s.isNullOrBlank()) urls.add(s)
        }
        // Cancel any in-flight batch — newest scroll position wins.
        cancelInFlight()
        val futures = mutableListOf<Future<*>>()
        for (u in urls) {
            futures.add(prefetchExecutor.submit {
                if (Thread.currentThread().isInterrupted) return@submit
                warmCache(u, bytes)
            })
        }
        synchronized(inFlightLock) {
            inFlightFutures.addAll(futures)
        }
        call.resolve(JSObject().put("ok", true).put("queued", urls.size))
    }

    @PluginMethod
    fun cancelPrefetch(call: PluginCall) {
        cancelInFlight()
        call.resolve(JSObject().put("ok", true))
    }

    @PluginMethod
    fun cacheStats(call: PluginCall) {
        try {
            val c = cache(context)
            val bytes = c.cacheSpace
            call.resolve(
                JSObject()
                    .put("bytes", bytes)
                    .put("maxBytes", CACHE_SIZE_BYTES)
            )
        } catch (t: Throwable) {
            call.reject("cacheStats failed: ${t.message}")
        }
    }

    private fun warmCache(url: String, maxBytes: Long): Boolean {
        var dataSource: androidx.media3.datasource.DataSource? = null
        return try {
            val cancelFlag = AtomicBoolean(false)
            dataSource = CacheDataSource.Factory()
                .setCache(cache(context))
                .setUpstreamDataSourceFactory(
                    DefaultHttpDataSource.Factory()
                        .setConnectTimeoutMs(15_000)
                        .setReadTimeoutMs(30_000)
                        .setAllowCrossProtocolRedirects(true)
                )
                .setFlags(CacheDataSource.FLAG_IGNORE_CACHE_ON_ERROR)
                .createDataSource()
            val spec = DataSpec.Builder()
                .setUri(Uri.parse(url))
                .setPosition(0)
                .setLength(maxBytes)
                .build()
            // CacheWriter actually writes upstream bytes into SimpleCache
            // (the old implementation read but discarded → playback got
            // zero benefit). Progress listener is no-op; we only care
            // that the bytes land on disk.
            CacheWriter(dataSource, spec, null, null).cache()
            true
        } catch (_: InterruptedException) {
            false
        } catch (_: Throwable) {
            false
        } finally {
            try { dataSource?.close() } catch (_: Throwable) {}
        }
    }

    private fun cancelInFlight() {
        synchronized(inFlightLock) {
            for (f in inFlightFutures) {
                try { f.cancel(true) } catch (_: Throwable) {}
            }
            inFlightFutures.clear()
        }
    }

    private fun ensureOverlay() {
        if (overlay != null && surface != null) return
        val wv = bridge.webView ?: return
        val parent = wv.parent as? ViewGroup ?: return

        val fl = FrameLayout(context).apply {
            setBackgroundColor(Color.BLACK)
            layoutParams = ViewGroup.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.MATCH_PARENT,
            )
            isClickable = false
            isFocusable = false
        }
        val sv = SurfaceView(context).apply {
            layoutParams = FrameLayout.LayoutParams(
                FrameLayout.LayoutParams.MATCH_PARENT,
                FrameLayout.LayoutParams.MATCH_PARENT,
            )
        }
        fl.addView(sv)

        // Insert BELOW the WebView so JS UI overlays render on top.
        parent.addView(fl, 0)

        // Make WebView transparent so the <video> rect (which JS will hide)
        // exposes the native surface beneath. Other React UI keeps its
        // own opaque backgrounds where defined.
        try {
            wv.setBackgroundColor(Color.TRANSPARENT)
        } catch (_: Throwable) {}

        overlay = fl
        surface = sv
    }

    private fun ensurePlayer() {
        if (player != null) return
        val cacheDataSource = CacheDataSource.Factory()
            .setCache(cache(context))
            .setUpstreamDataSourceFactory(
                DefaultHttpDataSource.Factory()
                    .setConnectTimeoutMs(15_000)
                    .setReadTimeoutMs(30_000)
                    .setAllowCrossProtocolRedirects(true)
            )
            .setFlags(CacheDataSource.FLAG_IGNORE_CACHE_ON_ERROR)
        val mediaSourceFactory = DefaultMediaSourceFactory(context)
            .setDataSourceFactory(cacheDataSource)
        val p = ExoPlayer.Builder(context)
            .setMediaSourceFactory(mediaSourceFactory)
            .build()
        surface?.let { p.setVideoSurfaceView(it) }
        p.addListener(object : Player.Listener {
            override fun onPlaybackStateChanged(state: Int) {
                when (state) {
                    Player.STATE_READY -> {
                        val ev = JSObject()
                            .put("url", currentUrl)
                            .put("durationMs", p.duration.coerceAtLeast(0))
                        notifyListeners("reel:ready", ev)
                    }
                    Player.STATE_ENDED -> {
                        notifyListeners("reel:complete", JSObject().put("url", currentUrl))
                    }
                    else -> {}
                }
            }
            override fun onPlayerError(error: PlaybackException) {
                val ev = JSObject()
                    .put("url", currentUrl)
                    .put("errorCode", error.errorCode)
                    .put("errorMsg", error.message ?: "unknown")
                notifyListeners("reel:error", ev)
            }
            override fun onIsPlayingChanged(isPlaying: Boolean) {
                notifyListeners(
                    "reel:playing",
                    JSObject().put("url", currentUrl).put("isPlaying", isPlaying)
                )
            }
        })
        player = p
    }

    private fun showOverlay() {
        overlay?.visibility = View.VISIBLE
    }

    private fun hideOverlay() {
        overlay?.visibility = View.GONE
    }

    override fun handleOnDestroy() {
        super.handleOnDestroy()
        try { cancelInFlight() } catch (_: Throwable) {}
        try { prefetchExecutor.shutdownNow() } catch (_: Throwable) {}
        try {
            activity?.runOnUiThread {
                try { player?.release() } catch (_: Throwable) {}
                player = null
                try { (overlay?.parent as? ViewGroup)?.removeView(overlay) } catch (_: Throwable) {}
                overlay = null
                surface = null
            }
        } catch (_: Throwable) {}
        // Release the shared SimpleCache file handles + WAL.
        try {
            synchronized(Companion) {
                try { simpleCache?.release() } catch (_: Throwable) {}
                simpleCache = null
            }
        } catch (_: Throwable) {}
    }
}
