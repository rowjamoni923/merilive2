package com.merilive.app.ui.host.adapter

import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import android.widget.TextView
import androidx.core.content.ContextCompat
import androidx.recyclerview.widget.DiffUtil
import androidx.recyclerview.widget.ListAdapter
import androidx.recyclerview.widget.RecyclerView
import com.merilive.app.R
import com.merilive.app.data.model.EarningsTransfer

class TransferHistoryAdapter : ListAdapter<EarningsTransfer, TransferHistoryAdapter.ViewHolder>(DIFF) {

    companion object {
        private val DIFF = object : DiffUtil.ItemCallback<EarningsTransfer>() {
            override fun areItemsTheSame(a: EarningsTransfer, b: EarningsTransfer) = a.id == b.id
            override fun areContentsTheSame(a: EarningsTransfer, b: EarningsTransfer) = a == b
        }
    }

    inner class ViewHolder(view: View) : RecyclerView.ViewHolder(view) {
        val tvType: TextView = view.findViewById(R.id.tvType)
        val tvDate: TextView = view.findViewById(R.id.tvDate)
        val tvAmount: TextView = view.findViewById(R.id.tvAmount)
    }

    override fun onCreateViewHolder(parent: ViewGroup, viewType: Int): ViewHolder {
        return ViewHolder(LayoutInflater.from(parent.context).inflate(R.layout.item_transaction, parent, false))
    }

    override fun onBindViewHolder(holder: ViewHolder, position: Int) {
        val item = getItem(position)
        holder.tvType.text = item.transferType
        holder.tvDate.text = item.dateFormatted ?: ""
        holder.tvAmount.text = "💎 ${item.amount}"
        val color = when (item.status) {
            "completed" -> R.color.success
            "pending" -> R.color.warning
            else -> R.color.text_secondary
        }
        holder.tvAmount.setTextColor(ContextCompat.getColor(holder.itemView.context, color))
    }
}
