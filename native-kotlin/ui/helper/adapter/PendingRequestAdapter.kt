package com.merilive.app.ui.helper.adapter

import android.view.LayoutInflater
import android.view.ViewGroup
import androidx.recyclerview.widget.DiffUtil
import androidx.recyclerview.widget.ListAdapter
import androidx.recyclerview.widget.RecyclerView
import com.merilive.app.data.repository.HelperWithdrawalRequest
import com.merilive.app.databinding.ItemHelperPendingRequestBinding

class PendingRequestAdapter(
    private val onProcess: (HelperWithdrawalRequest) -> Unit,
    private val onReject: (HelperWithdrawalRequest) -> Unit
) : ListAdapter<HelperWithdrawalRequest, PendingRequestAdapter.ViewHolder>(DIFF) {

    companion object {
        private val DIFF = object : DiffUtil.ItemCallback<HelperWithdrawalRequest>() {
            override fun areItemsTheSame(a: HelperWithdrawalRequest, b: HelperWithdrawalRequest) = a.id == b.id
            override fun areContentsTheSame(a: HelperWithdrawalRequest, b: HelperWithdrawalRequest) = a == b
        }
    }

    inner class ViewHolder(private val binding: ItemHelperPendingRequestBinding) :
        RecyclerView.ViewHolder(binding.root) {
        fun bind(item: HelperWithdrawalRequest) {
            binding.tvAgencyName.text = item.agency_name ?: "Agency"
            binding.tvAmount.text = String.format("%,d Beans", item.amount)
            binding.tvPaymentMethod.text = item.payment_method ?: "—"
            binding.tvRequestedAt.text = item.requested_at.take(10)

            item.local_currency_amount?.let { localAmt ->
                binding.tvLocalAmount.text = "${item.currency_code ?: ""} ${String.format("%.2f", localAmt)}"
            }

            binding.btnProcess.setOnClickListener { onProcess(item) }
            binding.btnReject.setOnClickListener { onReject(item) }
        }
    }

    override fun onCreateViewHolder(parent: ViewGroup, viewType: Int) = ViewHolder(
        ItemHelperPendingRequestBinding.inflate(LayoutInflater.from(parent.context), parent, false)
    )

    override fun onBindViewHolder(holder: ViewHolder, position: Int) = holder.bind(getItem(position))
}
