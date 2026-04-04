package com.merilive.app.ui.agency.adapter

import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import android.widget.TextView
import androidx.recyclerview.widget.RecyclerView
import com.merilive.app.R
import com.merilive.app.ui.agency.CommissionHistoryItem

class CommissionHistoryAdapter(
    private val items: List<CommissionHistoryItem>,
) : RecyclerView.Adapter<CommissionHistoryAdapter.VH>() {

    inner class VH(view: View) : RecyclerView.ViewHolder(view) {
        val tvType: TextView = view.findViewById(R.id.tvType)
        val tvAmount: TextView = view.findViewById(R.id.tvAmount)
        val tvDate: TextView = view.findViewById(R.id.tvDate)
    }

    override fun onCreateViewHolder(parent: ViewGroup, viewType: Int): VH {
        val view = LayoutInflater.from(parent.context)
            .inflate(R.layout.item_transaction, parent, false)
        return VH(view)
    }

    override fun onBindViewHolder(holder: VH, position: Int) {
        val item = items[position]
        holder.tvType.text = "💰 ${item.hostName} (${item.type})"
        holder.tvAmount.text = "+${item.amount} (${(item.rate * 100).toInt()}%)"
        holder.tvAmount.setTextColor(holder.itemView.resources.getColor(R.color.success, null))
        holder.tvDate.text = item.date.take(10)
    }

    override fun getItemCount() = items.size
}
