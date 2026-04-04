package com.merilive.app.ui.call

import android.view.LayoutInflater
import android.view.ViewGroup
import androidx.recyclerview.widget.RecyclerView
import com.merilive.app.databinding.ItemTransactionBinding
import com.merilive.app.data.repository.CallHistoryItem

class CallHistoryAdapter(
    private val items: List<CallHistoryItem>,
    private val onClick: (CallHistoryItem) -> Unit,
) : RecyclerView.Adapter<CallHistoryAdapter.ViewHolder>() {

    inner class ViewHolder(val binding: ItemTransactionBinding) : RecyclerView.ViewHolder(binding.root) {
        fun bind(item: CallHistoryItem) {
            val statusIcon = when (item.status) {
                "ended" -> "✅"
                "missed" -> "❌"
                "rejected" -> "🚫"
                else -> "⏳"
            }
            binding.tvType.text = "📹 Video Call $statusIcon"
            binding.tvDate.text = item.created_at?.take(10) ?: ""
            binding.tvAmount.text = if (item.coins_spent != null) "💎 ${item.coins_spent}" else "${item.duration_seconds ?: 0}s"
            binding.root.setOnClickListener { onClick(item) }
        }
    }

    override fun onCreateViewHolder(parent: ViewGroup, viewType: Int): ViewHolder {
        val binding = ItemTransactionBinding.inflate(LayoutInflater.from(parent.context), parent, false)
        return ViewHolder(binding)
    }

    override fun onBindViewHolder(holder: ViewHolder, position: Int) = holder.bind(items[position])
    override fun getItemCount() = items.size
}
