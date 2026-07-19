package com.merilive.app.ui.recharge.adapter

import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import android.widget.TextView
import androidx.recyclerview.widget.DiffUtil
import androidx.recyclerview.widget.ListAdapter
import androidx.recyclerview.widget.RecyclerView
import com.google.android.material.button.MaterialButton
import com.merilive.app.R
import com.merilive.app.data.model.RechargePackage

class RechargeAdapter(
    private val onBuyClick: (RechargePackage) -> Unit
) : ListAdapter<RechargePackage, RechargeAdapter.ViewHolder>(DIFF) {

    companion object {
        private val DIFF = object : DiffUtil.ItemCallback<RechargePackage>() {
            override fun areItemsTheSame(a: RechargePackage, b: RechargePackage) = a.id == b.id
            override fun areContentsTheSame(a: RechargePackage, b: RechargePackage) = a == b
        }
    }

    inner class ViewHolder(view: View) : RecyclerView.ViewHolder(view) {
        val tvDiamonds: TextView = view.findViewById(R.id.tvDiamonds)
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
        return ViewHolder(LayoutInflater.from(parent.context).inflate(R.layout.item_recharge_package, parent, false))
    }

    override fun onBindViewHolder(holder: ViewHolder, position: Int) {
        val item = getItem(position)
        holder.tvDiamonds.text = "💎 ${item.diamonds}"
        holder.tvPrice.text = item.priceDisplay
    }
}
