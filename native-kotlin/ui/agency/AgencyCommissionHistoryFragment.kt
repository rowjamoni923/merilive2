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
import com.merilive.app.ui.agency.adapter.CommissionHistoryAdapter
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
class AgencyCommissionHistoryFragment : Fragment() {

    private var _binding: FragmentSimpleListBinding? = null
    private val binding get() = _binding!!
    private val viewModel: AgencyCommissionHistoryViewModel by viewModels()

    override fun onCreateView(
        inflater: LayoutInflater, container: ViewGroup?, savedInstanceState: Bundle?
    ): View {
        _binding = FragmentSimpleListBinding.inflate(inflater, container, false)
        return binding.root
    }

    override fun onViewCreated(view: View, savedInstanceState: Bundle?) {
        super.onViewCreated(view, savedInstanceState)

        binding.tvTitle.text = "Commission History"
        binding.btnBack.setOnClickListener { findNavController().navigateUp() }

        val adapter = CommissionHistoryAdapter()
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

@HiltViewModel
class AgencyCommissionHistoryViewModel @Inject constructor(
    private val auth: Auth,
    private val postgrest: Postgrest,
) : ViewModel() {

    private val _items = MutableStateFlow<List<CommissionHistoryItem>>(emptyList())
    val items = _items.asStateFlow()

    private val currentUserId: String
        get() = auth.currentSessionOrNull()?.user?.id ?: ""

    fun loadHistory() {
        viewModelScope.launch {
            try {
                // Find user's agency
                val agencies = postgrest.from("agencies")
                    .select { filter { eq("owner_id", currentUserId) } }
                    .decodeList<AgencyIdResponse>()

                if (agencies.isNotEmpty()) {
                    val result = postgrest.from("agency_commission_history")
                        .select {
                            filter { eq("agency_id", agencies.first().id) }
                            order("created_at", Order.DESCENDING)
                            limit(100)
                        }
                        .decodeList<CommissionHistoryItem>()
                    _items.value = result
                }
            } catch (_: Exception) {}
        }
    }
}

@Serializable
data class CommissionHistoryItem(
    val id: String,
    val agency_id: String,
    val host_id: String,
    val transaction_type: String = "gift",
    val original_amount: Long = 0,
    val commission_rate: Double = 0.0,
    val commission_amount: Long = 0,
    val notes: String? = null,
    val created_at: String? = null,
)
