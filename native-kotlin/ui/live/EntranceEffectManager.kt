package com.merilive.app.ui.live

import android.animation.AnimatorSet
import android.animation.ObjectAnimator
import android.view.View
import android.view.animation.OvershootInterpolator
import android.widget.FrameLayout
import android.widget.ImageView
import android.widget.TextView
import coil.load
import com.merilive.app.service.UniversalAnimationPlayer
import com.opensource.svgaplayer.SVGAImageView
import com.airbnb.lottie.LottieAnimationView

/**
 * EntranceEffectManager — shows entrance animation when a user enters a live room
 * Supports SVGA entrance effects and a flying banner with user info
 */
object EntranceEffectManager {

    fun showEntrance(
        container: FrameLayout,
        svgaView: SVGAImageView,
        lottieView: LottieAnimationView,
        userName: String,
        userLevel: Int,
        entranceEffectUrl: String?,
        entranceEffectType: String? = null,
    ) {
        // Play full-screen entrance animation if user has one
        if (!entranceEffectUrl.isNullOrBlank()) {
            UniversalAnimationPlayer.playGiftAnimation(
                svgaView, lottieView,
                entranceEffectUrl, entranceEffectType
            )
        }

        // Always show flying entrance banner
        showEntranceBanner(container, userName, userLevel)
    }

    private fun showEntranceBanner(container: FrameLayout, userName: String, level: Int) {
        val context = container.context

        val bannerView = android.widget.LinearLayout(context).apply {
            orientation = android.widget.LinearLayout.HORIZONTAL
            setPadding(20, 10, 20, 10)
            background = android.graphics.drawable.GradientDrawable().apply {
                cornerRadius = 30f
                val colors = intArrayOf(
                    android.graphics.Color.parseColor("#CC6366F1"),
                    android.graphics.Color.parseColor("#CCA855F7"),
                )
                orientation = android.graphics.drawable.GradientDrawable.Orientation.LEFT_RIGHT
                setColors(colors)
            }
            elevation = 6f
            alpha = 0f
            translationX = -400f
        }

        val levelBadge = TextView(context).apply {
            text = "Lv.$level"
            setTextColor(android.graphics.Color.parseColor("#FFD700"))
            textSize = 11f
            setTypeface(null, android.graphics.Typeface.BOLD)
        }

        val nameText = TextView(context).apply {
            text = " $userName entered the room"
            setTextColor(android.graphics.Color.WHITE)
            textSize = 12f
            maxLines = 1
        }

        bannerView.addView(levelBadge)
        bannerView.addView(nameText)

        val params = FrameLayout.LayoutParams(
            FrameLayout.LayoutParams.WRAP_CONTENT,
            FrameLayout.LayoutParams.WRAP_CONTENT
        ).apply {
            gravity = android.view.Gravity.START or android.view.Gravity.CENTER_VERTICAL
            leftMargin = 16
        }

        container.addView(bannerView, params)

        // Entrance animation: slide + fade + overshoot
        val slideIn = ObjectAnimator.ofFloat(bannerView, "translationX", -400f, 0f)
        val fadeIn = ObjectAnimator.ofFloat(bannerView, "alpha", 0f, 1f)
        AnimatorSet().apply {
            playTogether(slideIn, fadeIn)
            duration = 500
            interpolator = OvershootInterpolator(1.3f)
        }.start()

        // Auto-remove after 2.5 seconds
        bannerView.postDelayed({
            val fadeOut = ObjectAnimator.ofFloat(bannerView, "alpha", 1f, 0f)
            val slideOut = ObjectAnimator.ofFloat(bannerView, "translationX", 0f, 400f)
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
        }, 2500)
    }
}
