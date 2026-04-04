package com.merilive.app.ui.shop.adapter

import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import android.widget.ImageView
import android.widget.TextView
import androidx.recyclerview.widget.DiffUtil
import androidx.recyclerview.widget.ListAdapter
import androidx.recyclerview.widget.RecyclerView
import coil.load
import com.google.android.material.button.MaterialButton
import com.merilive.app.R
import com.merilive.app.data.model.ShopItem

class ShopAdapter(
    private val onBuyClick: (ShopItem) -> Unit
) : ListAdapter<ShopItem, ShopAdapter.ViewHolder>(DIFF) {

    companion object {
        private val DIFF = object : DiffUtil.ItemCallback<ShopItem>() {
            override fun areItemsTheSame(a: ShopItem, b: ShopItem) = a.id == b.id
            override fun areContentsTheSame(a: ShopItem, b: ShopItem) = a == b
        }
    }

    inner class ViewHolder(view: View) : RecyclerView.ViewHolder(view) {
        val ivPreview: ImageView = view.findViewById(R.id.ivPreview)
        val tvName: TextView = view.findViewById(R.id.tvName)
        val tvPrice: TextView = view.findViewById(R.id.tvPrice)
        val btnBuy: MaterialButton = view.findViewById(R.id.btnBuy)

        init {
            btnBuy.setOnClickListener {
                val pos = bindingAdapterPosition
                if (pos != RecyclerView.NO_POSITION) onBuyClick(getItem(pos))
            }
        }
    }

    override fun onCreateViewHolder(parent: ViewGroup, viewType: Int): ViewHolder {
        return ViewHolder(LayoutInflater.from(parent.context).inflate(R.layout.item_shop_item, parent, false))
    }

    override fun onBindViewHolder(holder: ViewHolder, position: Int) {
        val item = getItem(position)
        holder.tvName.text = item.name
        holder.tvPrice.text = "💎 ${item.priceDiamonds}"
        item.previewUrl?.let { holder.ivPreview.load(it) }
        holder.btnBuy.text = if (item.isOwned) "Owned" else "Buy"
        holder.btnBuy.isEnabled = !item.isOwned
    }
}
