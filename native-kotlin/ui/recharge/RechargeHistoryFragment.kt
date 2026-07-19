package com.merilive.app.ui.recharge

import android.os.Bundle
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import androidx.fragment.app.Fragment
import androidx.fragment.app.viewModels
import androidx.lifecycle.ViewModel
import androidx.lifecycle.lifecycleScope
import androidx.lifecycle.viewModelScope
import androidx.navigation.fragment.findNavController
import androidx.recyclerview.widget.LinearLayoutManager
import com.merilive.app.R
import com.merilive.app.databinding.FragmentSimpleListBinding
import dagger.hilt.android.AndroidEntryPoint
import dagger.hilt.android.lifecycle.HiltViewModel
import io.github.jan.supabase.auth.Auth
import io.github.jan.supabase.postgrest.Postgrest
import io.github.jan.supabase.postgrest.query.Order
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import kotlinx.serialization.Serializable
import javax.inject.Inject

@AndroidEntryPoint
class RechargeHistoryFragment : Fragment() {

    private var _binding: FragmentSimpleListBinding? = null
    private val binding get() = _binding!!
    private val viewModel: RechargeHistoryViewModel by viewModels()

    override fun onCreateView(
        inflater: LayoutInflater, container: ViewGroup?, savedInstanceState: Bundle?
    ): View {
        _binding = FragmentSimpleListBinding.inflate(inflater, container, false)
        return binding.root
    }

    override fun onViewCreated(view: View, savedInstanceState: Bundle?) {
        super.onViewCreated(view, savedInstanceState)

        binding.tvTitle.text = "Recharge History"
        binding.btnBack.setOnClickListener { findNavController().navigateUp() }

        val adapter = RechargeHistoryAdapter()
        binding.recyclerView.layoutManager = LinearLayoutManager(requireContext())
        binding.recyclerView.adapter = adapter

        viewModel.loadHistory()

        viewLifecycleOwner.lifecycleScope.launchWhenStarted {
            viewModel.items.collect { items ->
                adapter.submitList(items)
                binding.emptyState.visibility = if (items.isEmpty()) View.VISIBLE else View.GONE
            }
        }
    }

    override fun onDestroyView() {
        super.onDestroyView()
        _binding = null
    }
}

class RechargeHistoryAdapter : androidx.recyclerview.widget.ListAdapter<RechargeHistoryItem, RechargeHistoryAdapter.VH>(
    object : androidx.recyclerview.widget.DiffUtil.ItemCallback<RechargeHistoryItem>() {
        override fun areItemsTheSame(a: RechargeHistoryItem, b: RechargeHistoryItem) = a.id == b.id
        override fun areContentsTheSame(a: RechargeHistoryItem, b: RechargeHistoryItem) = a == b
    }
) {
    class VH(val binding: com.merilive.app.databinding.ItemTransactionBinding) :
        androidx.recyclerview.widget.RecyclerView.ViewHolder(binding.root)

    override fun onCreateViewHolder(parent: ViewGroup, viewType: Int): VH {
        val b = com.merilive.app.databinding.ItemTransactionBinding.inflate(
            LayoutInflater.from(parent.context), parent, false
        )
        return VH(b)
    }

    override fun onBindViewHolder(holder: VH, position: Int) {
        val item = getItem(position)
        holder.binding.tvTitle.text = item.package_name ?: "Recharge"
        holder.binding.tvAmount.text = "+${item.diamonds_amount} Diamonds"
        holder.binding.tvDate.text = item.created_at?.take(10) ?: ""
        holder.binding.tvStatus.text = item.status
    }
}

@HiltViewModel
class RechargeHistoryViewModel @Inject constructor(
    private val auth: Auth,
    private val postgrest: Postgrest,
) : ViewModel() {

    private val _items = MutableStateFlow<List<RechargeHistoryItem>>(emptyList())
    val items = _items.asStateFlow()

    private val currentUserId: String
        get() = auth.currentSessionOrNull()?.user?.id ?: ""

    fun loadHistory() {
        viewModelScope.launch {
            try {
                val result = postgrest.from("diamond_transactions")
                    .select {
                        filter {
                            eq("user_id", currentUserId)
                            eq("transaction_type", "purchase")
                        }
                        order("created_at", Order.DESCENDING)
                        limit(100)
                    }
                    .decodeList<RechargeHistoryItem>()
                _items.value = result
            } catch (_: Exception) {}
        }
    }
}

@Serializable
data class RechargeHistoryItem(
    val id: String,
    val user_id: String,
    val diamonds_amount: Long = 0,
    val transaction_type: String = "purchase",
    val status: String = "completed",
    val package_name: String? = null,
    val payment_method: String? = null,
    val amount_usd: Double? = null,
    val created_at: String? = null,
)
