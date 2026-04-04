package com.merilive.app.ui.agency

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.merilive.app.data.repository.*
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import javax.inject.Inject

data class AgencyDashboardUiState(
    val loading: Boolean = true,
    val agency: AgencyData? = null,
    val hosts: List<AgencyHostData> = emptyList(),
    val pendingRequests: List<HostRequestData> = emptyList(),
    val performance: AgencyPerformanceData? = null,
    val levelTiers: List<AgencyLevelTierData> = emptyList(),
    val subAgents: List<SubAgentData> = emptyList(),
    val commissionHistory: List<CommissionHistoryItem> = emptyList(),
    val activeTab: String = "overview",
)

data class CommissionHistoryItem(
    val id: String,
    val hostName: String,
    val amount: Int,
    val rate: Double,
    val type: String,
    val date: String,
)

@HiltViewModel
class AgencyDashboardViewModel @Inject constructor(
    private val agencyRepository: AgencyRepository,
) : ViewModel() {

    private val _state = MutableStateFlow(AgencyDashboardUiState())
    val state = _state.asStateFlow()

    fun loadDashboard() {
        viewModelScope.launch {
            _state.value = _state.value.copy(loading = true)
            try {
                val agency = agencyRepository.getMyAgency() ?: run {
                    _state.value = _state.value.copy(loading = false)
                    return@launch
                }

                val hosts = agencyRepository.getAgencyHosts(agency.id)
                val pending = agencyRepository.getPendingRequests(agency.agency_code ?: "")
                val performance = agencyRepository.getAgencyPerformance(agency.id, "weekly")
                val tiers = agencyRepository.getAgencyLevelTiers()
                val subAgents = if (agency.parent_agency_id == null) {
                    agencyRepository.getSubAgents(agency.id)
                } else emptyList()

                // Load commission history
                val commissions = try {
                    agencyRepository.getCommissionHistory(agency.id)
                } catch (_: Exception) { emptyList() }

                _state.value = _state.value.copy(
                    loading = false,
                    agency = agency,
                    hosts = hosts,
                    pendingRequests = pending,
                    performance = performance,
                    levelTiers = tiers,
                    subAgents = subAgents,
                    commissionHistory = commissions.map {
                        CommissionHistoryItem(
                            id = it.id,
                            hostName = it.host_name ?: "Host",
                            amount = it.commission_amount?.toInt() ?: 0,
                            rate = it.commission_rate ?: 0.0,
                            type = it.transaction_type ?: "",
                            date = it.created_at ?: "",
                        )
                    }
                )
            } catch (e: Exception) {
                _state.value = _state.value.copy(loading = false)
            }
        }
    }

    fun switchTab(tab: String) {
        _state.value = _state.value.copy(activeTab = tab)
    }

    fun approveRequest(requestId: String) {
        viewModelScope.launch {
            agencyRepository.approveHostRequest(requestId)
            loadDashboard()
        }
    }

    fun rejectRequest(requestId: String) {
        viewModelScope.launch {
            agencyRepository.rejectHostRequest(requestId, "Rejected by agency owner")
            loadDashboard()
        }
    }

    fun removeHost(hostId: String) {
        viewModelScope.launch {
            val agencyId = _state.value.agency?.id ?: return@launch
            agencyRepository.removeHost(agencyId, hostId)
            loadDashboard()
        }
    }
}
