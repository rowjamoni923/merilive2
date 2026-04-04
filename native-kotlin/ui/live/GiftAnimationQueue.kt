package com.merilive.app.ui.live

import android.animation.AnimatorSet
import android.animation.ObjectAnimator
import android.os.Handler
import android.os.Looper
import android.view.View
import android.view.animation.OvershootInterpolator
import android.widget.FrameLayout
import android.widget.ImageView
import android.widget.TextView
import com.airbnb.lottie.LottieAnimationView
import com.merilive.app.service.UniversalAnimationPlayer
import com.opensource.svgaplayer.SVGAImageView
import java.util.LinkedList

/**
 * GiftAnimationQueue — prevents full-screen SVGA/Lottie overlaps
 * Supports combo tracking (X1 → X520) with scale-bounce feedback
 * 8-second safety timeout for large assets
 */
class GiftAnimationQueue(
    private val svgaView: SVGAImageView,
    private val lottieView: LottieAnimationView,
    private val bannerContainer: FrameLayout? = null,
) {
    private val queue = LinkedList<GiftAnimationItem>()
    private var isPlaying = false
    private val handler = Handler(Looper.getMainLooper())
    private val comboTracker = mutableMapOf<String, Int>() // giftId -> combo count
    private val SAFETY_TIMEOUT = 8000L

    data class GiftAnimationItem(
        val giftId: String,
        val giftName: String,
        val senderName: String,
        val animationUrl: String?,
        val animationType: String?,
        val iconUrl: String?,
        val quantity: Int = 1,
    )

    fun enqueue(item: GiftAnimationItem) {
        // Update combo tracker
        val comboKey = "${item.giftId}_${item.senderName}"
        val currentCombo = comboTracker.getOrDefault(comboKey, 0) + item.quantity
        comboTracker[comboKey] = currentCombo

        // Show flying banner immediately (banners can stack)
        showFlyingBanner(item, currentCombo)

        // Queue full-screen animation (no overlap)
        if (!item.animationUrl.isNullOrBlank()) {
            queue.add(item)
            if (!isPlaying) {
                playNext()
            }
        }
    }

    private fun playNext() {
        if (queue.isEmpty()) {
            isPlaying = false
            return
        }

        isPlaying = true
        val item = queue.poll() ?: return

        // Safety timeout — force next after 8 seconds
        handler.postDelayed({
            forceFinishCurrent()
        }, SAFETY_TIMEOUT)

        UniversalAnimationPlayer.playGiftAnimation(
            svgaView, lottieView,
            item.animationUrl, item.animationType
        )

        // Listen for completion via visibility change
        val checkCompletion = object : Runnable {
            var checks = 0
            override fun run() {
                checks++
                if (svgaView.visibility == View.GONE && lottieView.visibility == View.GONE) {
                    handler.removeCallbacksAndMessages(null)
                    playNext()
                } else if (checks < 80) { // Check for 8 seconds max
                    handler.postDelayed(this, 100)
                }
            }
        }
        handler.postDelayed(checkCompletion, 500)
    }

    private fun forceFinishCurrent() {
        svgaView.stopAnimation()
        svgaView.visibility = View.GONE
        lottieView.cancelAnimation()
        lottieView.visibility = View.GONE
        playNext()
    }

    private fun showFlyingBanner(item: GiftAnimationItem, comboCount: Int) {
        val container = bannerContainer ?: return
        val context = container.context

        // Create banner view programmatically
        val bannerView = android.widget.LinearLayout(context).apply {
            orientation = android.widget.LinearLayout.HORIZONTAL
            setPadding(24, 12, 24, 12)
            background = android.graphics.drawable.GradientDrawable().apply {
                cornerRadius = 40f
                setColor(android.graphics.Color.parseColor("#CC000000"))
            }
            elevation = 8f
            alpha = 0f
            translationX = -300f
        }

        val senderText = TextView(context).apply {
            text = item.senderName
            setTextColor(android.graphics.Color.WHITE)
            textSize = 13f
            maxLines = 1
        }

        val giftText = TextView(context).apply {
            text = " sent ${item.giftName}"
            setTextColor(android.graphics.Color.parseColor("#FFD700"))
            textSize = 13f
            maxLines = 1
        }

        val comboText = TextView(context).apply {
            text = " x$comboCount"
            setTextColor(android.graphics.Color.parseColor("#FF6B6B"))
            textSize = 16f
            setTypeface(null, android.graphics.Typeface.BOLD)
        }

        bannerView.addView(senderText)
        bannerView.addView(giftText)
        bannerView.addView(comboText)

        // Stack banners vertically
        val params = FrameLayout.LayoutParams(
            FrameLayout.LayoutParams.WRAP_CONTENT,
            FrameLayout.LayoutParams.WRAP_CONTENT
        ).apply {
            gravity = android.view.Gravity.START or android.view.Gravity.BOTTOM
            bottomMargin = 200 + (container.childCount * 60)
            leftMargin = 16
        }

        container.addView(bannerView, params)

        // Animate in with scale-bounce
        val slideIn = ObjectAnimator.ofFloat(bannerView, "translationX", -300f, 0f)
        val fadeIn = ObjectAnimator.ofFloat(bannerView, "alpha", 0f, 1f)
        val enterSet = AnimatorSet().apply {
            playTogether(slideIn, fadeIn)
            duration = 400
            interpolator = OvershootInterpolator(1.2f)
        }
        enterSet.start()

        // Combo bounce animation
        if (comboCount > 1) {
            val scaleX = ObjectAnimator.ofFloat(comboText, "scaleX", 1f, 1.5f, 1f)
            val scaleY = ObjectAnimator.ofFloat(comboText, "scaleY", 1f, 1.5f, 1f)
            AnimatorSet().apply {
                playTogether(scaleX, scaleY)
                duration = 300
                startDelay = 400
                interpolator = OvershootInterpolator(2f)
            }.start()
        }

        // Auto-remove after 3 seconds
        handler.postDelayed({
            val fadeOut = ObjectAnimator.ofFloat(bannerView, "alpha", 1f, 0f)
            val slideOut = ObjectAnimator.ofFloat(bannerView, "translationX", 0f, -300f)
            AnimatorSet().apply {
                playTogether(fadeOut, slideOut)
                duration = 300
            }.apply {
                addListener(object : android.animation.AnimatorListenerAdapter() {
                    override fun onAnimationEnd(animation: android.animation.Animator) {
                        container.removeView(bannerView)
                    }
                })
            }.start()
        }, 3000)
    }

    fun clearComboTracker() {
        comboTracker.clear()
    }

    fun release() {
        handler.removeCallbacksAndMessages(null)
        queue.clear()
        comboTracker.clear()
        isPlaying = false
    }
}
