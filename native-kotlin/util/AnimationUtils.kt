package com.merilive.app.util

import android.view.View
import android.view.animation.AccelerateDecelerateInterpolator
import android.view.animation.OvershootInterpolator

/**
 * Common animation extensions for views
 */
object AnimationUtils {

    fun View.fadeIn(duration: Long = 300) {
        alpha = 0f
        visibility = View.VISIBLE
        animate()
            .alpha(1f)
            .setDuration(duration)
            .setInterpolator(AccelerateDecelerateInterpolator())
            .start()
    }

    fun View.fadeOut(duration: Long = 300, gone: Boolean = true) {
        animate()
            .alpha(0f)
            .setDuration(duration)
            .withEndAction {
                visibility = if (gone) View.GONE else View.INVISIBLE
            }
            .start()
    }

    fun View.scaleIn(duration: Long = 400) {
        scaleX = 0f
        scaleY = 0f
        visibility = View.VISIBLE
        animate()
            .scaleX(1f)
            .scaleY(1f)
            .setDuration(duration)
            .setInterpolator(OvershootInterpolator())
            .start()
    }

    fun View.slideUp(duration: Long = 300) {
        translationY = height.toFloat()
        visibility = View.VISIBLE
        animate()
            .translationY(0f)
            .setDuration(duration)
            .setInterpolator(AccelerateDecelerateInterpolator())
            .start()
    }

    fun View.slideDown(duration: Long = 300) {
        animate()
            .translationY(height.toFloat())
            .setDuration(duration)
            .withEndAction { visibility = View.GONE }
            .start()
    }

    fun View.pulse(scale: Float = 1.1f, duration: Long = 200) {
        animate()
            .scaleX(scale)
            .scaleY(scale)
            .setDuration(duration)
            .withEndAction {
                animate()
                    .scaleX(1f)
                    .scaleY(1f)
                    .setDuration(duration)
                    .start()
            }
            .start()
    }

    fun View.shake(offset: Float = 10f, duration: Long = 50, times: Int = 4) {
        var currentAnim = animate()
        for (i in 0 until times) {
            val dx = if (i % 2 == 0) offset else -offset
            currentAnim = currentAnim
                .translationX(dx)
                .setDuration(duration)
        }
        currentAnim.translationX(0f).setDuration(duration).start()
    }
}