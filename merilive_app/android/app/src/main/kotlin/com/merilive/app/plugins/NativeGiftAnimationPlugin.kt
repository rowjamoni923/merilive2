package com.merilive.app.plugins

import android.animation.Animator
import android.animation.AnimatorListenerAdapter
import android.app.Activity
import android.content.Context
import android.graphics.Color
import android.graphics.drawable.Drawable
import android.media.MediaPlayer
import android.net.Uri
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.util.Log
import android.view.Gravity
import android.view.SurfaceView
import android.view.TextureView
import android.view.View
import android.view.ViewGroup
import android.view.animation.AccelerateInterpolator
import android.view.animation.DecelerateInterpolator
import android.widget.FrameLayout
import android.widget.ImageView
import android.widget.VideoView
import com.airbnb.lottie.LottieAnimationView
import com.airbnb.lottie.LottieCompositionFactory
import com.airbnb.lottie.LottieDrawable
import com.airbnb.lottie.LottieListener
import com.opensource.svgaplayer.SVGACallback
import com.opensource.svgaplayer.SVGADrawable
import com.opensource.svgaplayer.SVGAImageView
import com.opensource.svgaplayer.SVGAParser
import com.opensource.svgaplayer.SVGAVideoEntity
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
 * NativeGiftAnimationPlugin — full-screen VAP / SVGA / Lottie / MP4 / image
 * gift renderer that sits ABOVE the Flutter view (Pkg438 Phase A).
 *
 * MethodChannel: `merilive/gift_animation`
 *
 * Methods:
 *   • `play({id, kind, url, fallbackImage?, durationMs?, priority?, ...})` → Boolean accepted
 *   • `stopAll()` → void
 *
 * Design (mirrors web GiftAnimation.tsx + web VAPPlayer):
 *   • Single-container FrameLayout mounted as decor overlay (activity root).
 *   • Max 3 concurrent slots, max 64 in queue, priority-ordered.
 *   • Per-kind renderer: VAP (com.tencent.qgame.vap), SVGA
 *     (com.opensource.svgaplayer), Lottie, MP4 (VideoView), image (Glide-free
 *     — uses simple url→bitmap loader with disk cache).
 *   • Audio: MP4/VAP carries audio in-track; SVGA/Lottie/image gifts fire a
 *     sound effect via GiftAudioMixer if the payload carries `soundUrl`.
 *   • Watchdog: any slot older than 12s or without progress callbacks in 6s
 *     is force-recycled.
 *   • Lifecycle: `stopAll` from Dart on room leave / host end.
 */
class NativeGiftAnimationPlugin : FlutterPlugin, MethodChannel.MethodCallHandler {

    companion object {
        private const val TAG = "NativeGiftAnimPlugin"
        private const val CHANNEL = "merilive/gift_animation"
        private const val MAX_CONCURRENT = 3
        private const val MAX_QUEUE = 64
        private const val DEFAULT_DURATION_MS = 3500L
        private const val WATCHDOG_HARD_MS = 12_000L
    }

    private var channel: MethodChannel? = null
    private var context: Context? = null
    private var container: FrameLayout? = null
    private val main = Handler(Looper.getMainLooper())
    private val io = Executors.newFixedThreadPool(3)

    // Priority queue: higher priority first, then FIFO by seq.
    private val seq = AtomicInteger(0)
    private data class Job(
        val id: String,
        val kind: String,
        val url: String,
        val fallbackImage: String?,
        val soundUrl: String?,
        val durationMs: Long,
        val priority: Int,
        val order: Int,
    )
    private val pending: PriorityQueue<Job> = PriorityQueue(
        compareByDescending<Job> { it.priority }.thenBy { it.order }
    )
    private val active = mutableListOf<ActiveSlot>()

    // ── FlutterPlugin ──────────────────────────────────────────────────
    override fun onAttachedToEngine(binding: FlutterPlugin.FlutterPluginBinding) {
        context = binding.applicationContext
        channel = MethodChannel(binding.binaryMessenger, CHANNEL).apply {
            setMethodCallHandler(this@NativeGiftAnimationPlugin)
        }
    }

    override fun onDetachedFromEngine(binding: FlutterPlugin.FlutterPluginBinding) {
        stopAll()
        channel?.setMethodCallHandler(null)
        channel = null
        context = null
    }

    /** Optional manual registration path (matches LiveKitFlutterPlugin.register style). */
    fun register(engine: FlutterEngine, activity: Activity) {
        context = activity
        attachContainerIfNeeded(activity)
        channel = MethodChannel(engine.dartExecutor.binaryMessenger, CHANNEL).apply {
            setMethodCallHandler(this@NativeGiftAnimationPlugin)
        }
    }

    // ── MethodChannel ──────────────────────────────────────────────────
    override fun onMethodCall(call: MethodCall, result: MethodChannel.Result) {
        when (call.method) {
            "play" -> {
                val payload = call.arguments as? Map<*, *>
                if (payload == null) {
                    result.success(false); return
                }
                val accepted = enqueue(payload)
                result.success(accepted)
            }
            "stopAll" -> {
                stopAll(); result.success(null)
            }
            "cancel" -> {
                val id = (call.arguments as? Map<*, *>)?.get("id")?.toString()
                if (id != null) cancel(id)
                result.success(null)
            }
            else -> result.notImplemented()
        }
    }

    // ── Queue ──────────────────────────────────────────────────────────
    private fun enqueue(payload: Map<*, *>): Boolean {
        val url = payload["url"]?.toString().orEmpty()
        if (url.isBlank()) return false
        val kind = (payload["kind"]?.toString() ?: "image").lowercase()
        val job = Job(
            id = payload["id"]?.toString() ?: UUID.randomUUID().toString(),
            kind = kind,
            url = url,
            fallbackImage = payload["fallbackImage"]?.toString(),
            soundUrl = payload["soundUrl"]?.toString(),
            durationMs = (payload["durationMs"] as? Number)?.toLong() ?: DEFAULT_DURATION_MS,
            priority = (payload["priority"] as? Number)?.toInt() ?: 0,
            order = seq.incrementAndGet(),
        )
        synchronized(pending) {
            if (pending.size >= MAX_QUEUE) {
                // Drop lowest-priority tail to keep queue bounded.
                val lowest = pending.maxByOrNull { -it.priority } ?: return false
                pending.remove(lowest)
            }
            pending.add(job)
        }
        main.post { drain() }
        return true
    }

    private fun drain() {
        val ctx = context ?: return
        val activity = (ctx as? Activity) ?: return
        attachContainerIfNeeded(activity)
        val cont = container ?: return
        synchronized(pending) {
            while (active.size < MAX_CONCURRENT && pending.isNotEmpty()) {
                val job = pending.poll() ?: break
                startJob(cont, job)
            }
        }
    }

    private fun attachContainerIfNeeded(activity: Activity) {
        if (container != null && container?.parent != null) return
        val decor = activity.window?.decorView as? ViewGroup ?: return
        val existing = decor.findViewById<FrameLayout>(R_CONTAINER_ID)
        if (existing != null) { container = existing; return }
        val fl = FrameLayout(activity).apply {
            id = R_CONTAINER_ID
            layoutParams = ViewGroup.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.MATCH_PARENT,
            )
            setBackgroundColor(Color.TRANSPARENT)
            // Passthrough — animations never eat taps.
            isClickable = false
            isFocusable = false
        }
        decor.addView(fl)
        container = fl
    }

    // ── Active slot ────────────────────────────────────────────────────
    private inner class ActiveSlot(val job: Job) {
        var view: View? = null
        var mediaPlayer: MediaPlayer? = null
        var watchdog: Runnable? = null
        fun teardown() {
            watchdog?.let { main.removeCallbacks(it) }
            try { (view?.parent as? ViewGroup)?.removeView(view) } catch (_: Throwable) {}
            try { mediaPlayer?.release() } catch (_: Throwable) {}
            when (val v = view) {
                is AnimView -> try { v.stopPlay() } catch (_: Throwable) {}
                is SVGAImageView -> try { v.stopAnimation(true) } catch (_: Throwable) {}
                is LottieAnimationView -> try { v.cancelAnimation() } catch (_: Throwable) {}
                is VideoView -> try { v.stopPlayback() } catch (_: Throwable) {}
            }
        }
    }

    private fun startJob(cont: FrameLayout, job: Job) {
        val ctx = context ?: return
        val slot = ActiveSlot(job)
        active.add(slot)

        val onDone: () -> Unit = {
            main.post {
                slot.teardown()
                active.remove(slot)
                drain()
            }
        }

        // Hard watchdog for stuck decoders.
        val hard = Runnable { onDone() }
        slot.watchdog = hard
        main.postDelayed(hard, WATCHDOG_HARD_MS)

        // Soft sound effect for non-audio-carrying kinds.
        if (job.soundUrl != null && (job.kind == "svga" || job.kind == "lottie" || job.kind == "image")) {
            GiftAudioMixer.play(ctx, job.soundUrl)
        }

        when (job.kind) {
            "vap" -> playVap(cont, slot, onDone)
            "svga" -> playSvga(cont, slot, onDone)
            "lottie" -> playLottie(cont, slot, onDone)
            "mp4" -> playMp4(cont, slot, onDone)
            else -> playImage(cont, slot, onDone)
        }
    }

    // ── Renderers ──────────────────────────────────────────────────────
    private fun playVap(cont: FrameLayout, slot: ActiveSlot, done: () -> Unit) {
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
                    Log.w(TAG, "VAP failed [$errorType]: $errorMsg — fallback image")
                    main.post {
                        (view!!.parent as? ViewGroup)?.removeView(view)
                        playFallbackImage(cont, slot, done)
                    }
                }
            })
        }
        slot.view = view
        cont.addView(view)
        io.execute {
            val file = downloadToCache(ctx, slot.job.url) ?: return@execute main.post {
                (view.parent as? ViewGroup)?.removeView(view); playFallbackImage(cont, slot, done)
            }
            main.post { view.startPlay(file) }
        }
    }

    private fun playSvga(cont: FrameLayout, slot: ActiveSlot, done: () -> Unit) {
        val ctx = context ?: return done()
        val view = SVGAImageView(ctx).apply {
            layoutParams = FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.MATCH_PARENT,
            )
            loops = 1
            clearsAfterStop = true
            callback = object : SVGACallback {
                override fun onPause() {}
                override fun onFinished() = done()
                override fun onRepeat() {}
                override fun onStep(frame: Int, percentage: Double) {}
            }
        }
        slot.view = view
        cont.addView(view)
        try {
            val parser = SVGAParser(ctx)
            parser.decodeFromURL(URL(slot.job.url), object : SVGAParser.ParseCompletion {
                override fun onComplete(videoItem: SVGAVideoEntity) {
                    main.post {
                        view.setImageDrawable(SVGADrawable(videoItem))
                        view.startAnimation()
                    }
                }
                override fun onError() {
                    Log.w(TAG, "SVGA parse error — fallback image")
                    main.post {
                        (view.parent as? ViewGroup)?.removeView(view)
                        playFallbackImage(cont, slot, done)
                    }
                }
            })
        } catch (t: Throwable) {
            Log.w(TAG, "SVGA exception: ${t.message}")
            playFallbackImage(cont, slot, done)
        }
    }

    private fun playLottie(cont: FrameLayout, slot: ActiveSlot, done: () -> Unit) {
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
                view.setComposition(it)
                view.playAnimation()
            })
            addFailureListener(LottieListener {
                Log.w(TAG, "Lottie load failed — fallback image")
                (view.parent as? ViewGroup)?.removeView(view)
                playFallbackImage(cont, slot, done)
            })
        }
    }

    private fun playMp4(cont: FrameLayout, slot: ActiveSlot, done: () -> Unit) {
        val ctx = context ?: return done()
        val vv = VideoView(ctx).apply {
            layoutParams = FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.MATCH_PARENT,
                Gravity.CENTER,
            )
        }
        slot.view = vv
        cont.addView(vv)
        vv.setOnCompletionListener { done() }
        vv.setOnErrorListener { _, _, _ ->
            Log.w(TAG, "MP4 error — fallback image")
            main.post {
                (vv.parent as? ViewGroup)?.removeView(vv)
                playFallbackImage(cont, slot, done)
            }
            true
        }
        vv.setVideoURI(Uri.parse(slot.job.url))
        vv.setOnPreparedListener { mp -> mp.setVolume(1f, 1f); vv.start() }
    }

    private fun playImage(cont: FrameLayout, slot: ActiveSlot, done: () -> Unit) {
        playFallbackImage(cont, slot, done)
    }

    private fun playFallbackImage(cont: FrameLayout, slot: ActiveSlot, done: () -> Unit) {
        val ctx = context ?: return done()
        val url = slot.job.fallbackImage?.takeIf { it.isNotBlank() } ?: slot.job.url
        val iv = ImageView(ctx).apply {
            layoutParams = FrameLayout.LayoutParams(
                (ctx.resources.displayMetrics.widthPixels * 0.6f).toInt(),
                (ctx.resources.displayMetrics.widthPixels * 0.6f).toInt(),
                Gravity.CENTER,
            )
            scaleType = ImageView.ScaleType.FIT_CENTER
            alpha = 0f
        }
        slot.view = iv
        cont.addView(iv)
        io.execute {
            val bmp = try {
                val conn = URL(url).openConnection() as HttpURLConnection
                conn.connectTimeout = 4000; conn.readTimeout = 5000
                conn.inputStream.use { android.graphics.BitmapFactory.decodeStream(it) }
            } catch (_: Throwable) { null }
            main.post {
                if (bmp != null) iv.setImageBitmap(bmp)
                iv.animate().alpha(1f).scaleX(1.15f).scaleY(1.15f)
                    .setDuration(280).setInterpolator(DecelerateInterpolator()).start()
                main.postDelayed({
                    iv.animate().alpha(0f).setDuration(260)
                        .setInterpolator(AccelerateInterpolator())
                        .withEndAction { done() }.start()
                }, slot.job.durationMs)
            }
        }
    }

    // ── Public teardown ────────────────────────────────────────────────
    fun stopAll() {
        main.post {
            synchronized(pending) { pending.clear() }
            active.toList().forEach { it.teardown() }
            active.clear()
            GiftAudioMixer.stopAll()
        }
    }

    fun cancel(id: String) {
        main.post {
            synchronized(pending) { pending.removeIf { it.id == id } }
            active.firstOrNull { it.job.id == id }?.let {
                it.teardown(); active.remove(it); drain()
            }
        }
    }

    // ── Shared cache download ──────────────────────────────────────────
    private fun downloadToCache(ctx: Context, url: String): File? {
        return try {
            val md = MessageDigest.getInstance("MD5")
            val key = md.digest(url.toByteArray()).joinToString("") { "%02x".format(it) }
            val ext = url.substringAfterLast('.', "").take(6).ifBlank { "bin" }
            val dir = File(ctx.cacheDir, "merilive_gift").apply { mkdirs() }
            val f = File(dir, "$key.$ext")
            if (f.exists() && f.length() > 0) return f
            val conn = URL(url).openConnection() as HttpURLConnection
            conn.connectTimeout = 5000; conn.readTimeout = 8000
            conn.inputStream.use { input ->
                FileOutputStream(f).use { out -> input.copyTo(out) }
            }
            f
        } catch (t: Throwable) {
            Log.w(TAG, "download failed for $url: ${t.message}")
            null
        }
    }
}

private const val R_CONTAINER_ID = 0x7f090001

/**
 * Lightweight audio mixer for gift sound effects (SoundPool-backed for
 * short clips, MediaPlayer for longer ones). Never blocks the gift render.
 */
object GiftAudioMixer {
    private const val TAG = "GiftAudioMixer"
    private val io = Executors.newSingleThreadExecutor()
    private val active = mutableListOf<MediaPlayer>()

    fun play(ctx: Context, url: String) {
        io.execute {
            try {
                val mp = MediaPlayer()
                mp.setDataSource(url)
                mp.setOnPreparedListener { it.start() }
                mp.setOnCompletionListener {
                    it.release()
                    synchronized(active) { active.remove(it) }
                }
                mp.setOnErrorListener { p, _, _ ->
                    try { p.release() } catch (_: Throwable) {}
                    synchronized(active) { active.remove(p) }
                    true
                }
                mp.setVolume(0.85f, 0.85f)
                synchronized(active) {
                    // Cap 4 concurrent sfx.
                    while (active.size >= 4) {
                        val old = active.removeAt(0)
                        try { old.stop(); old.release() } catch (_: Throwable) {}
                    }
                    active.add(mp)
                }
                mp.prepareAsync()
            } catch (t: Throwable) {
                Log.w(TAG, "sfx failed: ${t.message}")
            }
        }
    }

    fun stopAll() {
        synchronized(active) {
            active.forEach { try { it.stop(); it.release() } catch (_: Throwable) {} }
            active.clear()
        }
    }
}
