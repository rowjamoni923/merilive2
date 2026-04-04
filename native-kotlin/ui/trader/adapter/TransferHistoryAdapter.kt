package com.merilive.app.ui.trader.adapter

import android.view.LayoutInflater
import android.view.ViewGroup
import androidx.recyclerview.widget.DiffUtil
import androidx.recyclerview.widget.ListAdapter
import androidx.recyclerview.widget.RecyclerView
import com.merilive.app.data.repository.TraderTransferRecord
import com.merilive.app.databinding.ItemTraderTransferBinding

class TransferHistoryAdapter : ListAdapter<TraderTransferRecord, TransferHistoryAdapter.ViewHolder>(DIFF) {

    companion object {
        private val DIFF = object : DiffUtil.ItemCallback<TraderTransferRecord>() {
            override fun areItemsTheSame(a: TraderTransferRecord, b: TraderTransferRecord) = a.id == b.id
            override fun areContentsTheSame(a: TraderTransferRecord, b: TraderTransferRecord) = a == b
        }
    }

    inner class ViewHolder(private val binding: ItemTraderTransferBinding) :
        RecyclerView.ViewHolder(binding.root) {
        fun bind(item: TraderTransferRecord) {
            binding.tvTargetName.text = item.target_name ?: item.target_uid ?: "Unknown"
            binding.tvAmount.text = String.format("%,d 💎", item.amount)
            binding.tvType.text = item.transfer_type.replace("_", " ").uppercase()
            binding.tvDate.text = item.created_at.take(10)
            binding.tvStatus.text = item.status.uppercase()
        }
    }

    override fun onCreateViewHolder(parent: ViewGroup, viewType: Int) = ViewHolder(
        ItemTraderTransferBinding.inflate(LayoutInflater.from(parent.context), parent, false)
    )

    override fun onBindViewHolder(holder: ViewHolder, position: Int) = holder.bind(getItem(position))
}
