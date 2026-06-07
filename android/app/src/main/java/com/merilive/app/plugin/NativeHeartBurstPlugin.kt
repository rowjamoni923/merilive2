package com.merilive.app.plugin

import android.animation.AnimatorSet
import android.animation.ObjectAnimator
import android.graphics.Color
import android.graphics.PixelFormat
import android.os.Build
import android.util.TypedValue
import android.view.Gravity
import android.view.View
import android.view.WindowManager
import android.view.animation.AccelerateInterpolator
import android.view.animation.DecelerateInterpolator
import android.widget.FrameLayout
import android.widget.TextView
import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin
import java.util.ArrayDeque
import java.util.concurrent.CopyOnWriteArrayList
import kotlin.math.max
import kotlin.random.Random

/**
 * Pkg438 Phase C — NativeHeartBurst overlay.
 *
 * Spawns animated heart Views at a touch point above the WebView for
 * the Reels double-tap like gesture. Uses a windowManager TYPE_APPLICATION
 * overlay so it survives WebView re-layout and lives outside the bridge
 * view hierarchy — zero conflict with NativeGiftAnimation or ExoPlayer
 * surfaces.
 *
 * Pure decoration: no Supabase writes, no JS state mutation. The React
 * `handleLike` call is independent and stays in Reels.tsx.
 */
@CapacitorPlugin(name = "NativeHeartBurst")
class NativeHeartBurstPlugin : Plugin() {

    private var overlay: FrameLayout? = null
    private val pool = ArrayDeque<TextView>()
    private val MAX_POOL = 16
    private val HEART_GLYPHS = arrayOf("❤", "♥", "💖", "💕", "💘")
    private val activeAnimators = CopyOnWriteArrayList<AnimatorSet>()

    @PluginMethod
    fun isAvailable(call: PluginCall) {
        val ret = JSObject()
        ret.put("available", true)
        call.resolve(ret)
    }

    @PluginMethod
    fun burst(call: PluginCall) {
        val x = call.getFloat("x") ?: -1f
        val y = call.getFloat("y") ?: -1f
        val count = (call.getInt("count") ?: 6).coerceIn(1, 12)
        val sizeDp = (call.getInt("size") ?: 64).coerceIn(24, 160)

        activity?.runOnUiThread {
            try {
                ensureOverlay()
                val o = overlay ?: return@runOnUiThread
                val cx = if (x < 0) o.width / 2f else x
                val cy = if (y < 0) o.height / 2f else y
                repeat(count) { i -> spawnHeart(cx, cy, sizeDp, i) }
                val ret = JSObject(); ret.put("ok", true); call.resolve(ret)
            } catch (t: Throwable) {
                call.reject("burst failed: ${t.message}")
            }
        }
    }

    @PluginMethod
    fun clear(call: PluginCall) {
        activity?.runOnUiThread {
            overlay?.removeAllViews()
            pool.clear()
            call.resolve()
        }
    }

    private fun ensureOverlay() {
        if (overlay != null && overlay?.isAttachedToWindow == true) return
        val act = activity ?: return
        val o = FrameLayout(act).apply {
            setBackgroundColor(Color.TRANSPARENT)
            // Pass touches through to the underlying WebView / ExoPlayer.
            isClickable = false
            isFocusable = false
        }
        val lp = WindowManager.LayoutParams(
            WindowManager.LayoutParams.MATCH_PARENT,
            WindowManager.LayoutParams.MATCH_PARENT,
            WindowManager.LayoutParams.TYPE_APPLICATION,
            WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE or
                WindowManager.LayoutParams.FLAG_NOT_TOUCHABLE or
                WindowManager.LayoutParams.FLAG_LAYOUT_NO_LIMITS,
            PixelFormat.TRANSLUCENT
        ).apply {
            gravity = Gravity.TOP or Gravity.START
            // sit just above the WebView; below status bar dialogs
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                @Suppress("DEPRECATION")
            }
        }
        try {
            val wm = act.windowManager
            wm.addView(o, lp)
            overlay = o
        } catch (_: Throwable) {
            overlay = null
        }
    }

    private fun acquireHeart(): TextView? {
        val act = activity ?: return null
        val tv = pool.pollFirst() ?: TextView(act).apply {
            includeFontPadding = false
            setTextColor(Color.parseColor("#FF3B6B"))
            text = HEART_GLYPHS[0]
        }
        return tv
    }

    private fun spawnHeart(cx: Float, cy: Float, sizeDp: Int, index: Int) {
        val o = overlay ?: return
        val act = activity ?: return
        val density = act.resources.displayMetrics.density
        val sizePx = sizeDp * density
        val tv = (acquireHeart() ?: return).apply {
            text = HEART_GLYPHS[Random.nextInt(HEART_GLYPHS.size)]
            setTextSize(TypedValue.COMPLEX_UNIT_PX, sizePx)
            alpha = 0f
            scaleX = 0.3f
            scaleY = 0.3f
        }
        val lp = FrameLayout.LayoutParams(
            FrameLayout.LayoutParams.WRAP_CONTENT,
            FrameLayout.LayoutParams.WRAP_CONTENT
        )
        o.addView(tv, lp)
        // place centered on tap point after measure
        tv.post {
            tv.translationX = cx - tv.width / 2f + (Random.nextFloat() - 0.5f) * sizePx * 0.6f
            tv.translationY = cy - tv.height / 2f
            startHeartAnimation(tv, sizePx)
        }
    }

    private fun startHeartAnimation(tv: TextView, sizePx: Float) {
        val drift = (Random.nextFloat() - 0.5f) * sizePx * 1.4f
        val rise = -sizePx * 2.6f - Random.nextFloat() * sizePx
        val rot = (Random.nextFloat() - 0.5f) * 40f
        val durIn = 220L
        val durOut = 620L

        val popIn = AnimatorSet().apply {
            playTogether(
                ObjectAnimator.ofFloat(tv, View.SCALE_X, 0.3f, 1.25f, 1.0f),
                ObjectAnimator.ofFloat(tv, View.SCALE_Y, 0.3f, 1.25f, 1.0f),
                ObjectAnimator.ofFloat(tv, View.ALPHA, 0f, 1f),
            )
            duration = durIn
            interpolator = DecelerateInterpolator()
        }
        val rise2 = AnimatorSet().apply {
            playTogether(
                ObjectAnimator.ofFloat(tv, View.TRANSLATION_X, tv.translationX, tv.translationX + drift),
                ObjectAnimator.ofFloat(tv, View.TRANSLATION_Y, tv.translationY, tv.translationY + rise),
                ObjectAnimator.ofFloat(tv, View.ROTATION, 0f, rot),
                ObjectAnimator.ofFloat(tv, View.ALPHA, 1f, 0f),
                ObjectAnimator.ofFloat(tv, View.SCALE_X, 1f, 0.7f),
                ObjectAnimator.ofFloat(tv, View.SCALE_Y, 1f, 0.7f),
            )
            duration = durOut
            interpolator = AccelerateInterpolator(1.2f)
        }
        val set = AnimatorSet().apply { playSequentially(popIn, rise2) }
        set.addListener(object : android.animation.AnimatorListenerAdapter() {
            override fun onAnimationEnd(animation: android.animation.Animator) {
                try {
                    overlay?.removeView(tv)
                    if (pool.size < MAX_POOL) pool.addLast(tv)
                } catch (_: Throwable) {}
                activeAnimators.remove(set)
            }
            override fun onAnimationCancel(animation: android.animation.Animator) {
                activeAnimators.remove(set)
            }
        })
        activeAnimators.add(set)
        set.start()
    }

    private fun cancelAllAnimators() {
        for (s in activeAnimators.toList()) {
            try { s.cancel() } catch (_: Throwable) {}
        }
        activeAnimators.clear()
    }

    override fun handleOnPause() {
        super.handleOnPause()
        try { cancelAllAnimators() } catch (_: Throwable) {}
        try { overlay?.removeAllViews() } catch (_: Throwable) {}
    }

    override fun handleOnDestroy() {
        try { cancelAllAnimators() } catch (_: Throwable) {}
        try {
            overlay?.let { activity?.windowManager?.removeViewImmediate(it) }
        } catch (_: Throwable) {}
        overlay = null
        pool.clear()
        super.handleOnDestroy()
    }
}
