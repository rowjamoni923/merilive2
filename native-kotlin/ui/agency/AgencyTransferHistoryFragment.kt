package com.merilive.app.ui.agency

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
class AgencyTransferHistoryFragment : Fragment() {

    private var _binding: FragmentSimpleListBinding? = null
    private val binding get() = _binding!!
    private val viewModel: AgencyTransferHistoryViewModel by viewModels()

    override fun onCreateView(
        inflater: LayoutInflater, container: ViewGroup?, savedInstanceState: Bundle?
    ): View {
        _binding = FragmentSimpleListBinding.inflate(inflater, container, false)
        return binding.root
    }

    override fun onViewCreated(view: View, savedInstanceState: Bundle?) {
        super.onViewCreated(view, savedInstanceState)

        binding.tvTitle.text = "Transfer History"
        binding.btnBack.setOnClickListener { findNavController().navigateUp() }

        val adapter = AgencyTransferAdapter()
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

// Inline adapter for agency transfer history items
class AgencyTransferAdapter : androidx.recyclerview.widget.ListAdapter<AgencyTransferItem, AgencyTransferAdapter.VH>(
    object : androidx.recyclerview.widget.DiffUtil.ItemCallback<AgencyTransferItem>() {
        override fun areItemsTheSame(a: AgencyTransferItem, b: AgencyTransferItem) = a.id == b.id
        override fun areContentsTheSame(a: AgencyTransferItem, b: AgencyTransferItem) = a == b
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
        holder.binding.tvTitle.text = "${item.transfer_type} — ${item.host_name ?: item.host_uid ?: "Host"}"
        holder.binding.tvAmount.text = "${item.amount} Beans"
        holder.binding.tvDate.text = item.created_at?.take(10) ?: ""
        holder.binding.tvStatus.text = item.status
    }
}

@HiltViewModel
class AgencyTransferHistoryViewModel @Inject constructor(
    private val auth: Auth,
    private val postgrest: Postgrest,
) : ViewModel() {

    private val _items = MutableStateFlow<List<AgencyTransferItem>>(emptyList())
    val items = _items.asStateFlow()

    private val currentUserId: String
        get() = auth.currentSessionOrNull()?.user?.id ?: ""

    fun loadHistory() {
        viewModelScope.launch {
            try {
                val agencies = postgrest.from("agencies")
                    .select { filter { eq("owner_id", currentUserId) } }
                    .decodeList<AgencyIdResponse>()

                if (agencies.isNotEmpty()) {
                    val result = postgrest.from("agency_earnings_transfers")
                        .select {
                            filter { eq("agency_id", agencies.first().id) }
                            order("created_at", Order.DESCENDING)
                            limit(100)
                        }
                        .decodeList<AgencyTransferItem>()
                    _items.value = result
                }
            } catch (_: Exception) {}
        }
    }
}

@Serializable
data class AgencyTransferItem(
    val id: String,
    val agency_id: String,
    val host_id: String,
    val amount: Long = 0,
    val transfer_type: String = "earnings",
    val status: String = "completed",
    val host_name: String? = null,
    val host_uid: String? = null,
    val gift_earnings: Long? = null,
    val call_earnings: Long? = null,
    val commission_rate: Double? = null,
    val created_at: String? = null,
)
