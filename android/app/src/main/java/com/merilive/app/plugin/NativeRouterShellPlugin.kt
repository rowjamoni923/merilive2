package com.merilive.app.plugin

import android.graphics.Color
import android.graphics.drawable.GradientDrawable
import android.util.TypedValue
import android.view.Gravity
import android.view.View
import android.view.ViewGroup
import android.widget.FrameLayout
import android.widget.ImageView
import android.widget.LinearLayout
import android.widget.TextView
import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin
import org.json.JSONArray
import org.json.JSONObject

/**
 * Pkg434 NativeRouterShell — native bottom-tab bar + top app-bar overlay rendered above WebView.
 * Additive: WebView keeps rendering route content; this shell only owns the chrome.
 * Web continues to use React Router; native shell is OFF by default (see routerShellNativeFlag.ts).
 */
@CapacitorPlugin(name = "NativeRouterShell")
class NativeRouterShellPlugin : Plugin() {

    private var rootOverlay: FrameLayout? = null
    private var topBar: LinearLayout? = null
    private var bottomBar: LinearLayout? = null
    private var titleView: TextView? = null
    private var tabs: MutableList<JSONObject> = mutableListOf()
    private var activeTabId: String? = null
    private var tabViews: MutableMap<String, LinearLayout> = mutableMapOf()

    private fun dp(v: Int): Int =
        TypedValue.applyDimension(TypedValue.COMPLEX_UNIT_DIP, v.toFloat(), activity.resources.displayMetrics).toInt()

    private inline fun safe(call: PluginCall, block: () -> Unit) {
        try { block() } catch (t: Throwable) { call.reject(t.message ?: "router shell error") }
    }

    @PluginMethod
    fun open(call: PluginCall) = safe(call) {
        val title = call.getString("title") ?: ""
        val tabsArr = call.getArray("tabs") ?: JSONArray()
        val active = call.getString("activeTabId")
        activity.runOnUiThread {
            safe(call) {
                ensureOverlay()
                titleView?.text = title
                tabs.clear()
                for (i in 0 until tabsArr.length()) tabs.add(tabsArr.getJSONObject(i))
                activeTabId = active ?: tabs.firstOrNull()?.optString("id")
                rebuildTabs()
                rootOverlay?.visibility = View.VISIBLE
                call.resolve()
            }
        }
    }

    @PluginMethod
    fun close(call: PluginCall) = safe(call) {
        activity.runOnUiThread {
            safe(call) {
                rootOverlay?.visibility = View.GONE
                call.resolve()
            }
        }
    }

    @PluginMethod
    fun setTitle(call: PluginCall) = safe(call) {
        val title = call.getString("title") ?: ""
        activity.runOnUiThread {
            safe(call) {
                titleView?.text = title
                call.resolve()
            }
        }
    }

    @PluginMethod
    fun setActiveTab(call: PluginCall) = safe(call) {
        val id = call.getString("tabId") ?: return@safe call.reject("tabId required")
        activity.runOnUiThread {
            safe(call) {
                activeTabId = id
                paintTabs()
                call.resolve()
            }
        }
    }

    @PluginMethod
    fun setBadge(call: PluginCall) = safe(call) {
        val id = call.getString("tabId") ?: return@safe call.reject("tabId required")
        val count = call.getInt("count") ?: 0
        activity.runOnUiThread {
            safe(call) {
                val idx = tabs.indexOfFirst { it.optString("id") == id }
                if (idx >= 0) {
                    tabs[idx].put("badge", count)
                    rebuildTabs()
                }
                call.resolve()
            }
        }
    }

    @PluginMethod
    fun setTabs(call: PluginCall) = safe(call) {
        val tabsArr = call.getArray("tabs") ?: JSONArray()
        activity.runOnUiThread {
            safe(call) {
                tabs.clear()
                for (i in 0 until tabsArr.length()) tabs.add(tabsArr.getJSONObject(i))
                rebuildTabs()
                call.resolve()
            }
        }
    }

    private fun ensureOverlay() {
        if (rootOverlay != null) return
        val decor = activity.window.decorView as ViewGroup
        val root = FrameLayout(activity)
        root.layoutParams = FrameLayout.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT,
            ViewGroup.LayoutParams.MATCH_PARENT
        )
        root.setBackgroundColor(Color.TRANSPARENT)

        // Top bar
        val top = LinearLayout(activity).apply {
            orientation = LinearLayout.HORIZONTAL
            setBackgroundColor(Color.parseColor("#FFFFFF"))
            gravity = Gravity.CENTER_VERTICAL
            setPadding(dp(16), dp(12), dp(16), dp(12))
        }
        val topLp = FrameLayout.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT, dp(56)
        ).apply { gravity = Gravity.TOP }
        // status-bar inset
        top.setPadding(dp(16), dp(28), dp(16), dp(12))
        val title = TextView(activity).apply {
            textSize = 18f
            setTextColor(Color.parseColor("#111111"))
            setTypeface(typeface, android.graphics.Typeface.BOLD)
        }
        top.addView(title, LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f))
        root.addView(top, topLp)
        titleView = title
        topBar = top

        // Bottom bar
        val bottom = LinearLayout(activity).apply {
            orientation = LinearLayout.HORIZONTAL
            setBackgroundColor(Color.parseColor("#FFFFFF"))
            gravity = Gravity.CENTER_VERTICAL
            setPadding(0, dp(6), 0, dp(10))
        }
        val bottomLp = FrameLayout.LayoutParams(
            ViewGroup.LayoutParams.MATCH_PARENT, dp(64)
        ).apply { gravity = Gravity.BOTTOM }
        root.addView(bottom, bottomLp)
        bottomBar = bottom

        decor.addView(root)
        rootOverlay = root
    }

    private fun rebuildTabs() {
        val bar = bottomBar ?: return
        bar.removeAllViews()
        tabViews.clear()
        for (tab in tabs) {
            val id = tab.optString("id")
            val label = tab.optString("label")
            val badge = tab.optInt("badge", 0)
            val item = LinearLayout(activity).apply {
                orientation = LinearLayout.VERTICAL
                gravity = Gravity.CENTER
                isClickable = true
                setOnClickListener {
                    activeTabId = id
                    paintTabs()
                    val data = JSObject()
                    data.put("tabId", id)
                    notifyListeners("router:tab", data)
                }
            }
            val icon = ImageView(activity).apply {
                val sz = dp(22)
                layoutParams = LinearLayout.LayoutParams(sz, sz)
                val bg = GradientDrawable().apply {
                    shape = GradientDrawable.OVAL
                    setColor(Color.parseColor("#E5E7EB"))
                }
                background = bg
            }
            item.addView(icon)
            val txt = TextView(activity).apply {
                text = label
                textSize = 11f
                setPadding(0, dp(2), 0, 0)
            }
            item.addView(txt)
            if (badge > 0) {
                val b = TextView(activity).apply {
                    text = if (badge > 99) "99+" else badge.toString()
                    textSize = 8.5f
                    setTextColor(Color.WHITE)
                    setTypeface(null, android.graphics.Typeface.BOLD)
                    setPadding(dp(4), dp(0), dp(4), dp(0))
                    gravity = Gravity.CENTER
                    val bg = GradientDrawable().apply {
                        shape = GradientDrawable.RECTANGLE
                        cornerRadius = dp(10).toFloat()
                        setColor(Color.parseColor("#EF4444")) // Red-500 (standard)
                        setStroke(dp(1), Color.parseColor("#FFFFFF")) // Standard border
                    }
                    background = bg
                    minWidth = dp(16)
                    height = dp(16)
                }
                val blp = FrameLayout.LayoutParams(
                    ViewGroup.LayoutParams.WRAP_CONTENT,
                    ViewGroup.LayoutParams.WRAP_CONTENT
                ).apply {
                    gravity = Gravity.TOP or Gravity.CENTER_HORIZONTAL
                    marginStart = dp(10)
                    topMargin = dp(4)
                }
                
                // Wrap in FrameLayout to position badge over icon
                val frame = FrameLayout(activity)
                item.removeView(icon)
                frame.addView(icon)
                frame.addView(b, blp)
                item.addView(frame, 0)
            } else {
                // No badge, just keep icon as is
            }

            val lp = LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f)
            bar.addView(item, lp)
            tabViews[id] = item
        }
        paintTabs()
    }

    private fun paintTabs() {
        for ((id, view) in tabViews) {
            val active = id == activeTabId
            val color = if (active) Color.parseColor("#2563EB") else Color.parseColor("#6B7280")
            if (view.childCount >= 2) {
                (view.getChildAt(1) as? TextView)?.setTextColor(color)
                // Icon may be wrapped in a FrameLayout when a badge is present.
                val child0 = view.getChildAt(0)
                val iconView: ImageView? = child0 as? ImageView
                    ?: (child0 as? FrameLayout)?.getChildAt(0) as? ImageView
                (iconView?.background as? GradientDrawable)
                    ?.setColor(if (active) Color.parseColor("#2563EB") else Color.parseColor("#E5E7EB"))
            }
        }
    }

    override fun handleOnDestroy() {
        try {
            activity?.window?.decorView?.let { dv ->
                (dv as? ViewGroup)?.let { vg ->
                    rootOverlay?.let { vg.removeView(it) }
                }
            }
        } catch (_: Throwable) {}
        rootOverlay = null
        topBar = null
        bottomBar = null
        titleView = null
        tabViews.clear()
        tabs.clear()
        super.handleOnDestroy()
    }
}
