package com.merilive.app.plugin

import android.graphics.Color
import android.graphics.drawable.GradientDrawable
import android.view.View
import android.view.ViewGroup
import android.widget.FrameLayout
import android.widget.ImageView
import android.widget.LinearLayout
import android.widget.TextView
import androidx.recyclerview.widget.GridLayoutManager
import androidx.recyclerview.widget.RecyclerView
import com.getcapacitor.JSArray
import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin
import com.google.android.material.bottomsheet.BottomSheetBehavior
import com.google.android.material.bottomsheet.BottomSheetDialog
import com.merilive.app.R
import com.bumptech.glide.Glide
import com.bumptech.glide.load.resource.drawable.DrawableTransitionOptions

/**
 * Pkg435 — NativeGiftPanelPlugin
 * 
 * Native Material BottomSheet + RecyclerView for 60fps gifting experience.
 * Solves React Modal opening lag (200-500ms) and scroll jitter with 100+ gifts.
 * 
 * Architecture:
 * - Uses Material BottomSheetDialog for system-level feel (snap, fling).
 * - Glide for optimized image loading & memory management.
 * - Reactive JS Bridge: emits 'gift:select', 'gift:send', 'gift:recharge' events.
 */
@CapacitorPlugin(name = "NativeGiftPanel")
class NativeGiftPanelPlugin : Plugin() {

    private var dialog: BottomSheetDialog? = null
    private val gifts = mutableListOf<GiftItem>()
    private val categories = mutableListOf<CategoryItem>()
    private var selectedGiftId: String? = null
    private var adapter: GiftAdapter? = null
    private var balanceText: TextView? = null

    data class GiftItem(
        val id: String,
        val name: String,
        val coins: Int,
        val iconUrl: String?,
        val category: String
    )

    data class CategoryItem(
        val id: String,
        val name: String
    )

    private inline fun safe(call: PluginCall, block: () -> Unit) {
        try { block() } catch (t: Throwable) { call.reject(t.message ?: "gift-panel error") }
    }

    @PluginMethod
    fun open(call: PluginCall) = safe(call) {
        val giftsArr = call.getArray("gifts") ?: JSArray()
        val catsArr = call.getArray("categories") ?: JSArray()
        val balance = call.getInt("balance", 0) ?: 0

        parseData(giftsArr, catsArr)

        activity.runOnUiThread {
            safe(call) {
                showPanel(balance)
                call.resolve()
            }
        }
    }

    @PluginMethod
    fun updateBalance(call: PluginCall) = safe(call) {
        val balance = call.getInt("balance", 0) ?: 0
        activity.runOnUiThread {
            safe(call) {
                balanceText?.text = balance.toString()
                call.resolve()
            }
        }
    }

    @PluginMethod
    fun close(call: PluginCall) = safe(call) {
        activity.runOnUiThread {
            safe(call) {
                dialog?.dismiss()
                call.resolve()
            }
        }
    }

    override fun handleOnDestroy() {
        try { dialog?.dismiss() } catch (_: Throwable) {}
        dialog = null
        balanceText = null
        adapter = null
        gifts.clear()
        categories.clear()
        super.handleOnDestroy()
    }

    private fun parseData(giftsArr: JSArray, catsArr: JSArray) {
        gifts.clear()
        for (i in 0 until giftsArr.length()) {
            val o = giftsArr.optJSONObject(i) ?: continue
            gifts.add(GiftItem(
                id = o.optString("id"),
                name = o.optString("name"),
                coins = o.optInt("coins"),
                iconUrl = o.optString("icon_url"),
                category = o.optString("category")
            ))
        }

        categories.clear()
        for (i in 0 until catsArr.length()) {
            val o = catsArr.optJSONObject(i) ?: continue
            categories.add(CategoryItem(
                id = o.optString("id"),
                name = o.optString("name")
            ))
        }
    }

    private fun showPanel(balance: Int) {
        val context = activity
        val dialog = BottomSheetDialog(context)
        this.dialog = dialog

        val root = LinearLayout(context).apply {
            orientation = LinearLayout.VERTICAL
            setBackgroundColor(Color.parseColor("#1E1B2E")) // Deep dark theme
            layoutParams = ViewGroup.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.WRAP_CONTENT
            )
            setPadding(0, dp(12), 0, dp(16))
        }

        // --- Header (Balance & Recharge) ---
        val header = LinearLayout(context).apply {
            orientation = LinearLayout.HORIZONTAL
            gravity = android.view.Gravity.CENTER_VERTICAL
            setPadding(dp(16), 0, dp(16), dp(12))
            layoutParams = LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT)
        }

        val coinIcon = ImageView(context).apply {
            // In a real app we'd use a drawable res, but for now we'll rely on Glide if needed 
            // or a simple placeholder. Let's use a circle for now as drawable icon placeholder.
            val d = GradientDrawable().apply {
                shape = GradientDrawable.OVAL
                setColor(Color.parseColor("#FFD700")) // Gold
            }
            background = d
            layoutParams = LinearLayout.LayoutParams(dp(16), dp(16))
        }

        balanceText = TextView(context).apply {
            text = balance.toString()
            setTextColor(Color.WHITE)
            textSize = 16f
            setPadding(dp(6), 0, 0, 0)
            layoutParams = LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f)
        }

        val rechargeBtn = TextView(context).apply {
            text = "Recharge >"
            setTextColor(Color.parseColor("#F472B6")) // Pink
            textSize = 14f
            setOnClickListener {
                notifyListeners("gift:recharge", JSObject())
            }
        }

        header.addView(coinIcon)
        header.addView(balanceText)
        header.addView(rechargeBtn)

        // --- Categories (Horizontal) ---
        // Simplified: using a simple scrollable layout or first 4
        
        // --- Gifts Grid ---
        val recycler = RecyclerView(context).apply {
            layoutParams = LinearLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, dp(320))
            layoutManager = GridLayoutManager(context, 4)
            setPadding(dp(8), 0, dp(8), 0)
        }

        adapter = GiftAdapter(gifts) { gift ->
            selectedGiftId = gift.id
            notifyListeners("gift:select", JSObject().put("id", gift.id))
            adapter?.notifyDataSetChanged()
        }
        recycler.adapter = adapter

        // --- Footer (Send Button) ---
        val footer = FrameLayout(context).apply {
            setPadding(dp(16), dp(12), dp(16), 0)
        }
        val sendBtn = TextView(context).apply {
            text = "Send"
            setTextColor(Color.WHITE)
            textSize = 16f
            gravity = android.view.Gravity.CENTER
            val bg = GradientDrawable().apply {
                cornerRadius = dp(24).toFloat()
                setColor(Color.parseColor("#EC4899")) // Pink-500
            }
            background = bg
            setPadding(0, dp(10), 0, dp(10))
            layoutParams = FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT)
            setOnClickListener {
                selectedGiftId?.let { id ->
                    notifyListeners("gift:send", JSObject().put("id", id).put("count", 1))
                }
            }
        }
        footer.addView(sendBtn)

        root.addView(header)
        root.addView(recycler)
        root.addView(footer)

        dialog.setContentView(root)
        dialog.show()
    }

    private fun dp(v: Int): Int = (v * activity.resources.displayMetrics.density).toInt()

    private inner class GiftAdapter(
        val items: List<GiftItem>,
        val onClick: (GiftItem) -> Unit
    ) : RecyclerView.Adapter<GiftAdapter.VH>() {

        inner class VH(view: View) : RecyclerView.ViewHolder(view) {
            val root = view as LinearLayout
            val icon = view.findViewById<ImageView>(1)
            val name = view.findViewById<TextView>(2)
            val price = view.findViewById<TextView>(3)
        }

        override fun onCreateViewHolder(parent: ViewGroup, viewType: Int): VH {
            val ctx = parent.context
            val wrap = LinearLayout(ctx).apply {
                orientation = LinearLayout.VERTICAL
                gravity = android.view.Gravity.CENTER
                setPadding(dp(4), dp(8), dp(4), dp(8))
                layoutParams = ViewGroup.LayoutParams(
                    parent.width / 4,
                    ViewGroup.LayoutParams.WRAP_CONTENT
                )
            }
            val img = ImageView(ctx).apply { id = 1; layoutParams = LinearLayout.LayoutParams(dp(50), dp(50)) }
            val txtName = TextView(ctx).apply { id = 2; textSize = 11f; setTextColor(Color.parseColor("#94A3B8")); gravity = android.view.Gravity.CENTER }
            val txtPrice = TextView(ctx).apply { id = 3; textSize = 10f; setTextColor(Color.parseColor("#FFD700")); gravity = android.view.Gravity.CENTER }
            
            wrap.addView(img)
            wrap.addView(txtName)
            wrap.addView(txtPrice)
            return VH(wrap)
        }

        override fun getItemCount() = items.size

        override fun onBindViewHolder(holder: VH, position: Int) {
            val item = items[position]
            holder.name.text = item.name
            holder.price.text = item.coins.toString()
            
            val isSelected = item.id == selectedGiftId
            holder.root.background = if (isSelected) {
                GradientDrawable().apply {
                    setColor(Color.parseColor("#332D4D"))
                    cornerRadius = dp(8).toFloat()
                    setStroke(dp(1), Color.parseColor("#EC4899"))
                }
            } else null

            Glide.with(holder.icon)
                .load(item.iconUrl)
                .transition(DrawableTransitionOptions.withCrossFade())
                .into(holder.icon)

            holder.root.setOnClickListener { onClick(item) }
        }
    }
}
