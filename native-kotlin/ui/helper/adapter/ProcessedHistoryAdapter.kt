package com.merilive.app.ui.helper.adapter

import android.view.LayoutInflater
import android.view.ViewGroup
import androidx.recyclerview.widget.DiffUtil
import androidx.recyclerview.widget.ListAdapter
import androidx.recyclerview.widget.RecyclerView
import com.merilive.app.data.repository.HelperProcessedItem
import com.merilive.app.databinding.ItemHelperProcessedBinding

class ProcessedHistoryAdapter : ListAdapter<HelperProcessedItem, ProcessedHistoryAdapter.ViewHolder>(DIFF) {

    companion object {
        private val DIFF = object : DiffUtil.ItemCallback<HelperProcessedItem>() {
            override fun areItemsTheSame(a: HelperProcessedItem, b: HelperProcessedItem) = a.id == b.id
            override fun areContentsTheSame(a: HelperProcessedItem, b: HelperProcessedItem) = a == b
        }
    }

    inner class ViewHolder(private val binding: ItemHelperProcessedBinding) :
        RecyclerView.ViewHolder(binding.root) {
        fun bind(item: HelperProcessedItem) {
            binding.tvAgencyName.text = item.agency_name ?: "Agency"
            binding.tvAmount.text = String.format("%,d Beans", item.amount)
            binding.tvReward.text = "+${String.format("%,d", item.diamond_reward)} 💎"
            binding.tvStatus.text = item.status.uppercase()
            binding.tvDate.text = item.processed_at?.take(10) ?: "—"
            binding.tvTransactionId.text = item.transaction_id ?: "—"
        }
    }

    override fun onCreateViewHolder(parent: ViewGroup, viewType: Int) = ViewHolder(
        ItemHelperProcessedBinding.inflate(LayoutInflater.from(parent.context), parent, false)
    )

    override fun onBindViewHolder(holder: ViewHolder, position: Int) = holder.bind(getItem(position))
}
