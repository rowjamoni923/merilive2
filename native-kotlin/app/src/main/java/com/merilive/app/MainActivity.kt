package com.merilive.app

import android.content.Intent
import android.os.Bundle
import android.view.WindowManager
import androidx.activity.OnBackPressedCallback
import com.getcapacitor.BridgeActivity
import io.capawesome.capacitorjs.plugins.firebase.authentication.FirebaseAuthenticationPlugin

/**
 * MainActivity — Exact Kotlin translation of the original working Java code.
 *
 * CRITICAL RULES:
 * 1. Register plugins BEFORE super.onCreate()
 * 2. Do NOT override WebChromeClient — Capacitor handles onPermissionRequest internally
 * 3. Back button delegates to WebView history
 * 4. Notification routes handled via intent extras
 */
class MainActivity : BridgeActivity() {

    override fun onCreate(savedInstanceState: Bundle?) {
        // Register Plugins BEFORE super.onCreate()
        registerPlugin(FirebaseAuthenticationPlugin::class.java)
        registerPlugin(PlayStoreBillingPlugin::class.java)

        super.onCreate(savedInstanceState)

        // 🔒 Screen Security - Block Screenshot & Recording
        window.setFlags(
            WindowManager.LayoutParams.FLAG_SECURE,
            WindowManager.LayoutParams.FLAG_SECURE
        )

        // ◀️ Back Button - Delegate to Capacitor WebView
        onBackPressedDispatcher.addCallback(this, object : OnBackPressedCallback(true) {
            override fun handleOnBackPressed() {
                val webView = bridge?.webView
                if (webView != null && webView.canGoBack()) {
                    webView.goBack()
                } else {
                    isEnabled = false
                    onBackPressedDispatcher.onBackPressed()
                    isEnabled = true
                }
            }
        })

        // Handle notification route on cold start
        handleNotificationRoute(intent)
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        handleNotificationRoute(intent)
    }

    private fun handleNotificationRoute(intent: Intent?) {
        if (intent == null) return

        val linkUrl = intent.getStringExtra("link_url")
        val route = intent.getStringExtra("route")
        val navigateTo = intent.getStringExtra("navigate_to")

        when {
            !linkUrl.isNullOrEmpty() -> {
                if (linkUrl.startsWith("http")) {
                    val browserIntent = Intent(Intent.ACTION_VIEW, android.net.Uri.parse(linkUrl))
                    startActivity(browserIntent)
                } else {
                    navigateWebView(linkUrl)
                }
                intent.removeExtra("link_url")
            }
            !route.isNullOrEmpty() -> {
                navigateWebView(route)
                intent.removeExtra("route")
            }
            !navigateTo.isNullOrEmpty() -> {
                navigateWebView(navigateTo)
                intent.removeExtra("navigate_to")
            }
            intent.getBooleanExtra("open_call", false) -> {
                val callId = intent.getStringExtra("call_id")
                val callerId = intent.getStringExtra("caller_id")
                val callType = intent.getStringExtra("call_type") ?: "video"
                navigateWebView("/call/$callId?caller=$callerId&type=$callType")
                intent.removeExtra("open_call")
            }
        }
    }

    private fun navigateWebView(path: String) {
        val webView = bridge?.webView ?: return
        val baseUrl = bridge?.serverUrl ?: return
        webView.loadUrl(baseUrl + path)
    }
}
