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
import com.merilive.app.R
import com.merilive.app.databinding.FragmentAgentWalletBinding
import dagger.hilt.android.AndroidEntryPoint
import dagger.hilt.android.lifecycle.HiltViewModel
import io.github.jan.supabase.auth.Auth
import io.github.jan.supabase.postgrest.Postgrest
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import kotlinx.serialization.Serializable
import javax.inject.Inject

@AndroidEntryPoint
class AgentWalletFragment : Fragment() {

    private var _binding: FragmentAgentWalletBinding? = null
    private val binding get() = _binding!!
    private val viewModel: AgentWalletViewModel by viewModels()

    override fun onCreateView(
        inflater: LayoutInflater, container: ViewGroup?, savedInstanceState: Bundle?
    ): View {
        _binding = FragmentAgentWalletBinding.inflate(inflater, container, false)
        return binding.root
    }

    override fun onViewCreated(view: View, savedInstanceState: Bundle?) {
        super.onViewCreated(view, savedInstanceState)

        binding.btnBack.setOnClickListener { findNavController().navigateUp() }

        binding.btnWithdraw.setOnClickListener {
            findNavController().navigate(R.id.action_agentWallet_to_withdrawal)
        }

        binding.btnTransferHistory.setOnClickListener {
            findNavController().navigate(R.id.action_agentWallet_to_transferHistory)
        }

        binding.btnCommissionHistory.setOnClickListener {
            findNavController().navigate(R.id.action_agentWallet_to_commissionHistory)
        }

        viewModel.loadWallet()

        viewLifecycleOwner.lifecycleScope.launchWhenStarted {
            viewModel.state.collect { state ->
                when (state) {
                    is AgentWalletState.Loading -> {
                        binding.progressBar.visibility = View.VISIBLE
                    }
                    is AgentWalletState.Loaded -> {
                        binding.progressBar.visibility = View.GONE
                        binding.tvTotalBeans.text = "${state.walletBalance}"
                        binding.tvDiamonds.text = "${state.diamondBalance}"
                        binding.tvCommissionRate.text = "${(state.commissionRate * 100).toInt()}%"
                    }
                    is AgentWalletState.Error -> {
                        binding.progressBar.visibility = View.GONE
                    }
                }
            }
        }
    }

    override fun onDestroyView() {
        super.onDestroyView()
        _binding = null
    }
}

sealed class AgentWalletState {
    object Loading : AgentWalletState()
    data class Loaded(
        val walletBalance: Long,
        val diamondBalance: Long,
        val commissionRate: Double,
    ) : AgentWalletState()
    data class Error(val message: String) : AgentWalletState()
}

@HiltViewModel
class AgentWalletViewModel @Inject constructor(
    private val auth: Auth,
    private val postgrest: Postgrest,
) : ViewModel() {

    private val _state = MutableStateFlow<AgentWalletState>(AgentWalletState.Loading)
    val state = _state.asStateFlow()

    private val currentUserId: String
        get() = auth.currentSessionOrNull()?.user?.id ?: ""

    fun loadWallet() {
        viewModelScope.launch {
            try {
                val agencies = postgrest.from("agencies")
                    .select {
                        filter { eq("owner_id", currentUserId) }
                        limit(1)
                    }
                    .decodeList<AgencyWalletData>()

                if (agencies.isNotEmpty()) {
                    val a = agencies.first()
                    _state.value = AgentWalletState.Loaded(
                        walletBalance = a.wallet_balance ?: 0,
                        diamondBalance = a.diamond_balance ?: 0,
                        commissionRate = a.commission_rate ?: 0.0,
                    )
                } else {
                    _state.value = AgentWalletState.Error("No agency found")
                }
            } catch (e: Exception) {
                _state.value = AgentWalletState.Error(e.message ?: "Load failed")
            }
        }
    }
}

@Serializable
data class AgencyWalletData(
    val id: String,
    val wallet_balance: Long? = null,
    val diamond_balance: Long? = null,
    val commission_rate: Double? = null,
)
