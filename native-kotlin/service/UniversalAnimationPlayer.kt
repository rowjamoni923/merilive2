package com.merilive.app.service

import android.view.View
import com.opensource.svgaplayer.SVGACallback
import com.opensource.svgaplayer.SVGADrawable
import com.opensource.svgaplayer.SVGADynamicEntity
import com.opensource.svgaplayer.SVGAImageView
import com.opensource.svgaplayer.SVGAParser
import com.opensource.svgaplayer.SVGAVideoEntity
import com.airbnb.lottie.LottieAnimationView
import java.net.URL

/**
 * UniversalAnimationPlayer — plays SVGA and Lottie animations
 * Used for gift effects, entrance effects, party decorations
 */
object UniversalAnimationPlayer {

    fun playSvga(view: SVGAImageView, url: String, loops: Int = 1, onComplete: (() -> Unit)? = null) {
        val parser = SVGAParser.shareParser()
        parser.decodeFromURL(URL(url), object : SVGAParser.ParseCompletion {
            override fun onComplete(videoItem: SVGAVideoEntity) {
                val drawable = SVGADrawable(videoItem, SVGADynamicEntity())
                view.setImageDrawable(drawable)
                view.loops = loops
                view.callback = object : SVGACallback {
                    override fun onPause() {}
                    override fun onFinished() {
                        onComplete?.invoke()
                        view.visibility = View.GONE
                    }
                    override fun onRepeat() {}
                    override fun onStep(frame: Int, percentage: Double) {}
                }
                view.visibility = View.VISIBLE
                view.startAnimation()
            }

            override fun onError() {
                view.visibility = View.GONE
            }
        })
    }

    fun playLottie(view: LottieAnimationView, url: String, loops: Int = 1, onComplete: (() -> Unit)? = null) {
        view.setAnimationFromUrl(url)
        view.repeatCount = loops - 1
        view.visibility = View.VISIBLE
        view.addAnimatorListener(object : android.animation.Animator.AnimatorListener {
            override fun onAnimationStart(animation: android.animation.Animator) {}
            override fun onAnimationEnd(animation: android.animation.Animator) {
                onComplete?.invoke()
                view.visibility = View.GONE
            }
            override fun onAnimationCancel(animation: android.animation.Animator) {}
            override fun onAnimationRepeat(animation: android.animation.Animator) {}
        })
        view.playAnimation()
    }

    fun playGiftAnimation(svgaView: SVGAImageView, lottieView: LottieAnimationView, animationUrl: String?, animationType: String?) {
        if (animationUrl.isNullOrBlank()) return

        when (animationType?.lowercase()) {
            "svga" -> playSvga(svgaView, animationUrl)
            "lottie" -> playLottie(lottieView, animationUrl)
            else -> {
                // Auto-detect by extension
                if (animationUrl.endsWith(".svga")) {
                    playSvga(svgaView, animationUrl)
                } else {
                    playLottie(lottieView, animationUrl)
                }
            }
        }
    }
}
