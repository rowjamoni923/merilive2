package com.merilive.app.plugin

import android.graphics.Color
import android.view.Gravity
import android.view.View
import android.widget.TextView
import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin
import com.google.android.material.snackbar.Snackbar

/**
 * Pkg438 — Native Android Toast/Snackbar replacement.
 *
 * Replaces Sonner (Web) toasts with native Material Snackbar for a professional Android feel.
 * Supports "info", "success", "error", and "warning" types.
 */
@CapacitorPlugin(name = "NativeToast")
class NativeToastPlugin : Plugin() {

    @PluginMethod
    fun show(call: PluginCall) {
        val text = call.getString("text") ?: return call.reject("text required")
        val duration = call.getInt("duration", 3000) ?: 3000
        val type = call.getString("type", "info") ?: "info"

        activity.runOnUiThread {
            val root = activity.findViewById<View>(android.R.id.content)
            val snackbar = Snackbar.make(root, text, duration)
            
            // Premium Styling based on type
            val bgColor = when (type) {
                "success" -> Color.parseColor("#10B981") // Emerald-500
                "error" -> Color.parseColor("#EF4444")   // Red-500
                "warning" -> Color.parseColor("#F59E0B") // Amber-500
                else -> Color.parseColor("#1E1B2E")      // Deep Dark (Theme color)
            }
            
            snackbar.setBackgroundTint(bgColor)
            snackbar.setTextColor(Color.WHITE)
            
            // Round corners and margins for "Floating" feel like high-end apps
            val snackView = snackbar.view
            val params = snackView.layoutParams as android.widget.FrameLayout.LayoutParams
            params.setMargins(dp(16), 0, dp(16), dp(80)) // Above bottom nav
            snackView.layoutParams = params
            snackView.background = android.graphics.drawable.GradientDrawable().apply {
                setColor(bgColor)
                cornerRadius = dp(12).toFloat()
            }
            
            snackbar.show()
            call.resolve()
        }
    }

    private fun dp(v: Int): Int = (v * activity.resources.displayMetrics.density).toInt()
}
