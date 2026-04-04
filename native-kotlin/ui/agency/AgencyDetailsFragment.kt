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
import com.merilive.app.databinding.FragmentAgencyDetailsBinding
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
class AgencyDetailsFragment : Fragment() {

    private var _binding: FragmentAgencyDetailsBinding? = null
    private val binding get() = _binding!!
    private val viewModel: AgencyDetailsViewModel by viewModels()

    override fun onCreateView(
        inflater: LayoutInflater, container: ViewGroup?, savedInstanceState: Bundle?
    ): View {
        _binding = FragmentAgencyDetailsBinding.inflate(inflater, container, false)
        return binding.root
    }

    override fun onViewCreated(view: View, savedInstanceState: Bundle?) {
        super.onViewCreated(view, savedInstanceState)

        binding.btnBack.setOnClickListener { findNavController().navigateUp() }

        viewModel.loadAgencyDetails()

        viewLifecycleOwner.lifecycleScope.launchWhenStarted {
            viewModel.state.collect { state ->
                when (state) {
                    is AgencyDetailsState.Loading -> {
                        binding.progressBar.visibility = View.VISIBLE
                        binding.contentLayout.visibility = View.GONE
                    }
                    is AgencyDetailsState.Success -> {
                        binding.progressBar.visibility = View.GONE
                        binding.contentLayout.visibility = View.VISIBLE
                        val info = state.details
                        binding.tvAgencyName.text = info.name
                        binding.tvAgencyCode.text = "Code: ${info.agency_code}"
                        binding.tvLevel.text = "Level: ${info.level ?: "Standard"}"
                        binding.tvTotalHosts.text = "${info.total_hosts ?: 0}"
                        binding.tvTotalAgents.text = "${info.total_agents ?: 0}"
                        binding.tvCommissionRate.text = "${((info.commission_rate ?: 0.0) * 100).toInt()}%"
                        binding.tvBeansBalance.text = "${info.wallet_balance ?: 0}"
                        binding.tvWhatsapp.text = info.whatsapp_number ?: "N/A"
                        binding.tvEmail.text = info.email ?: "N/A"
                    }
                    is AgencyDetailsState.Error -> {
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

sealed class AgencyDetailsState {
    object Loading : AgencyDetailsState()
    data class Success(val details: AgencyFullDetails) : AgencyDetailsState()
    data class Error(val message: String) : AgencyDetailsState()
}

@Serializable
data class AgencyFullDetails(
    val id: String,
    val name: String,
    val agency_code: String,
    val level: String? = null,
    val total_hosts: Int? = null,
    val total_agents: Int? = null,
    val commission_rate: Double? = null,
    val wallet_balance: Long? = null,
    val beans_balance: Long? = null,
    val diamond_balance: Long? = null,
    val whatsapp_number: String? = null,
    val email: String? = null,
    val logo_url: String? = null,
    val is_active: Boolean? = null,
    val created_at: String? = null,
)

@HiltViewModel
class AgencyDetailsViewModel @Inject constructor(
    private val auth: Auth,
    private val postgrest: Postgrest,
) : ViewModel() {

    private val _state = MutableStateFlow<AgencyDetailsState>(AgencyDetailsState.Loading)
    val state = _state.asStateFlow()

    private val currentUserId: String
        get() = auth.currentSessionOrNull()?.user?.id ?: ""

    fun loadAgencyDetails() {
        viewModelScope.launch {
            try {
                // Find agency where user is owner
                val agencies = postgrest.from("agencies")
                    .select {
                        filter { eq("owner_id", currentUserId) }
                        limit(1)
                    }
                    .decodeList<AgencyFullDetails>()

                if (agencies.isNotEmpty()) {
                    _state.value = AgencyDetailsState.Success(agencies.first())
                } else {
                    // Check if user is a host in an agency
                    val hostRecord = postgrest.from("agency_hosts")
                        .select {
                            filter {
                                eq("host_id", currentUserId)
                                eq("status", "active")
                            }
                            limit(1)
                        }
                        .decodeList<AgencyHostRecord>()

                    if (hostRecord.isNotEmpty()) {
                        val agency = postgrest.from("agencies")
                            .select {
                                filter { eq("id", hostRecord.first().agency_id) }
                                limit(1)
                            }
                            .decodeList<AgencyFullDetails>()
                        if (agency.isNotEmpty()) {
                            _state.value = AgencyDetailsState.Success(agency.first())
                        }
                    } else {
                        _state.value = AgencyDetailsState.Error("No agency found")
                    }
                }
            } catch (e: Exception) {
                _state.value = AgencyDetailsState.Error(e.message ?: "Failed to load")
            }
        }
    }
}

@Serializable
data class AgencyHostRecord(
    val id: String,
    val agency_id: String,
    val host_id: String,
    val status: String? = null,
)
