package com.merilive.app

import android.content.Intent
import android.os.Bundle
import android.view.WindowManager
import androidx.appcompat.app.AppCompatActivity
import androidx.navigation.fragment.NavHostFragment
import androidx.navigation.ui.setupWithNavController
import com.merilive.app.databinding.ActivityMainBinding
import dagger.hilt.android.AndroidEntryPoint

/**
 * MainActivity — Native host for the bottom-nav + NavHostFragment.
 *
 * Pure native (NOT Capacitor). Launched from SplashActivity after auth check.
 * Handles cold-start notification routes (chat / call / live / generic deep link).
 */
@AndroidEntryPoint
class MainActivity : AppCompatActivity() {

    private lateinit var binding: ActivityMainBinding

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        binding = ActivityMainBinding.inflate(layoutInflater)
        setContentView(binding.root)

        // Screen security — block screenshot & recording
        window.setFlags(
            WindowManager.LayoutParams.FLAG_SECURE,
            WindowManager.LayoutParams.FLAG_SECURE
        )

        // Wire bottom nav <-> nav graph
        val navHost = supportFragmentManager
            .findFragmentById(R.id.nav_host_fragment) as NavHostFragment
        binding.bottomNav.setupWithNavController(navHost.navController)

        // Handle notification route on cold start
        handleNotificationRoute(intent, navHost)
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        val navHost = supportFragmentManager
            .findFragmentById(R.id.nav_host_fragment) as? NavHostFragment ?: return
        handleNotificationRoute(intent, navHost)
    }

    private fun handleNotificationRoute(intent: Intent?, navHost: NavHostFragment) {
        if (intent == null) return
        val route = intent.getStringExtra("route")
            ?: intent.getStringExtra("navigate_to")
            ?: intent.getStringExtra("link_url")

        // External http(s) link — open in browser
        if (route?.startsWith("http") == true) {
            startActivity(Intent(Intent.ACTION_VIEW, android.net.Uri.parse(route)))
            intent.removeExtra("link_url")
            return
        }

        // Map common notification payload routes -> nav destinations.
        // Unknown routes are ignored (no crash) — keep this conservative.
        when {
            route.isNullOrEmpty() -> Unit
            route.startsWith("/chat") -> Unit  // TODO: navigate to chatFragment with args
            route.startsWith("/live") -> Unit  // TODO: navigate to liveStreamFragment
            route.startsWith("/call") -> Unit  // TODO: navigate to call detail
        }
        intent.removeExtra("route")
        intent.removeExtra("navigate_to")
    }
}
