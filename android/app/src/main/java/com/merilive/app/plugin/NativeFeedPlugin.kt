package com.merilive.app.plugin

import android.graphics.Color
import android.graphics.Typeface
import android.util.TypedValue
import android.view.Gravity
import android.view.View
import android.view.ViewGroup
import android.widget.FrameLayout
import android.widget.ImageView
import android.widget.LinearLayout
import android.widget.TextView
import androidx.recyclerview.widget.GridLayoutManager
import androidx.recyclerview.widget.RecyclerView
import com.bumptech.glide.Glide
import com.bumptech.glide.load.engine.DiskCacheStrategy
import com.bumptech.glide.request.RequestOptions
import com.getcapacitor.JSArray
import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin

/**
 * Pkg433 — NativeFeedPlugin
 *
 * RecyclerView-backed home/discover feed. 2-column grid of host cards with
 * Glide-cached thumbnails (reusing the Pkg428 image pipeline). Smooth
 * 60-90fps scroll on 1000+ cards, zero WebView layout cost.
 *
 * Additive. Default OFF. Existing Index.tsx / Discover.tsx React grids stay
 * canonical until JS opt-in via `feedNativeFlag` + explicit `openNativeFeed`.
 */
@CapacitorPlugin(name = "NativeFeed")
class NativeFeedPlugin : Plugin() {

    private var overlay: FrameLayout? = null
    private var recycler: RecyclerView? = null
    private var scrollListener: RecyclerView.OnScrollListener? = null
    private val items = mutableListOf<FeedCard>()
    private val adapter = FeedAdapter(items) { id ->
        notifyListeners("feed:tap", JSObject().apply { put("id", id) })
    }

    override fun handleOnDestroy() {
        try {
            activity?.runOnUiThread {
                try { scrollListener?.let { recycler?.removeOnScrollListener(it) } } catch (_: Throwable) {}
                try { recycler?.adapter = null } catch (_: Throwable) {}
                try { (overlay?.parent as? ViewGroup)?.removeView(overlay) } catch (_: Throwable) {}
                overlay = null
                recycler = null
                scrollListener = null
            }
        } catch (_: Throwable) {}
        super.handleOnDestroy()
    }

    data class FeedCard(
        val id: String,
        val title: String,
        val subtitle: String,
        val thumbUrl: String?,
        val liveBadge: Boolean,
        val country: String?
    )

    @PluginMethod
    fun open(call: PluginCall) {
        val title = call.getString("title", "Live") ?: "Live"
        activity.runOnUiThread {
            ensureOverlay(title)
            overlay?.visibility = View.VISIBLE
        }
        call.resolve()
    }

    @PluginMethod
    fun close(call: PluginCall) {
        activity.runOnUiThread { overlay?.visibility = View.GONE }
        call.resolve()
    }

    @PluginMethod
    fun setItems(call: PluginCall) {
        val parsed = parse(call.getArray("items") ?: JSArray())
        activity.runOnUiThread {
            items.clear()
            items.addAll(parsed)
            adapter.notifyDataSetChanged()
            recycler?.scrollToPosition(0)
        }
        call.resolve()
    }

    @PluginMethod
    fun appendItems(call: PluginCall) {
        val parsed = parse(call.getArray("items") ?: JSArray())
        activity.runOnUiThread {
            val start = items.size
            items.addAll(parsed)
            adapter.notifyItemRangeInserted(start, parsed.size)
        }
        call.resolve()
    }

    @PluginMethod
    fun clear(call: PluginCall) {
        activity.runOnUiThread {
            val n = items.size
            items.clear()
            adapter.notifyItemRangeRemoved(0, n)
        }
        call.resolve()
    }

    private fun parse(arr: JSArray): List<FeedCard> {
        val out = mutableListOf<FeedCard>()
        for (i in 0 until arr.length()) {
            val o = arr.optJSONObject(i) ?: continue
            out.add(
                FeedCard(
                    id = o.optString("id", "card_$i"),
                    title = o.optString("title", ""),
                    subtitle = o.optString("subtitle", ""),
                    thumbUrl = if (o.has("thumbUrl")) o.optString("thumbUrl", null) else null,
                    liveBadge = o.optBoolean("liveBadge", false),
                    country = if (o.has("country")) o.optString("country", null) else null
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
            layoutParams = FrameLayout.LayoutParams(
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
            layoutManager = GridLayoutManager(ctx, 2)
            adapter = this@NativeFeedPlugin.adapter
            setHasFixedSize(true)
            setPadding(dp(6), dp(6), dp(6), dp(6))
            clipToPadding = false
            layoutParams = LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                0,
                1f
            )
            addOnScrollListener(object : RecyclerView.OnScrollListener() {
                override fun onScrolled(rv: RecyclerView, dx: Int, dy: Int) {
                    val lm = rv.layoutManager as? GridLayoutManager ?: return
                    val last = lm.findLastVisibleItemPosition()
                    if (last >= items.size - 4 && dy > 0) {
                        notifyListeners("feed:loadMore", JSObject())
                    }
                }
            }.also { scrollListener = it })
        }
        column.addView(header)
        column.addView(recycler)
        root.addView(column)
        root.visibility = View.GONE
        (activity.window.decorView as? ViewGroup)?.addView(root)
        overlay = root
    }

    private fun dp(v: Int): Int =
        (v * activity.resources.displayMetrics.density).toInt()

    // --- Adapter -----------------------------------------------------------

    private class FeedAdapter(
        private val items: List<FeedCard>,
        private val onTap: (String) -> Unit
    ) : RecyclerView.Adapter<FeedAdapter.VH>() {

        class VH(
            val card: FrameLayout,
            val thumb: ImageView,
            val title: TextView,
            val subtitle: TextView,
            val badge: TextView
        ) : RecyclerView.ViewHolder(card)

        override fun onCreateViewHolder(parent: ViewGroup, viewType: Int): VH {
            val ctx = parent.context
            val card = FrameLayout(ctx).apply {
                layoutParams = ViewGroup.MarginLayoutParams(
                    ViewGroup.LayoutParams.MATCH_PARENT,
                    dpx(ctx, 220)
                ).apply {
                    setMargins(dpx(ctx, 6), dpx(ctx, 6), dpx(ctx, 6), dpx(ctx, 6))
                }
                background = android.graphics.drawable.GradientDrawable().apply {
                    cornerRadius = dpx(ctx, 14).toFloat()
                    setColor(Color.parseColor("#1E293B"))
                }
                clipToOutline = true
            }
            val thumb = ImageView(ctx).apply {
                scaleType = ImageView.ScaleType.CENTER_CROP
                layoutParams = FrameLayout.LayoutParams(
                    ViewGroup.LayoutParams.MATCH_PARENT,
                    ViewGroup.LayoutParams.MATCH_PARENT
                )
            }
            val overlayBg = View(ctx).apply {
                background = android.graphics.drawable.GradientDrawable(
                    android.graphics.drawable.GradientDrawable.Orientation.TOP_BOTTOM,
                    intArrayOf(Color.TRANSPARENT, Color.parseColor("#CC000000"))
                )
                layoutParams = FrameLayout.LayoutParams(
                    ViewGroup.LayoutParams.MATCH_PARENT,
                    dpx(ctx, 90)
                ).apply { gravity = Gravity.BOTTOM }
            }
            val texts = LinearLayout(ctx).apply {
                orientation = LinearLayout.VERTICAL
                setPadding(dpx(ctx, 10), 0, dpx(ctx, 10), dpx(ctx, 10))
                layoutParams = FrameLayout.LayoutParams(
                    ViewGroup.LayoutParams.MATCH_PARENT,
                    ViewGroup.LayoutParams.WRAP_CONTENT
                ).apply { gravity = Gravity.BOTTOM }
            }
            val title = TextView(ctx).apply {
                setTextColor(Color.WHITE)
                setTextSize(TypedValue.COMPLEX_UNIT_SP, 14f)
                typeface = Typeface.DEFAULT_BOLD
                maxLines = 1
                ellipsize = android.text.TextUtils.TruncateAt.END
            }
            val subtitle = TextView(ctx).apply {
                setTextColor(Color.parseColor("#CBD5E1"))
                setTextSize(TypedValue.COMPLEX_UNIT_SP, 11f)
                maxLines = 1
                ellipsize = android.text.TextUtils.TruncateAt.END
            }
            texts.addView(title)
            texts.addView(subtitle)
            val badge = TextView(ctx).apply {
                text = "LIVE"
                setTextColor(Color.WHITE)
                setTextSize(TypedValue.COMPLEX_UNIT_SP, 10f)
                typeface = Typeface.DEFAULT_BOLD
                setPadding(dpx(ctx, 8), dpx(ctx, 3), dpx(ctx, 8), dpx(ctx, 3))
                background = android.graphics.drawable.GradientDrawable().apply {
                    cornerRadius = dpx(ctx, 10).toFloat()
                    setColor(Color.parseColor("#EF4444"))
                }
                layoutParams = FrameLayout.LayoutParams(
                    ViewGroup.LayoutParams.WRAP_CONTENT,
                    ViewGroup.LayoutParams.WRAP_CONTENT
                ).apply {
                    gravity = Gravity.TOP or Gravity.START
                    setMargins(dpx(ctx, 8), dpx(ctx, 8), 0, 0)
                }
                visibility = View.GONE
            }
            card.addView(thumb)
            card.addView(overlayBg)
            card.addView(texts)
            card.addView(badge)
            return VH(card, thumb, title, subtitle, badge)
        }

        override fun getItemCount(): Int = items.size

        override fun onBindViewHolder(holder: VH, position: Int) {
            val item = items[position]
            holder.title.text = item.title
            holder.subtitle.text = listOfNotNull(item.subtitle.ifBlank { null }, item.country).joinToString(" · ")
            holder.badge.visibility = if (item.liveBadge) View.VISIBLE else View.GONE
            holder.card.setOnClickListener { onTap(item.id) }
            val url = item.thumbUrl
            if (!url.isNullOrEmpty()) {
                Glide.with(holder.thumb.context)
                    .load(url)
                    .apply(
                        RequestOptions()
                            .diskCacheStrategy(DiskCacheStrategy.AUTOMATIC)
                            .centerCrop()
                    )
                    .into(holder.thumb)
            } else {
                holder.thumb.setImageDrawable(null)
                holder.thumb.setBackgroundColor(Color.parseColor("#334155"))
            }
        }

        override fun onViewRecycled(holder: VH) {
            super.onViewRecycled(holder)
            Glide.with(holder.thumb.context).clear(holder.thumb)
        }

        private fun dpx(ctx: android.content.Context, v: Int): Int =
            (v * ctx.resources.displayMetrics.density).toInt()
    }
}
