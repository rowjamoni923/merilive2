package com.merilive.app.plugin

import android.graphics.Color
import android.view.Gravity
import android.view.View
import android.view.ViewGroup
import android.view.animation.AccelerateInterpolator
import android.view.animation.DecelerateInterpolator
import android.widget.FrameLayout
import android.widget.ImageView
import com.airbnb.lottie.LottieAnimationView
import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin
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
 * Pkg438 — Native Android entry-banner animation overlay (Chamet-class).
 *
 * Drives the "user entered the room" / "VIP grand entrance" banners with
 * hardware-accelerated VAP / Lottie / image rendering above the WebView.
 *
 *   • Priority: noble > vip > high-level > basic
 *   • Single horizontal slot at top (default) or bottom (configurable)
 *   • Slide-in/slide-out fallback for static images
 *   • Shared GiftAudioMixer for entry sounds (ducked when gifts overlap)
 *   • Per-job timeout, queue cap, cancel by id, lifecycle pause/resume
 *
 * ADDITIVE — Web EntryBarAnimation / UnifiedEntryAnimation / PremiumEntryAnimation
 * are NOT modified. Phase B adds the JS dispatcher.
 */
@CapacitorPlugin(name = "NativeEntryAnimation")
class NativeEntryAnimationPlugin : Plugin() {

    companion object {
        private const val MAX_QUEUE_SIZE = 32
        private const val DEFAULT_TIMEOUT_MS = 10_000L
        private const val IMAGE_DURATION_MS = 4_500L
        private const val SLIDE_DURATION_MS = 500L
    }

    private data class Job(
        val id: String,
        val type: String,         // vap | lottie | image
        val url: String,
        val soundUrl: String?,
        val priority: Int,        // noble=400, vip=300, level=lvl, basic=0
        val anchor: String,       // top | bottom
        val timeoutMs: Long,
        val enqueuedAt: Long,
    )

    private val seq = AtomicInteger(0)
    private val jobs = PriorityQueue<Job>(8) { a, b ->
        val byPri = b.priority.compareTo(a.priority)
        if (byPri != 0) byPri else a.enqueuedAt.compareTo(b.enqueuedAt)
    }
    private val jobsLock = Any()
    // Pkg-audit fix: written on main thread, read on plugin/binder thread
    // (cancel()). Without @Volatile a stale null could miss an active cancel.
    @Volatile private var activeJob: Job? = null

    private var activeView: View? = null
    private var activeAnim: AnimView? = null
    private var activeLottie: LottieAnimationView? = null
    private val activeFinished = AtomicBoolean(true)
    private val isPaused = AtomicBoolean(false)
    private val downloadCache = ConcurrentHashMap<String, File>()
    private val downloadExecutor = Executors.newFixedThreadPool(2)
    private var root: FrameLayout? = null
    // Single shared Handler — MUST be a property, not a getter. A new Handler
    // per access makes removeCallbacks() target the wrong instance.
    private val mainHandler = android.os.Handler(android.os.Looper.getMainLooper())

    private var activeWatchdog: Runnable? = null
    // Pkg-audit fix: secondary deferred runnable for image slide-out — must be
    // cancellable on finishActive so it doesn't fire 4.5s post-cancel with a
    // stale view reference.
    private var activeDeferred: Runnable? = null


    // ─── Public API ─────────────────────────────────────────────────────────

    @PluginMethod
    fun isAvailable(call: PluginCall) {
        val available = try {
            Class.forName("com.tencent.qgame.animplayer.AnimView"); true
        } catch (_: Throwable) { false }
        call.resolve(JSObject()
            .put("available", available)
            .put("lottie", classExists("com.airbnb.lottie.LottieAnimationView")))
    }

    @PluginMethod
    fun enqueue(call: PluginCall) {
        val url = call.getString("url") ?: return call.reject("url required")
        val type = (call.getString("type") ?: inferType(url)).lowercase()
        val id = call.getString("id") ?: ("e_" + UUID.randomUUID().toString().take(12))
        val soundUrl = call.getString("soundUrl")
        val priority = (call.getInt("priority") ?: 0).coerceIn(-1000, 1000)
        val anchor = (call.getString("anchor") ?: "top").lowercase()
        val timeoutMs = (call.getInt("timeoutMs") ?: DEFAULT_TIMEOUT_MS.toInt())
            .toLong().coerceIn(1_000L, 30_000L)
        if (type !in setOf("vap", "lottie", "image")) {
            return call.reject("unsupported type: $type")
        }
        val job = Job(id, type, url, soundUrl, priority,
            if (anchor in setOf("top","bottom")) anchor else "top",
            timeoutMs, System.nanoTime() + seq.incrementAndGet())
        synchronized(jobsLock) {
            if (jobs.size >= MAX_QUEUE_SIZE) {
                val it = jobs.iterator()
                var lowest: Job? = null
                while (it.hasNext()) {
                    val j = it.next()
                    if (lowest == null || j.priority < lowest!!.priority) lowest = j
                }
                if (lowest != null && lowest!!.priority < priority) {
                    jobs.remove(lowest); emit("entry:error", JSObject()
                        .put("id", lowest!!.id).put("errorMsg", "evicted by higher priority"))
                } else {
                    return call.reject("queue full")
                }
            }
            jobs.add(job)
        }
        emit("entry:queued", JSObject().put("id", id).put("queueSize", queueSize()))
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
        if (activeJob?.id == id) {
            activity.runOnUiThread { finishActive("cancelled") }
            removed = true
        }
        call.resolve(JSObject().put("ok", removed))
    }

    @PluginMethod
    fun clearAll(call: PluginCall) {
        synchronized(jobsLock) { jobs.clear() }
        activity.runOnUiThread { finishActive("cleared") }
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

    // ─── Lifecycle ──────────────────────────────────────────────────────────

    override fun load() {
        super.load()
        try { GiftAudioMixer.ensureInit(context) } catch (_: Throwable) {}
    }

    override fun handleOnPause() { super.handleOnPause(); isPaused.set(true) }
    override fun handleOnResume() {
        super.handleOnResume(); isPaused.set(false); activity.runOnUiThread { pump() }
    }

    @Volatile private var destroyed = false

    override fun handleOnDestroy() {
        destroyed = true
        // CRITICAL: pause BEFORE finishActive so the trailing 250ms pump() does
        // not dispatch a new job into a now-shutdown downloadExecutor.
        isPaused.set(true)
        try { downloadExecutor.shutdownNow() } catch (_: Throwable) {}
        try { finishActive("destroy") } catch (_: Throwable) {}
        synchronized(jobsLock) { jobs.clear() }
        try {
            activeView?.let { v ->
                try { v.animate().cancel() } catch (_: Throwable) {}
                (v.parent as? ViewGroup)?.removeView(v)
            }
        } catch (_: Throwable) {}
        try {
            root?.let { v -> (v.parent as? ViewGroup)?.removeView(v) }
        } catch (_: Throwable) {}
        activeView = null
        root = null
        downloadCache.clear()
        super.handleOnDestroy()
    }

    // ─── Pump ───────────────────────────────────────────────────────────────

    private fun pump() {
        if (isPaused.get()) return
        if (activeJob != null && !activeFinished.get()) return
        val next: Job = synchronized(jobsLock) { jobs.poll() } ?: return
        startJob(next)
    }

    private fun startJob(job: Job) {
        ensureRoot()
        activeJob = job
        activeFinished.set(false)
        val wd = Runnable { finishActive("timeout") }
        activeWatchdog = wd
        mainHandler.postDelayed(wd, job.timeoutMs)
        // Pkg-audit fix: capture the job we started so a late download-failure
        // doesn't tear down a different (innocent) job that started meanwhile.
        val capturedJob = job
        try {
            downloadExecutor.execute {
                val file = try { resolveLocalFile(capturedJob.url) } catch (_: Throwable) { null }
                if (file == null) {
                    if (destroyed) return@execute
                    activity?.runOnUiThread {
                        if (destroyed) return@runOnUiThread
                        if (activeJob?.id != capturedJob.id) return@runOnUiThread
                        finishActive("download failed")
                    }
                    return@execute
                }
                if (destroyed) return@execute
                activity?.runOnUiThread {
                    if (destroyed) return@runOnUiThread
                    if (activeFinished.get()) return@runOnUiThread
                    if (activeJob?.id != capturedJob.id) return@runOnUiThread
                    try {
                        when (capturedJob.type) {
                            "vap"    -> renderVAP(capturedJob, file)
                            "lottie" -> renderLottie(capturedJob, file)
                            "image"  -> renderImage(capturedJob, file)
                            else     -> renderImage(capturedJob, file)
                        }
                        GiftAudioMixer.play(capturedJob.soundUrl, 0.85f)
                        emit("entry:start", JSObject()
                            .put("id", capturedJob.id).put("url", capturedJob.url).put("type", capturedJob.type))
                    } catch (t: Throwable) {
                        finishActive("render: ${t.message}")
                    }
                }
            }
        } catch (_: java.util.concurrent.RejectedExecutionException) {
            // Executor shut down (destroy in flight) — abort job cleanly.
            if (activeFinished.compareAndSet(false, true)) {
                activeWatchdog?.let { mainHandler.removeCallbacks(it) }
                activeWatchdog = null
                activeJob = null
            }
        }
    }


    private fun finishActive(reason: String) {
        if (!activeFinished.compareAndSet(false, true)) return
        val job = activeJob
        activeWatchdog?.let { mainHandler.removeCallbacks(it) }
        activeWatchdog = null
        activeDeferred?.let { mainHandler.removeCallbacks(it) }
        activeDeferred = null

        try { activeAnim?.stopPlay() } catch (_: Throwable) {}
        try { activeLottie?.cancelAnimation() } catch (_: Throwable) {}
        activeView?.let { v ->
            // Cancel any in-flight animator on the view to avoid a stale
            // ViewPropertyAnimator holding the view past detach.
            try { v.animate().cancel() } catch (_: Throwable) {}
            // Slide-out for image, fade-out for animated.
            v.animate().alpha(0f).setDuration(SLIDE_DURATION_MS).withEndAction {
                try { (v.parent as? ViewGroup)?.removeView(v) } catch (_: Throwable) {}
            }.start()
        }
        activeView = null
        activeAnim = null
        activeLottie = null
        if (job != null) {
            val ok = reason in setOf("complete", "ok")
            emit(if (ok) "entry:complete" else "entry:error", JSObject()
                .put("id", job.id).put("url", job.url).put("reason", reason))
        }
        activeJob = null
        // Slight gap between consecutive entries — but skip when destroyed
        // to avoid posting work onto a torn-down handler/executor.
        if (!destroyed) {
            mainHandler.postDelayed({ pump() }, 250)
        }
    }

    // ─── Renderers ──────────────────────────────────────────────────────────

    private fun renderVAP(job: Job, file: File) {
        val av = AnimView(context).apply {
            layoutParams = makeLp(job.anchor)
            setScaleType(ScaleType.FIT_CENTER)
            setLoop(1)
            setAnimListener(object : IAnimListener {
                override fun onVideoConfigReady(config: AnimConfig): Boolean = true
                override fun onVideoStart() {}
                override fun onVideoRender(frameIndex: Int, config: AnimConfig?) {}
                override fun onVideoComplete() { activity.runOnUiThread { finishActive("complete") } }
                override fun onFailed(errorType: Int, errorMsg: String?) {
                    activity.runOnUiThread { finishActive("vap $errorType") }
                }
            })
        }
        activeAnim = av
        attach(av)
        av.startPlay(file)
    }

    private fun renderLottie(job: Job, file: File) {
        if (!classExists("com.airbnb.lottie.LottieAnimationView")) {
            renderImage(job, file); return
        }
        val lv = LottieAnimationView(context).apply {
            layoutParams = makeLp(job.anchor)
            repeatCount = 0
            renderMode = com.airbnb.lottie.RenderMode.HARDWARE
        }
        activeLottie = lv
        attach(lv)
        try { lv.setAnimation(file.inputStream(), file.absolutePath) }
        catch (t: Throwable) { finishActive("lottie load: ${t.message}"); return }
        lv.addAnimatorListener(object : android.animation.Animator.AnimatorListener {
            override fun onAnimationStart(animation: android.animation.Animator) {}
            override fun onAnimationEnd(animation: android.animation.Animator) { finishActive("complete") }
            override fun onAnimationCancel(animation: android.animation.Animator) { finishActive("cancelled") }
            override fun onAnimationRepeat(animation: android.animation.Animator) {}
        })
        lv.playAnimation()
    }

    private fun renderImage(job: Job, file: File) {
        val iv = ImageView(context).apply {
            layoutParams = makeLp(job.anchor)
            scaleType = ImageView.ScaleType.FIT_CENTER
            alpha = 0f
            try { setImageURI(android.net.Uri.fromFile(file)) } catch (_: Throwable) {}
        }
        attach(iv)
        // Slide-in
        iv.translationX = if (job.anchor == "top") -iv.resources.displayMetrics.widthPixels.toFloat()
                          else iv.resources.displayMetrics.widthPixels.toFloat()
        iv.animate()
            .alpha(1f).translationX(0f)
            .setInterpolator(DecelerateInterpolator())
            .setDuration(SLIDE_DURATION_MS).start()
        // Pkg-audit fix: track this deferred slide-out so finishActive can
        // cancel it on early cancel/timeout instead of leaking a 4.5s reference
        // to the (potentially detached) ImageView.
        val deferred = Runnable {
            iv.animate()
                .alpha(0f)
                .translationX(if (job.anchor == "top") iv.resources.displayMetrics.widthPixels.toFloat()
                              else -iv.resources.displayMetrics.widthPixels.toFloat())
                .setInterpolator(AccelerateInterpolator())
                .setDuration(SLIDE_DURATION_MS)
                .withEndAction { finishActive("complete") }
                .start()
        }
        activeDeferred = deferred
        mainHandler.postDelayed(deferred, IMAGE_DURATION_MS)
    }


    private fun makeLp(anchor: String): FrameLayout.LayoutParams =
        FrameLayout.LayoutParams(
            FrameLayout.LayoutParams.MATCH_PARENT,
            FrameLayout.LayoutParams.WRAP_CONTENT,
        ).apply {
            gravity = if (anchor == "bottom") Gravity.BOTTOM or Gravity.CENTER_HORIZONTAL
                      else Gravity.TOP or Gravity.CENTER_HORIZONTAL
            val px = (context.resources.displayMetrics.density * 64).toInt()
            topMargin = if (anchor == "top") px else 0
            bottomMargin = if (anchor == "bottom") px else 0
        }

    // ─── View tree ──────────────────────────────────────────────────────────

    private fun ensureRoot() {
        if (root != null) return
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
            // Tag so LiveKitPlugin's z-order enforcer keeps this overlay
            // ABOVE both the WebView and the LiveKit TextureViewRenderer.
            // Prevents premium entry / Flying Name Bars from being occluded
            // by the native video layer on subsequent renderer reuse.
            tag = "merilive.overlay.entry"
        }
        parent.addView(fl)
        root = fl
        try { fl.bringToFront() } catch (_: Throwable) {}
    }

    private fun attach(view: View) {
        ensureRoot()
        activeView = view
        root?.addView(view)
        // Re-assert overlay z-order every time an entry animation mounts so
        // a freshly attached LiveKit renderer can never visually replace it.
        try { root?.bringToFront(); (root?.parent as? View)?.invalidate() } catch (_: Throwable) {}
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
            u.endsWith(".json") -> "lottie"
            u.endsWith(".mp4") || u.endsWith(".webm") -> "vap"
            u.endsWith(".png") || u.endsWith(".jpg") || u.endsWith(".jpeg") ||
                u.endsWith(".webp") || u.endsWith(".gif") -> "image"
            else -> "vap"
        }
    }

    private fun resolveLocalFile(url: String): File {
        downloadCache[url]?.let { if (it.exists()) return it }
        if (url.startsWith("file://") || url.startsWith("/")) {
            val raw = if (url.startsWith("file://")) url.removePrefix("file://") else url
            val f = File(raw)
            if (f.exists()) { downloadCache[url] = f; return f }
        }
        val cacheDir = File(context.cacheDir, "entry-anim").apply { mkdirs() }
        val safeName = url.hashCode().toString().replace("-", "n") + suffixOf(url)
        val target = File(cacheDir, safeName)
        if (target.exists() && target.length() > 0) {
            downloadCache[url] = target; return target
        }
        val tmp = File(cacheDir, "$safeName.tmp")
        val conn = (URL(url).openConnection() as HttpURLConnection).apply {
            connectTimeout = 12_000
            readTimeout = 20_000
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
