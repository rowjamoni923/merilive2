package com.merilive.app.ui.agency

import android.os.Bundle
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import android.widget.Toast
import androidx.fragment.app.Fragment
import androidx.fragment.app.viewModels
import androidx.lifecycle.lifecycleScope
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import androidx.navigation.fragment.findNavController
import androidx.recyclerview.widget.LinearLayoutManager
import com.merilive.app.R
import com.merilive.app.databinding.FragmentAgencyBinding
import dagger.hilt.android.AndroidEntryPoint
import dagger.hilt.android.lifecycle.HiltViewModel
import io.github.jan.supabase.auth.Auth
import io.github.jan.supabase.postgrest.Postgrest
import io.github.jan.supabase.postgrest.query.Columns
import io.github.jan.supabase.postgrest.query.Order
import kotlinx.coroutines.async
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import kotlinx.serialization.Serializable
import javax.inject.Inject

@AndroidEntryPoint
class AgencyFragment : Fragment() {

    private var _binding: FragmentAgencyBinding? = null
    private val binding get() = _binding!!
    private val viewModel: AgencyViewModel by viewModels()

    override fun onCreateView(
        inflater: LayoutInflater, container: ViewGroup?, savedInstanceState: Bundle?
    ): View {
        _binding = FragmentAgencyBinding.inflate(inflater, container, false)
        return binding.root
    }

    override fun onViewCreated(view: View, savedInstanceState: Bundle?) {
        super.onViewCreated(view, savedInstanceState)

        binding.btnBack.setOnClickListener { findNavController().navigateUp() }

        binding.btnJoinAgency.setOnClickListener {
            val code = binding.etAgencyCode.text.toString().trim()
            if (code.isNotEmpty()) viewModel.joinAgency(code)
        }

        binding.rvHosts.layoutManager = LinearLayoutManager(requireContext())
        binding.rvPerformance.layoutManager = LinearLayoutManager(requireContext())

        viewModel.loadAgencyData()
        observeState()
    }

    private fun observeState() {
        viewLifecycleOwner.lifecycleScope.launchWhenStarted {
            viewModel.state.collect { state ->
                when (state) {
                    is AgencyState.Loading -> binding.progressBar.visibility = View.VISIBLE
                    is AgencyState.NoAgency -> {
                        binding.progressBar.visibility = View.GONE
                        binding.joinSection.visibility = View.VISIBLE
                        binding.dashboardSection.visibility = View.GONE
                    }
                    is AgencyState.Dashboard -> {
                        binding.progressBar.visibility = View.GONE
                        binding.joinSection.visibility = View.GONE
                        binding.dashboardSection.visibility = View.VISIBLE

                        binding.tvAgencyName.text = state.agency.name
                        binding.tvAgencyCode.text = "Code: ${state.agency.code}"
                        binding.tvLevel.text = "Level: ${state.agency.level}"
                        binding.tvTotalHosts.text = "${state.agency.totalHosts}"
                        binding.tvCommissionRate.text = "${state.agency.commissionRate}%"
                        binding.tvBeansBalance.text = "${state.agency.beansBalance}"
                        binding.tvDiamondBalance.text = "${state.agency.diamondBalance}"

                        binding.rvHosts.adapter = AgencyHostAdapter(state.hosts)
                    }
                    is AgencyState.Joined -> {
                        Toast.makeText(requireContext(),
                            "✅ Joined ${state.agencyName}!", Toast.LENGTH_LONG).show()
                        viewModel.loadAgencyData()
                    }
                    is AgencyState.Error -> {
                        binding.progressBar.visibility = View.GONE
                        Toast.makeText(requireContext(), state.message, Toast.LENGTH_LONG).show()
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

sealed class AgencyState {
    object Loading : AgencyState()
    object NoAgency : AgencyState()
    data class Dashboard(val agency: AgencyInfo, val hosts: List<AgencyHost>) : AgencyState()
    data class Joined(val agencyName: String) : AgencyState()
    data class Error(val message: String) : AgencyState()
}

@HiltViewModel
class AgencyViewModel @Inject constructor(
    private val auth: Auth,
    private val postgrest: Postgrest,
) : ViewModel() {

    private val _state = MutableStateFlow<AgencyState>(AgencyState.Loading)
    val state = _state.asStateFlow()

    fun loadAgencyData() {
        viewModelScope.launch {
            try {
                val userId = auth.currentSessionOrNull()?.user?.id ?: return@launch

                // Check if user is in an agency
                val membership = try {
                    postgrest.from("agency_hosts")
                        .select {
                            filter {
                                eq("host_id", userId)
                                eq("status", "active")
                            }
                        }
                        .decodeSingleOrNull<AgencyMembershipResponse>()
                } catch (_: Exception) { null }

                if (membership == null) {
                    _state.value = AgencyState.NoAgency
                    return@launch
                }

                // Load agency data + hosts in parallel
                val agencyDeferred = async {
                    postgrest.from("agencies")
                        .select {
                            filter { eq("id", membership.agency_id) }
                        }
                        .decodeSingle<AgencyResponse>()
                }

                val hostsDeferred = async {
                    postgrest.from("agency_hosts")
                        .select(Columns.raw("""
                            host_id,
                            status,
                            profiles:profiles_public!agency_hosts_host_id_fkey(display_name, avatar_url, user_level, beans)
                        """.trimIndent())) {
                            filter {
                                eq("agency_id", membership.agency_id)
                                eq("status", "active")
                            }
                        }
                        .decodeList<AgencyHostResponse>()
                }

                val agency = agencyDeferred.await()
                val hosts = hostsDeferred.await()

                _state.value = AgencyState.Dashboard(
                    agency = AgencyInfo(
                        id = agency.id,
                        name = agency.name,
                        code = agency.agency_code,
                        level = agency.level ?: "Bronze",
                        totalHosts = agency.total_hosts ?: 0,
                        commissionRate = agency.commission_rate ?: 10,
                        beansBalance = agency.beans_balance ?: 0,
                        diamondBalance = agency.diamond_balance ?: 0,
                    ),
                    hosts = hosts.map {
                        AgencyHost(
                            id = it.host_id,
                            name = it.profiles?.display_name ?: "Host",
                            avatarUrl = it.profiles?.avatar_url,
                            level = it.profiles?.user_level ?: 1,
                            beans = it.profiles?.beans ?: 0,
                        )
                    }
                )
            } catch (e: Exception) {
                _state.value = AgencyState.Error(e.message ?: "Failed")
            }
        }
    }

    fun joinAgency(code: String) {
        viewModelScope.launch {
            try {
                val userId = auth.currentSessionOrNull()?.user?.id ?: return@launch

                // Find agency by code
                val agency = postgrest.from("agencies")
                    .select(Columns.raw("id, name")) {
                        filter {
                            eq("agency_code", code)
                            eq("is_active", true)
                        }
                    }
                    .decodeSingleOrNull<AgencyBasicResponse>()
                    ?: throw Exception("Agency not found with code: $code")

                // Insert membership
                postgrest.from("agency_hosts").insert(mapOf(
                    "agency_id" to agency.id,
                    "host_id" to userId,
                    "status" to "active",
                    "referral_code" to code,
                ))

                _state.value = AgencyState.Joined(agency.name)
            } catch (e: Exception) {
                _state.value = AgencyState.Error(e.message ?: "Failed to join")
            }
        }
    }
}

data class AgencyInfo(
    val id: String, val name: String, val code: String,
    val level: String, val totalHosts: Int, val commissionRate: Int,
    val beansBalance: Int, val diamondBalance: Int,
)

data class AgencyHost(
    val id: String, val name: String, val avatarUrl: String?,
    val level: Int, val beans: Int,
)

@Serializable data class AgencyMembershipResponse(val agency_id: String)
@Serializable data class AgencyBasicResponse(val id: String, val name: String)
@Serializable
data class AgencyResponse(
    val id: String, val name: String, val agency_code: String,
    val level: String? = null, val total_hosts: Int? = null,
    val commission_rate: Int? = null, val beans_balance: Int? = null,
    val diamond_balance: Int? = null,
)
@Serializable
data class AgencyHostResponse(
    val host_id: String, val status: String? = null,
    val profiles: AgencyHostProfile? = null,
)
@Serializable
data class AgencyHostProfile(
    val display_name: String? = null, val avatar_url: String? = null,
    val user_level: Int? = null, val beans: Int? = null,
)
