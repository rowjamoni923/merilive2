package com.merilive.app.ui.splash

import android.animation.AnimatorSet
import android.animation.ObjectAnimator
import android.content.Intent
import android.os.Bundle
import android.view.animation.OvershootInterpolator
import androidx.appcompat.app.AppCompatActivity
import androidx.core.splashscreen.SplashScreen.Companion.installSplashScreen
import androidx.lifecycle.lifecycleScope
import com.merilive.app.MainActivity
import com.merilive.app.databinding.ActivitySplashBinding
import com.merilive.app.ui.auth.AuthActivity
import dagger.hilt.android.AndroidEntryPoint
import io.github.jan.supabase.auth.Auth
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import javax.inject.Inject

@AndroidEntryPoint
class SplashActivity : AppCompatActivity() {

    @Inject lateinit var auth: Auth
    private lateinit var binding: ActivitySplashBinding

    override fun onCreate(savedInstanceState: Bundle?) {
        installSplashScreen()
        super.onCreate(savedInstanceState)
        binding = ActivitySplashBinding.inflate(layoutInflater)
        setContentView(binding.root)

        // Multi-phase animation
        playLogoAnimation()

        lifecycleScope.launch {
            delay(2500) // Animation duration
            checkSessionAndNavigate()
        }
    }

    private fun playLogoAnimation() {
        val scaleX = ObjectAnimator.ofFloat(binding.ivLogo, "scaleX", 0f, 1.2f, 1f).apply {
            duration = 800
            interpolator = OvershootInterpolator(2f)
        }
        val scaleY = ObjectAnimator.ofFloat(binding.ivLogo, "scaleY", 0f, 1.2f, 1f).apply {
            duration = 800
            interpolator = OvershootInterpolator(2f)
        }
        val alpha = ObjectAnimator.ofFloat(binding.ivLogo, "alpha", 0f, 1f).apply {
            duration = 600
        }
        val textAlpha = ObjectAnimator.ofFloat(binding.tvAppName, "alpha", 0f, 1f).apply {
            startDelay = 500
            duration = 600
        }
        val taglineAlpha = ObjectAnimator.ofFloat(binding.tvTagline, "alpha", 0f, 1f).apply {
            startDelay = 800
            duration = 600
        }

        AnimatorSet().apply {
            playTogether(scaleX, scaleY, alpha, textAlpha, taglineAlpha)
            start()
        }
    }

    private fun checkSessionAndNavigate() {
        val session = auth.currentSessionOrNull()
        val intent = if (session != null) {
            Intent(this, MainActivity::class.java)
        } else {
            Intent(this, AuthActivity::class.java)
        }
        startActivity(intent)
        finish()
        overridePendingTransition(android.R.anim.fade_in, android.R.anim.fade_out)
    }
}
