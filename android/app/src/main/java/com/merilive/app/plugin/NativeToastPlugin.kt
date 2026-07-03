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
        try {
            val text = call.getString("text") ?: return call.reject("text required")
            val duration = call.getInt("duration", 3000) ?: 3000
            val type = call.getString("type", "info") ?: "info"

            activity.runOnUiThread {
                try {
                    val root = activity.findViewById<View>(android.R.id.content)
                    val snackbar = Snackbar.make(root, text, duration)
                    val bgColor = when (type) {
                        "success" -> Color.parseColor("#10B981")
                        "error" -> Color.parseColor("#EF4444")
                        "warning" -> Color.parseColor("#F59E0B")
                        else -> Color.parseColor("#1E1B2E")
                    }
                    snackbar.setBackgroundTint(bgColor)
                    snackbar.setTextColor(Color.WHITE)
                    val snackView = snackbar.view
                    (snackView.layoutParams as? android.widget.FrameLayout.LayoutParams)?.let { params ->
                        params.setMargins(dp(16), 0, dp(16), dp(80))
                        snackView.layoutParams = params
                    }
                    snackView.background = android.graphics.drawable.GradientDrawable().apply {
                        setColor(bgColor)
                        cornerRadius = dp(12).toFloat()
                    }
                    snackbar.show()
                    call.resolve()
                } catch (t: Throwable) {
                    call.reject(t.message ?: "show failed")
                }
            }
        } catch (t: Throwable) {
            call.reject(t.message ?: "show failed")
        }
    }

    private fun dp(v: Int): Int = (v * activity.resources.displayMetrics.density).toInt()
}
