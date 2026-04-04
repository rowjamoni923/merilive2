package com.merilive.app.ui.host

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
import com.merilive.app.databinding.FragmentTransferHistoryBinding
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
class TransferHistoryFragment : Fragment() {
    private var _binding: FragmentTransferHistoryBinding? = null
    private val binding get() = _binding!!
    private val viewModel: TransferHistoryViewModel by viewModels()

    override fun onCreateView(inflater: LayoutInflater, container: ViewGroup?, savedInstanceState: Bundle?): View {
        _binding = FragmentTransferHistoryBinding.inflate(inflater, container, false)
        return binding.root
    }

    override fun onViewCreated(view: View, savedInstanceState: Bundle?) {
        super.onViewCreated(view, savedInstanceState)
        binding.btnBack.setOnClickListener { findNavController().navigateUp() }
        binding.rvTransfers.layoutManager = LinearLayoutManager(requireContext())
        viewModel.loadTransfers()

        viewLifecycleOwner.lifecycleScope.launch {
            viewModel.transfers.collect { /* Set adapter */ }
        }
    }

    override fun onDestroyView() { super.onDestroyView(); _binding = null }
}

@HiltViewModel
class TransferHistoryViewModel @Inject constructor(
    private val auth: Auth,
    private val postgrest: Postgrest,
) : ViewModel() {
    private val _transfers = MutableStateFlow<List<TransferResponse>>(emptyList())
    val transfers = _transfers.asStateFlow()

    fun loadTransfers() {
        viewModelScope.launch {
            try {
                val userId = auth.currentSessionOrNull()?.user?.id ?: return@launch
                _transfers.value = postgrest.from("agency_earnings_transfers")
                    .select {
                        filter { eq("host_id", userId) }
                        order("created_at", Order.DESCENDING)
                        limit(50)
                    }
                    .decodeList()
            } catch (_: Exception) {}
        }
    }
}

@Serializable
data class TransferResponse(
    val id: String,
    val amount: Int = 0,
    val status: String = "pending",
    val transfer_type: String = "auto",
    val created_at: String? = null,
)
