package com.merilive.app.plugins

import android.animation.Animator
import android.animation.AnimatorListenerAdapter
import android.app.Activity
import android.content.Context
import android.graphics.Color
import android.net.Uri
import android.os.Handler
import android.os.Looper
import android.util.Log
import android.view.Gravity
import android.view.View
import android.view.ViewGroup
import android.view.animation.DecelerateInterpolator
import android.widget.FrameLayout
import android.widget.ImageView
import com.airbnb.lottie.LottieAnimationView
import com.airbnb.lottie.LottieCompositionFactory
import com.airbnb.lottie.LottieListener
import com.tencent.qgame.animplayer.AnimView
import com.tencent.qgame.animplayer.inter.IAnimListener
import com.tencent.qgame.animplayer.util.ScaleType as VapScaleType
import io.flutter.embedding.engine.FlutterEngine
import io.flutter.embedding.engine.plugins.FlutterPlugin
import io.flutter.plugin.common.MethodCall
import io.flutter.plugin.common.MethodChannel
import java.io.File
import java.io.FileOutputStream
import java.net.HttpURLConnection
import java.net.URL
import java.security.MessageDigest
import java.util.PriorityQueue
import java.util.UUID
import java.util.concurrent.Executors
import java.util.concurrent.atomic.AtomicInteger

/**
 * NativeEntryAnimationPlugin — flying entry banner / vehicle / noble
 * entrance renderer (Pkg438 Phase A).
 *
 * MethodChannel: `merilive/entry_animation`
 *
 * Methods:
 *   • `enqueue({id?, type, url, soundUrl?, priority, anchor, timeoutMs})` → Boolean accepted
 *   • `prefetch({url})` → void (best-effort disk warmup)
 *   • `cancel({id})` → void
 *   • `clearAll()` → void
 *
 * Design:
 *   • Single-slot playback (entries never overlap — they queue).
 *   • Anchor: `top` slides in from right → holds → slides out to left,
 *     `bottom` slides in from left. Mirrors web `EntryBannerAnimation.tsx`.
 *   • Types: `vap` (Tencent AnimView), `lottie` (Airbnb Lottie), `image`
 *     (auto-scaled ImageView with kenburns motion).
 *   • Queue cap 32, priority ordered (noble 400 > vip 300 > level > 0).
 *   • Hard watchdog 10s per slot.
 */
class NativeEntryAnimationPlugin : FlutterPlugin, MethodChannel.MethodCallHandler {

    companion object {
        private const val TAG = "NativeEntryAnimPlugin"
        private const val CHANNEL = "merilive/entry_animation"
        private const val MAX_QUEUE = 32
        private const val DEFAULT_TIMEOUT_MS = 10_000L
        private const val CONTAINER_ID = 0x7f090002
    }

    private var channel: MethodChannel? = null
    private var context: Context? = null
    private var container: FrameLayout? = null
    private val main = Handler(Looper.getMainLooper())
    private val io = Executors.newFixedThreadPool(2)

    private val seq = AtomicInteger(0)
    private data class Job(
        val id: String,
        val type: String,
        val url: String,
        val soundUrl: String?,
        val priority: Int,
        val anchor: String,
        val timeoutMs: Long,
        val order: Int,
    )
    private val pending: PriorityQueue<Job> = PriorityQueue(
        compareByDescending<Job> { it.priority }.thenBy { it.order }
    )
    private var current: ActiveSlot? = null

    // ── FlutterPlugin ──────────────────────────────────────────────────
    override fun onAttachedToEngine(binding: FlutterPlugin.FlutterPluginBinding) {
        context = binding.applicationContext
        channel = MethodChannel(binding.binaryMessenger, CHANNEL).apply {
            setMethodCallHandler(this@NativeEntryAnimationPlugin)
        }
    }

    override fun onDetachedFromEngine(binding: FlutterPlugin.FlutterPluginBinding) {
        clearAll()
        channel?.setMethodCallHandler(null)
        channel = null
        context = null
    }

    fun register(engine: FlutterEngine, activity: Activity) {
        context = activity
        attachContainerIfNeeded(activity)
        channel = MethodChannel(engine.dartExecutor.binaryMessenger, CHANNEL).apply {
            setMethodCallHandler(this@NativeEntryAnimationPlugin)
        }
    }

    // ── MethodChannel ──────────────────────────────────────────────────
    override fun onMethodCall(call: MethodCall, result: MethodChannel.Result) {
        when (call.method) {
            "enqueue" -> {
                val map = call.arguments as? Map<*, *>
                if (map == null) { result.success(false); return }
                result.success(enqueue(map))
            }
            "prefetch" -> {
                val url = (call.arguments as? Map<*, *>)?.get("url")?.toString()
                if (!url.isNullOrBlank()) io.execute { downloadToCache(url) }
                result.success(null)
            }
            "cancel" -> {
                val id = (call.arguments as? Map<*, *>)?.get("id")?.toString()
                if (id != null) cancel(id)
                result.success(null)
            }
            "clearAll" -> { clearAll(); result.success(null) }
            else -> result.notImplemented()
        }
    }

    // ── Queue ──────────────────────────────────────────────────────────
    private fun enqueue(map: Map<*, *>): Boolean {
        val url = map["url"]?.toString().orEmpty()
        if (url.isBlank()) return false
        val job = Job(
            id = map["id"]?.toString() ?: UUID.randomUUID().toString(),
            type = (map["type"]?.toString() ?: "image").lowercase(),
            url = url,
            soundUrl = map["soundUrl"]?.toString(),
            priority = (map["priority"] as? Number)?.toInt() ?: 0,
            anchor = map["anchor"]?.toString() ?: "top",
            timeoutMs = (map["timeoutMs"] as? Number)?.toLong() ?: DEFAULT_TIMEOUT_MS,
            order = seq.incrementAndGet(),
        )
        synchronized(pending) {
            if (pending.size >= MAX_QUEUE) {
                val lowest = pending.minByOrNull { it.priority } ?: return false
                pending.remove(lowest)
            }
            pending.add(job)
        }
        main.post { drainIfIdle() }
        return true
    }

    private fun drainIfIdle() {
        if (current != null) return
        val activity = context as? Activity ?: return
        attachContainerIfNeeded(activity)
        val next = synchronized(pending) { pending.poll() } ?: return
        startJob(next)
    }

    private fun attachContainerIfNeeded(activity: Activity) {
        if (container != null && container?.parent != null) return
        val decor = activity.window?.decorView as? ViewGroup ?: return
        val existing = decor.findViewById<FrameLayout>(CONTAINER_ID)
        if (existing != null) { container = existing; return }
        val fl = FrameLayout(activity).apply {
            id = CONTAINER_ID
            layoutParams = ViewGroup.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.MATCH_PARENT,
            )
            setBackgroundColor(Color.TRANSPARENT)
            isClickable = false
            isFocusable = false
        }
        decor.addView(fl)
        container = fl
    }

    // ── Active slot ────────────────────────────────────────────────────
    private inner class ActiveSlot(val job: Job) {
        var view: View? = null
        var watchdog: Runnable? = null
        fun teardown() {
            watchdog?.let { main.removeCallbacks(it) }
            when (val v = view) {
                is AnimView -> try { v.stopPlay() } catch (_: Throwable) {}
                is LottieAnimationView -> try { v.cancelAnimation() } catch (_: Throwable) {}
            }
            try { (view?.parent as? ViewGroup)?.removeView(view) } catch (_: Throwable) {}
        }
    }

    private fun startJob(job: Job) {
        val cont = container ?: return
        val ctx = context ?: return
        val slot = ActiveSlot(job)
        current = slot

        val done: () -> Unit = {
            main.post {
                slot.teardown()
                current = null
                drainIfIdle()
            }
        }
        val hard = Runnable { done() }
        slot.watchdog = hard
        main.postDelayed(hard, job.timeoutMs)

        if (!job.soundUrl.isNullOrBlank()) GiftAudioMixer.play(ctx, job.soundUrl)

        when (job.type) {
            "vap" -> renderVap(cont, slot, done)
            "lottie" -> renderLottie(cont, slot, done)
            else -> renderImage(cont, slot, done)
        }
    }

    // ── Renderers ──────────────────────────────────────────────────────
    private fun renderVap(cont: FrameLayout, slot: ActiveSlot, done: () -> Unit) {
        val ctx = context ?: return done()
        val view = AnimView(ctx).apply {
            layoutParams = FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.MATCH_PARENT,
            )
            setScaleType(VapScaleType.FIT_CENTER)
            setLoop(1)
            setAnimListener(object : IAnimListener {
                override fun onVideoStart() {}
                override fun onVideoRender(frameIndex: Int, config: com.tencent.qgame.animplayer.AnimConfig?) {}
                override fun onVideoComplete() = done()
                override fun onVideoDestroy() {}
                override fun onFailed(errorType: Int, errorMsg: String?) {
                    Log.w(TAG, "entry VAP failed [$errorType]: $errorMsg")
                    main.post {
                        (view!!.parent as? ViewGroup)?.removeView(view)
                        renderImage(cont, slot, done)
                    }
                }
            })
        }
        slot.view = view
        cont.addView(view)
        io.execute {
            val f = downloadToCache(slot.job.url) ?: return@execute main.post {
                (view.parent as? ViewGroup)?.removeView(view); renderImage(cont, slot, done)
            }
            main.post { view.startPlay(f) }
        }
    }

    private fun renderLottie(cont: FrameLayout, slot: ActiveSlot, done: () -> Unit) {
        val ctx = context ?: return done()
        val view = LottieAnimationView(ctx).apply {
            layoutParams = FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.MATCH_PARENT,
            )
            repeatCount = 0
            addAnimatorListener(object : AnimatorListenerAdapter() {
                override fun onAnimationEnd(a: Animator) = done()
            })
        }
        slot.view = view
        cont.addView(view)
        LottieCompositionFactory.fromUrl(ctx, slot.job.url).apply {
            addListener(LottieListener {
                view.setComposition(it); view.playAnimation()
            })
            addFailureListener(LottieListener {
                Log.w(TAG, "entry Lottie failed — fallback image")
                (view.parent as? ViewGroup)?.removeView(view)
                renderImage(cont, slot, done)
            })
        }
    }

    private fun renderImage(cont: FrameLayout, slot: ActiveSlot, done: () -> Unit) {
        val ctx = context ?: return done()
        val w = ctx.resources.displayMetrics.widthPixels
        val h = (w * 0.28f).toInt()
        val topAnchor = slot.job.anchor == "top"
        val iv = ImageView(ctx).apply {
            layoutParams = FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                h,
                if (topAnchor) Gravity.TOP else Gravity.BOTTOM,
            ).apply {
                topMargin = if (topAnchor) (h * 0.6f).toInt() else 0
                bottomMargin = if (!topAnchor) (h * 0.6f).toInt() else 0
            }
            scaleType = ImageView.ScaleType.FIT_CENTER
            translationX = if (topAnchor) w.toFloat() else -w.toFloat()
            alpha = 0f
        }
        slot.view = iv
        cont.addView(iv)
        io.execute {
            val bmp = try {
                val conn = URL(slot.job.url).openConnection() as HttpURLConnection
                conn.connectTimeout = 4000; conn.readTimeout = 5000
                conn.inputStream.use { android.graphics.BitmapFactory.decodeStream(it) }
            } catch (_: Throwable) { null }
            main.post {
                if (bmp != null) iv.setImageBitmap(bmp)
                iv.animate().translationX(0f).alpha(1f)
                    .setDuration(420).setInterpolator(DecelerateInterpolator()).start()
                main.postDelayed({
                    iv.animate().translationX(if (topAnchor) -iv.width.toFloat() else iv.width.toFloat())
                        .alpha(0f).setDuration(360).withEndAction { done() }.start()
                }, (slot.job.timeoutMs - 900L).coerceAtLeast(1600L))
            }
        }
    }

    // ── Public teardown ────────────────────────────────────────────────
    fun cancel(id: String) {
        main.post {
            synchronized(pending) { pending.removeIf { it.id == id } }
            if (current?.job?.id == id) {
                current?.teardown(); current = null; drainIfIdle()
            }
        }
    }

    fun clearAll() {
        main.post {
            synchronized(pending) { pending.clear() }
            current?.teardown()
            current = null
        }
    }

    // ── Cache ──────────────────────────────────────────────────────────
    private fun downloadToCache(url: String): File? {
        val ctx = context ?: return null
        return try {
            val md = MessageDigest.getInstance("MD5")
            val key = md.digest(url.toByteArray()).joinToString("") { "%02x".format(it) }
            val ext = url.substringAfterLast('.', "").take(6).ifBlank { "bin" }
            val dir = File(ctx.cacheDir, "merilive_entry").apply { mkdirs() }
            val f = File(dir, "$key.$ext")
            if (f.exists() && f.length() > 0) return f
            val conn = URL(url).openConnection() as HttpURLConnection
            conn.connectTimeout = 5000; conn.readTimeout = 8000
            conn.inputStream.use { input ->
                FileOutputStream(f).use { out -> input.copyTo(out) }
            }
            f
        } catch (t: Throwable) {
            Log.w(TAG, "entry download failed: ${t.message}")
            null
        }
    }
}
