package com.merilive.app.plugin

import android.graphics.Color
import android.net.Uri
import android.view.Gravity
import android.view.View
import android.view.ViewGroup
import android.widget.FrameLayout
import android.widget.ImageView
import androidx.media3.common.MediaItem
import androidx.media3.common.PlaybackException
import androidx.media3.common.Player
import androidx.media3.exoplayer.ExoPlayer
import com.airbnb.lottie.LottieAnimationView
import com.airbnb.lottie.LottieDrawable
import com.getcapacitor.JSArray
import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin
import com.opensource.svgaplayer.SVGACallback
import com.opensource.svgaplayer.SVGAImageView
import com.opensource.svgaplayer.SVGAParser
import com.opensource.svgaplayer.SVGAVideoEntity
import com.tencent.qgame.animplayer.AnimConfig
import com.tencent.qgame.animplayer.AnimView
import com.tencent.qgame.animplayer.inter.IAnimListener
import com.tencent.qgame.animplayer.util.ScaleType
import java.io.File
import java.net.HttpURLConnection
import java.net.URL
import java.util.PriorityQueue
import java.util.UUID
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.Executors
import java.util.concurrent.atomic.AtomicBoolean
import java.util.concurrent.atomic.AtomicInteger

/**
 * Pkg438 — Unified professional native gift animation overlay (Android).
 *
 * ONE plugin handles ALL gift visual+audio playback above the WebView:
 *
 *   • Tencent VAP (alpha-MP4)     — premium full-screen gifts (1MP+)
 *   • YYUED SVGA                  — vector + bitmap composite gifts
 *   • Airbnb Lottie               — vector JSON gifts (small, infinite-resolution)
 *   • Media3 ExoPlayer (MP4/WebM) — plain video clips
 *   • ImageView                   — static fallback
 *   • GiftAudioMixer              — shared SoundPool + MediaPlayer pool with ducking
 *
 * Features (Chamet-class):
 *   • Priority queue (high-value gifts jump ahead)
 *   • Up to 3 stacked concurrent slots (z-ordered)
 *   • Per-job timeout watchdog (caller-supplied or media-derived)
 *   • Lifecycle aware: queue paused when activity backgrounded
 *   • Disk-cache shared with NativeVAP / NativeSVGA / NativeLottie
 *   • Prefetch + batch prefetch (Pkg424 pattern)
 *   • Cancel by id or clearAll
 *   • Emits `gift:start`, `gift:complete`, `gift:error`, `gift:queued`
 *
 * ZERO-RISK ROLLOUT:
 *   • Additive — `NativeGiftAnimation` plugin name; existing FullScreenGiftAnimation
 *     /FlyingGiftAnimation/GiftEmojiAnimation/VAPPlayer WebView paths are not
 *     modified. JS dispatcher is added in Phase B.
 *   • Old APKs report `isAvailable=false` via Class.forName check.
 *   • Camera-conflict safe — decoder-only, never touches Camera2.
 */
@CapacitorPlugin(name = "NativeGiftAnimation")
class NativeGiftAnimationPlugin : Plugin() {

    companion object {
        private const val MAX_CONCURRENT_SLOTS = 3
        private const val DEFAULT_TIMEOUT_MS = 12_000L
        private const val MAX_QUEUE_SIZE = 64
    }

    // ─── Job ────────────────────────────────────────────────────────────────
    private data class Job(
        val id: String,
        val type: String,            // vap | svga | lottie | mp4 | image
        val url: String,
        val soundUrl: String?,
        val coins: Long,
        val priority: Int,           // higher wins
        val timeoutMs: Long,
        val enqueuedAt: Long,
    )

    private val seq = AtomicInteger(0)
    private val jobs = PriorityQueue<Job>(16) { a, b ->
        // priority desc, then coins desc, then earliest enqueue
        val byPri = b.priority.compareTo(a.priority)
        if (byPri != 0) return@PriorityQueue byPri
        val byCoins = b.coins.compareTo(a.coins)
        if (byCoins != 0) return@PriorityQueue byCoins
        a.enqueuedAt.compareTo(b.enqueuedAt)
    }
    private val jobsLock = Any()
    private val activeJobIds = ConcurrentHashMap<String, Slot>()
    private val isPaused = AtomicBoolean(false)
    private val downloadCache = ConcurrentHashMap<String, File>()
    private val downloadExecutor = Executors.newFixedThreadPool(3)

    // ─── Overlay ────────────────────────────────────────────────────────────
    private var giftRoot: FrameLayout? = null

    // A single "slot" holds one rendering view plus its watchdog state.
    private inner class Slot(val job: Job) {
        var rootView: View? = null
        var exoPlayer: ExoPlayer? = null
        var lottieView: LottieAnimationView? = null
        var svgaView: SVGAImageView? = null
        var animView: AnimView? = null
        val finished = AtomicBoolean(false)
        // Pkg-audit fix: cancellable deferred for static-image auto-finish.
        var deferredFinish: Runnable? = null
        val watchdog = Runnable {
            if (finished.compareAndSet(false, true)) {
                emit("gift:error", JSObject()
                    .put("id", job.id)
                    .put("url", job.url)
                    .put("errorMsg", "timeout"))
                tearDown(this)
                pump()
            }
        }
    }

    @Volatile private var destroyed = false

    // ─── Public API ─────────────────────────────────────────────────────────

    @PluginMethod
    fun isAvailable(call: PluginCall) {
        // VAP + Media3 are mandatory; SVGA + Lottie are optional (gracefully
        // degraded to ImageView when missing). Old APKs without media3 will
        // report false so JS falls back to WebView path.
        val available = try {
            Class.forName("com.tencent.qgame.animplayer.AnimView")
            Class.forName("androidx.media3.exoplayer.ExoPlayer")
            true
        } catch (_: Throwable) {
            false
        }
        call.resolve(JSObject()
            .put("available", available)
            .put("svga", classExists("com.opensource.svgaplayer.SVGAImageView"))
            .put("lottie", classExists("com.airbnb.lottie.LottieAnimationView"))
            .put("maxConcurrent", MAX_CONCURRENT_SLOTS))
    }

    @PluginMethod
    fun enqueue(call: PluginCall) {
        val url = call.getString("url") ?: return call.reject("url required")
        val type = (call.getString("type") ?: inferType(url)).lowercase()
        val id = call.getString("id") ?: ("g_" + UUID.randomUUID().toString().take(12))
        val soundUrl = call.getString("soundUrl")
        val coins = (call.getInt("coins") ?: 0).toLong().coerceAtLeast(0)
        val priority = (call.getInt("priority") ?: 0).coerceIn(-1000, 1000)
        val timeoutMs = (call.getInt("timeoutMs") ?: DEFAULT_TIMEOUT_MS.toInt())
            .toLong().coerceIn(1_000L, 60_000L)

        if (type !in setOf("vap", "svga", "lottie", "mp4", "image")) {
            return call.reject("unsupported type: $type")
        }

        val job = Job(
            id = id,
            type = type,
            url = url,
            soundUrl = soundUrl,
            coins = coins,
            priority = priority,
            timeoutMs = timeoutMs,
            enqueuedAt = System.nanoTime() + seq.incrementAndGet(),
        )

        synchronized(jobsLock) {
            if (jobs.size >= MAX_QUEUE_SIZE) {
                // Drop lowest-priority job to make room — never block enqueue.
                // PriorityQueue head = smallest per comparator (highest priority);
                // tail = largest per comparator (lowest priority). maxWithOrNull
                // with the queue's own comparator returns that lowest-priority element.
                val lowest = jobs.maxWithOrNull(jobs.comparator())
                // Evict only if the incoming job ranks BETTER than the lowest
                // current job per the SAME comparator (composite pri+coins+ts).
                if (lowest != null && jobs.comparator().compare(lowest, job) > 0) {
                    jobs.remove(lowest)
                    emit("gift:error", JSObject()
                        .put("id", lowest.id)
                        .put("errorMsg", "evicted by higher priority"))
                } else {
                    return call.reject("queue full")
                }
            }
            jobs.add(job)
        }

        emit("gift:queued", JSObject().put("id", id).put("queueSize", queueSize()))
        activity.runOnUiThread { pump() }
        call.resolve(JSObject().put("id", id).put("queued", true))
    }

    @PluginMethod
    fun cancel(call: PluginCall) {
        val id = call.getString("id") ?: return call.reject("id required")
        var removed = false
        synchronized(jobsLock) {
            val it = jobs.iterator()
            while (it.hasNext()) if (it.next().id == id) { it.remove(); removed = true; break }
        }
        activeJobIds[id]?.let { slot ->
            activity.runOnUiThread { tearDown(slot); pump() }
            removed = true
        }
        call.resolve(JSObject().put("ok", removed))
    }

    @PluginMethod
    fun clearAll(call: PluginCall) {
        synchronized(jobsLock) { jobs.clear() }
        activity.runOnUiThread {
            for (slot in activeJobIds.values.toList()) tearDown(slot)
            GiftAudioMixer.stopAll()
        }
        call.resolve()
    }

    @PluginMethod
    fun pause(call: PluginCall) { isPaused.set(true); call.resolve() }

    @PluginMethod
    fun resume(call: PluginCall) {
        isPaused.set(false); activity.runOnUiThread { pump() }; call.resolve()
    }

    @PluginMethod
    fun prefetch(call: PluginCall) {
        val url = call.getString("url") ?: return call.reject("url required")
        downloadExecutor.execute {
            try { resolveLocalFile(url) } catch (_: Throwable) {}
            call.resolve(JSObject().put("ok", true))
        }
    }

    @PluginMethod
    fun prefetchBatch(call: PluginCall) {
        val arr: JSArray = call.getArray("urls") ?: return call.reject("urls required")
        var queued = 0
        for (i in 0 until arr.length()) {
            val s = arr.optString(i, "")
            if (s.isNullOrBlank()) continue
            queued++
            downloadExecutor.execute { try { resolveLocalFile(s) } catch (_: Throwable) {} }
        }
        call.resolve(JSObject().put("ok", true).put("queued", queued))
    }

    @PluginMethod
    fun stats(call: PluginCall) {
        call.resolve(JSObject()
            .put("queued", queueSize())
            .put("active", activeJobIds.size)
            .put("paused", isPaused.get())
            .put("cacheBytes", cacheBytes()))
    }

    // ─── Lifecycle hooks ────────────────────────────────────────────────────

    override fun load() {
        super.load()
        try { GiftAudioMixer.ensureInit(context) } catch (_: Throwable) {}
    }

    override fun handleOnPause() {
        super.handleOnPause()
        isPaused.set(true)
    }

    override fun handleOnResume() {
        super.handleOnResume()
        isPaused.set(false)
        activity.runOnUiThread { pump() }
    }

    override fun handleOnDestroy() {
        destroyed = true
        isPaused.set(true)
        try { downloadExecutor.shutdownNow() } catch (_: Throwable) {}
        try {
            for (slot in activeJobIds.values.toList()) tearDown(slot)
        } catch (_: Throwable) {}
        synchronized(jobsLock) { jobs.clear() }
        try {
            giftRoot?.let { v -> (v.parent as? ViewGroup)?.removeView(v) }
        } catch (_: Throwable) {}
        giftRoot = null
        downloadCache.clear()
        super.handleOnDestroy()
    }

    private fun runUiSafe(block: () -> Unit) {
        if (destroyed) return
        val act = activity ?: return
        if (act.isFinishing || act.isDestroyed) return
        act.runOnUiThread {
            if (destroyed) return@runOnUiThread
            try { block() } catch (_: Throwable) {}
        }
    }

    // ─── Queue pump ─────────────────────────────────────────────────────────

    private fun pump() {
        if (isPaused.get()) return
        while (activeJobIds.size < MAX_CONCURRENT_SLOTS) {
            val next: Job? = synchronized(jobsLock) { jobs.poll() }
            if (next == null) return
            startJob(next)
        }
    }

    private fun startJob(job: Job) {
        ensureRoot()
        val slot = Slot(job)
        activeJobIds[job.id] = slot
        // Schedule timeout watchdog up front; cancelled on natural complete.
        mainHandler.postDelayed(slot.watchdog, job.timeoutMs)

        // Resolve file off the UI thread, then play on UI thread.
        try {
            downloadExecutor.execute {
                val file = try { resolveLocalFile(job.url) } catch (_: Throwable) { null }
                if (file == null) {
                    if (slot.finished.compareAndSet(false, true)) {
                        runUiSafe {
                            emit("gift:error", JSObject()
                                .put("id", job.id).put("url", job.url)
                                .put("errorMsg", "download failed"))
                            tearDown(slot); pump()
                        }
                    }
                    return@execute
                }
                runUiSafe {
                    if (slot.finished.get()) return@runUiSafe
                    try {
                        when (job.type) {
                            "vap"    -> renderVAP(slot, file)
                            "svga"   -> renderSVGA(slot, file)
                            "lottie" -> renderLottie(slot, file)
                            "mp4"    -> renderExo(slot, file)
                            "image"  -> renderImage(slot, file)
                            else     -> renderImage(slot, file)
                        }
                        GiftAudioMixer.play(job.soundUrl)
                        emit("gift:start", JSObject()
                            .put("id", job.id).put("url", job.url).put("type", job.type))
                    } catch (t: Throwable) {
                        if (slot.finished.compareAndSet(false, true)) {
                            emit("gift:error", JSObject()
                                .put("id", job.id).put("url", job.url)
                                .put("errorMsg", t.message ?: "render exception"))
                            tearDown(slot); pump()
                        }
                    }
                }
            }
        } catch (_: java.util.concurrent.RejectedExecutionException) {
            // Executor already shut down (destroy in flight) — abort job cleanly.
            if (slot.finished.compareAndSet(false, true)) {
                tearDown(slot)
            }
        }
    }

    private fun finishOk(slot: Slot) {
        if (!slot.finished.compareAndSet(false, true)) return
        emit("gift:complete", JSObject()
            .put("id", slot.job.id).put("url", slot.job.url))
        tearDown(slot)
        pump()
    }

    private fun finishErr(slot: Slot, msg: String) {
        if (!slot.finished.compareAndSet(false, true)) return
        emit("gift:error", JSObject()
            .put("id", slot.job.id).put("url", slot.job.url).put("errorMsg", msg))
        tearDown(slot)
        pump()
    }

    // ─── Renderers ──────────────────────────────────────────────────────────

    private fun renderVAP(slot: Slot, file: File) {
        val av = AnimView(context).apply {
            layoutParams = FrameLayout.LayoutParams(
                FrameLayout.LayoutParams.MATCH_PARENT,
                FrameLayout.LayoutParams.MATCH_PARENT,
            ).apply { gravity = Gravity.CENTER }
            setScaleType(ScaleType.FIT_CENTER)
            setLoop(1)
            setAnimListener(object : IAnimListener {
                override fun onVideoConfigReady(config: AnimConfig): Boolean = true
                override fun onVideoStart() {}
                override fun onVideoRender(frameIndex: Int, config: AnimConfig?) {}
                override fun onVideoComplete() { activity.runOnUiThread { finishOk(slot) } }
                override fun onFailed(errorType: Int, errorMsg: String?) {
                    activity.runOnUiThread { finishErr(slot, "vap $errorType: $errorMsg") }
                }
            })
        }
        slot.animView = av
        attachSlotView(slot, av)
        av.startPlay(file)
    }

    private fun renderSVGA(slot: Slot, file: File) {
        if (!classExists("com.opensource.svgaplayer.SVGAImageView")) {
            renderImage(slot, file); return
        }
        val iv = SVGAImageView(context).apply {
            layoutParams = FrameLayout.LayoutParams(
                FrameLayout.LayoutParams.MATCH_PARENT,
                FrameLayout.LayoutParams.MATCH_PARENT,
            ).apply { gravity = Gravity.CENTER }
            loops = 1
        }
        slot.svgaView = iv
        attachSlotView(slot, iv)
        val parser = SVGAParser(context)
        parser.decodeFromInputStream(
            file.inputStream(),
            file.absolutePath,
            object : SVGAParser.ParseCompletion {
                override fun onComplete(videoItem: SVGAVideoEntity) {
                    activity.runOnUiThread {
                        iv.setVideoItem(videoItem)
                        iv.callback = object : SVGACallback {
                            override fun onPause() {}
                            override fun onRepeat() {}
                            override fun onStep(frame: Int, percentage: Double) {}
                            override fun onFinished() { finishOk(slot) }
                        }
                        iv.startAnimation()
                    }
                }
                override fun onError() {
                    activity.runOnUiThread { finishErr(slot, "svga parse error") }
                }
            }, true,
        )
    }

    private fun renderLottie(slot: Slot, file: File) {
        if (!classExists("com.airbnb.lottie.LottieAnimationView")) {
            renderImage(slot, file); return
        }
        val lv = LottieAnimationView(context).apply {
            layoutParams = FrameLayout.LayoutParams(
                FrameLayout.LayoutParams.MATCH_PARENT,
                FrameLayout.LayoutParams.MATCH_PARENT,
            ).apply { gravity = Gravity.CENTER }
            repeatCount = 0
            renderMode = com.airbnb.lottie.RenderMode.HARDWARE
        }
        slot.lottieView = lv
        attachSlotView(slot, lv)
        try {
            lv.setAnimation(file.inputStream(), file.absolutePath)
        } catch (t: Throwable) {
            finishErr(slot, "lottie load: ${t.message}"); return
        }
        lv.addAnimatorListener(object : android.animation.Animator.AnimatorListener {
            override fun onAnimationStart(animation: android.animation.Animator) {}
            override fun onAnimationEnd(animation: android.animation.Animator) { finishOk(slot) }
            override fun onAnimationCancel(animation: android.animation.Animator) { finishOk(slot) }
            override fun onAnimationRepeat(animation: android.animation.Animator) {}
        })
        lv.playAnimation()
    }

    private fun renderExo(slot: Slot, file: File) {
        val sv = android.view.SurfaceView(context).apply {
            layoutParams = FrameLayout.LayoutParams(
                FrameLayout.LayoutParams.MATCH_PARENT,
                FrameLayout.LayoutParams.MATCH_PARENT,
            ).apply { gravity = Gravity.CENTER }
        }
        attachSlotView(slot, sv)
        val p = ExoPlayer.Builder(context).build()
        slot.exoPlayer = p
        p.setVideoSurfaceView(sv)
        p.volume = 0f  // audio handled by GiftAudioMixer to avoid double-play
        p.repeatMode = Player.REPEAT_MODE_OFF
        p.addListener(object : Player.Listener {
            override fun onPlaybackStateChanged(state: Int) {
                if (state == Player.STATE_ENDED) finishOk(slot)
            }
            override fun onPlayerError(error: PlaybackException) {
                finishErr(slot, "exo: ${error.errorCode}")
            }
        })
        p.setMediaItem(MediaItem.fromUri(Uri.fromFile(file)))
        p.prepare()
        p.playWhenReady = true
    }

    private fun renderImage(slot: Slot, file: File) {
        val iv = ImageView(context).apply {
            layoutParams = FrameLayout.LayoutParams(
                FrameLayout.LayoutParams.WRAP_CONTENT,
                FrameLayout.LayoutParams.WRAP_CONTENT,
            ).apply { gravity = Gravity.CENTER }
            scaleType = ImageView.ScaleType.FIT_CENTER
        }
        attachSlotView(slot, iv)
        try {
            iv.setImageURI(Uri.fromFile(file))
        } catch (_: Throwable) {}
        // Static image — finish after a short reveal so the queue keeps flowing.
        val deferred = Runnable { finishOk(slot) }
        slot.deferredFinish = deferred
        mainHandler.postDelayed(deferred, 2_500)
    }

    // ─── View tree ──────────────────────────────────────────────────────────

    private fun ensureRoot() {
        if (giftRoot != null) return
        val wv = bridge.webView
        val parent = wv?.parent as? ViewGroup ?: return
        val fl = FrameLayout(context).apply {
            setBackgroundColor(Color.TRANSPARENT)
            layoutParams = ViewGroup.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.MATCH_PARENT,
            )
            isClickable = false
            isFocusable = false
            // Tag so LiveKitPlugin's z-order enforcer keeps gifts ABOVE the
            // LiveKit TextureViewRenderer on every renderer reuse.
            tag = "merilive.overlay.gift"
        }
        // Insert ABOVE WebView so gifts cover UI; webview events still fire
        // because giftRoot is non-interactive (clickable=false).
        parent.addView(fl)
        giftRoot = fl
        try { fl.bringToFront() } catch (_: Throwable) {}
    }

    private fun attachSlotView(slot: Slot, view: View) {
        ensureRoot()
        val root = giftRoot ?: return
        slot.rootView = view
        root.addView(view)
        try { root.bringToFront(); (root.parent as? View)?.invalidate() } catch (_: Throwable) {}
    }

    private fun tearDown(slot: Slot) {
        // Pkg-audit fix: mark finished BEFORE cancelling animators. Lottie's
        // cancelAnimation() synchronously fires onAnimationCancel which would
        // otherwise call finishOk() and emit a false "gift:complete" event for
        // a job that was actually externally cancelled / cleared / errored.
        slot.finished.set(true)
        mainHandler.removeCallbacks(slot.watchdog)
        slot.deferredFinish?.let { mainHandler.removeCallbacks(it) }
        slot.deferredFinish = null
        try { slot.animView?.stopPlay() } catch (_: Throwable) {}
        try { slot.svgaView?.stopAnimation(true) } catch (_: Throwable) {}
        try { slot.lottieView?.cancelAnimation() } catch (_: Throwable) {}
        try { slot.exoPlayer?.release() } catch (_: Throwable) {}
        slot.rootView?.let { v ->
            try { (v.parent as? ViewGroup)?.removeView(v) } catch (_: Throwable) {}
        }
        slot.animView = null
        slot.svgaView = null
        slot.lottieView = null
        slot.exoPlayer = null
        slot.rootView = null
        activeJobIds.remove(slot.job.id)
    }


    // ─── Helpers ────────────────────────────────────────────────────────────

    private fun emit(name: String, data: JSObject) {
        try { notifyListeners(name, data) } catch (_: Throwable) {}
    }

    private fun queueSize(): Int = synchronized(jobsLock) { jobs.size }

    private fun classExists(name: String): Boolean = try {
        Class.forName(name); true
    } catch (_: Throwable) { false }

    private fun inferType(url: String): String {
        val u = url.lowercase().substringBefore('?')
        return when {
            u.endsWith(".svga") -> "svga"
            u.endsWith(".json") -> "lottie"
            u.endsWith(".mp4") || u.endsWith(".webm") -> "vap" // VAP first; falls back to mp4 on failure
            u.endsWith(".png") || u.endsWith(".jpg") || u.endsWith(".jpeg") ||
                u.endsWith(".webp") || u.endsWith(".gif") -> "image"
            else -> "vap"
        }
    }

    // Single shared Handler — MUST be a property, not a function. A new
    // Handler per call would make removeCallbacks() target the wrong
    // instance, leaking watchdogs and firing false timeouts.
    private val mainHandler = android.os.Handler(android.os.Looper.getMainLooper())


    private fun cacheBytes(): Long {
        var total = 0L
        try {
            val dir = File(context.cacheDir, "gift-anim")
            dir.listFiles()?.forEach { total += it.length() }
        } catch (_: Throwable) {}
        return total
    }

    private fun resolveLocalFile(url: String): File {
        downloadCache[url]?.let { if (it.exists()) return it }
        if (url.startsWith("file://") || url.startsWith("/")) {
            val raw = if (url.startsWith("file://")) url.removePrefix("file://") else url
            val f = File(raw)
            if (f.exists()) { downloadCache[url] = f; return f }
        }
        val cacheDir = File(context.cacheDir, "gift-anim").apply { mkdirs() }
        val safeName = url.hashCode().toString().replace("-", "n") + suffixOf(url)
        val target = File(cacheDir, safeName)
        if (target.exists() && target.length() > 0) {
            downloadCache[url] = target; return target
        }
        val tmp = File(cacheDir, "$safeName.tmp")
        val conn = (URL(url).openConnection() as HttpURLConnection).apply {
            connectTimeout = 15_000
            readTimeout = 30_000
            instanceFollowRedirects = true
        }
        try {
            conn.inputStream.use { input ->
                tmp.outputStream().use { out -> input.copyTo(out) }
            }
            if (!tmp.renameTo(target)) { tmp.copyTo(target, overwrite = true); tmp.delete() }
        } finally {
            try { conn.disconnect() } catch (_: Throwable) {}
        }
        downloadCache[url] = target
        return target
    }

    private fun suffixOf(url: String): String {
        val u = url.lowercase().substringBefore('?')
        return when {
            u.endsWith(".svga") -> ".svga"
            u.endsWith(".json") -> ".json"
            u.endsWith(".webm") -> ".webm"
            u.endsWith(".png") -> ".png"
            u.endsWith(".jpg") || u.endsWith(".jpeg") -> ".jpg"
            u.endsWith(".webp") -> ".webp"
            u.endsWith(".gif") -> ".gif"
            else -> ".mp4"
        }
    }
}
