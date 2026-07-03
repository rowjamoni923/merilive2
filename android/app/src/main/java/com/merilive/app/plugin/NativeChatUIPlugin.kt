package com.merilive.app.plugin

import android.graphics.Color
import android.graphics.Typeface
import android.text.format.DateUtils
import android.util.TypedValue
import android.view.Gravity
import android.view.View
import android.view.ViewGroup
import android.view.WindowManager
import android.widget.FrameLayout
import android.widget.LinearLayout
import android.widget.TextView
import androidx.recyclerview.widget.LinearLayoutManager
import androidx.recyclerview.widget.RecyclerView
import com.getcapacitor.JSArray
import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin
import org.json.JSONObject

/**
 * Pkg432 — NativeChatUIPlugin
 *
 * Lightweight native RecyclerView overlay for chat threads. Renders 1000+
 * messages at 60fps without WebView jank. Additive — JS opens it on demand,
 * sends batches via `setMessages` / `appendMessages`, listens to
 * `chatui:send`, `chatui:loadMore`, `chatui:tap` events. Existing Chat.tsx
 * keeps working when plugin is closed or feature flag is off.
 *
 * Default OFF. Gated by chatUINativeFlag on the JS side.
 */
@CapacitorPlugin(name = "NativeChatUI")
class NativeChatUIPlugin : Plugin() {

    private var overlay: FrameLayout? = null
    private var recycler: RecyclerView? = null
    private val items = mutableListOf<ChatItem>()
    private val adapter = ChatAdapter(items) { item ->
        val data = JSObject().apply {
            put("id", item.id)
            put("type", "tap")
        }
        notifyListeners("chatui:tap", data)
    }
    private var currentUserId: String? = null

    data class ChatItem(
        val id: String,
        val senderId: String,
        val senderName: String,
        val text: String,
        val createdAt: Long,
        val avatarUrl: String?,
        val isMine: Boolean
    )

    private inline fun safe(call: PluginCall, block: () -> Unit) {
        try { block() } catch (t: Throwable) { call.reject(t.message ?: "chat-ui error") }
    }

    @PluginMethod
    fun open(call: PluginCall) = safe(call) {
        currentUserId = call.getString("currentUserId")
        val title = call.getString("title", "Chat") ?: "Chat"
        activity.runOnUiThread {
            safe(call) {
                ensureOverlay(title)
                overlay?.visibility = View.VISIBLE
                call.resolve()
            }
        }
    }

    @PluginMethod
    fun close(call: PluginCall) = safe(call) {
        activity.runOnUiThread {
            safe(call) {
                overlay?.visibility = View.GONE
                call.resolve()
            }
        }
    }

    @PluginMethod
    fun setMessages(call: PluginCall) = safe(call) {
        val arr: JSArray = call.getArray("messages") ?: JSArray()
        val parsed = parseItems(arr)
        activity.runOnUiThread {
            safe(call) {
                items.clear()
                items.addAll(parsed)
                adapter.notifyDataSetChanged()
                recycler?.scrollToPosition(items.size - 1)
                call.resolve()
            }
        }
    }

    @PluginMethod
    fun appendMessages(call: PluginCall) = safe(call) {
        val arr: JSArray = call.getArray("messages") ?: JSArray()
        val parsed = parseItems(arr)
        val stickBottom = call.getBoolean("stickBottom", true) ?: true
        activity.runOnUiThread {
            safe(call) {
                val start = items.size
                items.addAll(parsed)
                adapter.notifyItemRangeInserted(start, parsed.size)
                if (stickBottom) recycler?.smoothScrollToPosition(items.size - 1)
                call.resolve()
            }
        }
    }

    @PluginMethod
    fun prependMessages(call: PluginCall) = safe(call) {
        val arr: JSArray = call.getArray("messages") ?: JSArray()
        val parsed = parseItems(arr)
        activity.runOnUiThread {
            safe(call) {
                items.addAll(0, parsed)
                adapter.notifyItemRangeInserted(0, parsed.size)
                call.resolve()
            }
        }
    }

    @PluginMethod
    fun clear(call: PluginCall) = safe(call) {
        activity.runOnUiThread {
            safe(call) {
                val n = items.size
                items.clear()
                adapter.notifyItemRangeRemoved(0, n)
                call.resolve()
            }
        }
    }

    override fun handleOnDestroy() {
        try {
            activity?.window?.decorView?.let { dv ->
                (dv as? ViewGroup)?.let { vg ->
                    overlay?.let { vg.removeView(it) }
                }
            }
        } catch (_: Throwable) {}
        try { recycler?.adapter = null } catch (_: Throwable) {}
        overlay = null
        recycler = null
        items.clear()
        super.handleOnDestroy()
    }

    private fun parseItems(arr: JSArray): List<ChatItem> {
        val out = mutableListOf<ChatItem>()
        for (i in 0 until arr.length()) {
            val o = arr.optJSONObject(i) ?: continue
            val senderId = o.optString("senderId", "")
            out.add(
                ChatItem(
                    id = o.optString("id", "msg_$i"),
                    senderId = senderId,
                    senderName = o.optString("senderName", ""),
                    text = o.optString("text", ""),
                    createdAt = o.optLong("createdAt", System.currentTimeMillis()),
                    avatarUrl = if (o.has("avatarUrl")) o.optString("avatarUrl", null) else null,
                    isMine = currentUserId != null && senderId == currentUserId
                )
            )
        }
        return out
    }

    private fun ensureOverlay(title: String) {
        if (overlay != null) return
        val ctx = activity
        val root = FrameLayout(ctx).apply {
            setBackgroundColor(Color.parseColor("#0F172A"))
            layoutParams = WindowManager.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.MATCH_PARENT
            )
        }
        val column = LinearLayout(ctx).apply {
            orientation = LinearLayout.VERTICAL
            layoutParams = FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.MATCH_PARENT
            )
        }
        val header = TextView(ctx).apply {
            text = title
            setTextColor(Color.WHITE)
            setTextSize(TypedValue.COMPLEX_UNIT_SP, 18f)
            typeface = Typeface.DEFAULT_BOLD
            setPadding(dp(16), dp(48), dp(16), dp(12))
            setBackgroundColor(Color.parseColor("#1E293B"))
        }
        recycler = RecyclerView(ctx).apply {
            layoutManager = LinearLayoutManager(ctx).apply { stackFromEnd = true }
            adapter = this@NativeChatUIPlugin.adapter
            setHasFixedSize(false)
            itemAnimator = null // smoother for chat
            setPadding(dp(8), dp(8), dp(8), dp(8))
            clipToPadding = false
            layoutParams = LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                0,
                1f
            )
            addOnScrollListener(object : RecyclerView.OnScrollListener() {
                override fun onScrolled(rv: RecyclerView, dx: Int, dy: Int) {
                    val lm = rv.layoutManager as? LinearLayoutManager ?: return
                    if (lm.findFirstVisibleItemPosition() <= 2 && dy < 0) {
                        notifyListeners("chatui:loadMore", JSObject())
                    }
                }
            })
        }
        val sendBar = TextView(ctx).apply {
            text = "Tap to type…"
            setTextColor(Color.parseColor("#94A3B8"))
            setPadding(dp(16), dp(14), dp(16), dp(14))
            setBackgroundColor(Color.parseColor("#1E293B"))
            gravity = Gravity.CENTER_VERTICAL
            setOnClickListener {
                notifyListeners("chatui:send", JSObject().apply { put("open", true) })
            }
        }
        column.addView(header)
        column.addView(recycler)
        column.addView(sendBar)
        root.addView(column)
        root.visibility = View.GONE

        val decor = activity.window.decorView as? ViewGroup
        decor?.addView(root)
        overlay = root
    }

    private fun dp(v: Int): Int =
        (v * activity.resources.displayMetrics.density).toInt()

    // --- Adapter -----------------------------------------------------------

    private class ChatAdapter(
        private val items: List<ChatItem>,
        private val onTap: (ChatItem) -> Unit
    ) : RecyclerView.Adapter<ChatAdapter.VH>() {

        class VH(val bubble: TextView, val wrapper: LinearLayout) :
            RecyclerView.ViewHolder(wrapper)

        override fun onCreateViewHolder(parent: ViewGroup, viewType: Int): VH {
            val ctx = parent.context
            val wrap = LinearLayout(ctx).apply {
                orientation = LinearLayout.HORIZONTAL
                layoutParams = ViewGroup.LayoutParams(
                    ViewGroup.LayoutParams.MATCH_PARENT,
                    ViewGroup.LayoutParams.WRAP_CONTENT
                )
                setPadding(0, dpx(ctx, 4), 0, dpx(ctx, 4))
            }
            val bubble = TextView(ctx).apply {
                setTextColor(Color.WHITE)
                setTextSize(TypedValue.COMPLEX_UNIT_SP, 15f)
                setPadding(dpx(ctx, 12), dpx(ctx, 8), dpx(ctx, 12), dpx(ctx, 8))
            }
            wrap.addView(bubble)
            return VH(bubble, wrap)
        }

        override fun getItemCount(): Int = items.size

        override fun onBindViewHolder(holder: VH, position: Int) {
            val item = items[position]
            holder.bubble.text = item.text
            val ctx = holder.wrapper.context
            holder.wrapper.gravity = if (item.isMine) Gravity.END else Gravity.START
            val bg = android.graphics.drawable.GradientDrawable().apply {
                cornerRadius = dpx(ctx, 18).toFloat()
                setColor(
                    if (item.isMine) Color.parseColor("#2563EB")
                    else Color.parseColor("#334155")
                )
            }
            holder.bubble.background = bg
            val lp = LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.WRAP_CONTENT,
                ViewGroup.LayoutParams.WRAP_CONTENT
            )
            lp.marginStart = if (item.isMine) dpx(ctx, 60) else dpx(ctx, 8)
            lp.marginEnd = if (item.isMine) dpx(ctx, 8) else dpx(ctx, 60)
            holder.bubble.layoutParams = lp
            holder.bubble.setOnClickListener { onTap(item) }
        }

        private fun dpx(ctx: android.content.Context, v: Int): Int =
            (v * ctx.resources.displayMetrics.density).toInt()
    }
}
