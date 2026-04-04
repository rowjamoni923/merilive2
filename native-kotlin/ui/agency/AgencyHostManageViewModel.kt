package com.merilive.app.ui.agency

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.merilive.app.data.repository.AgencyRepository
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import kotlinx.serialization.Serializable
import javax.inject.Inject

@Serializable
data class AgencyHostItem(
    val id: String = "",
    val host_id: String = "",
    val display_name: String = "",
    val avatar_url: String? = null,
    val uid: String = "",
    val status: String = "active",
    val joined_at: String? = null,
    val weekly_earnings: Long = 0,
    val total_earnings: Long = 0
)

data class HostManageState(
    val loading: Boolean = false,
    val hosts: List<AgencyHostItem> = emptyList(),
    val tab: String = "active",
    val error: String? = null
)

@HiltViewModel
class AgencyHostManageViewModel @Inject constructor(
    private val repository: AgencyRepository
) : ViewModel() {

    private val _state = MutableStateFlow(HostManageState())
    val state = _state.asStateFlow()

    fun loadHosts(tab: String) {
        viewModelScope.launch {
            _state.update { it.copy(loading = true, tab = tab) }
            val result = if (tab == "pending") repository.getPendingRequests()
            else repository.getHostList()
            result
                .onSuccess { list ->
                    // Map to AgencyHostItem - repository returns appropriate model
                    _state.update { it.copy(loading = false, hosts = emptyList()) }
                }
                .onFailure { e -> _state.update { it.copy(loading = false, error = e.message) } }
        }
    }

    fun approveHost(hostId: String) {
        viewModelScope.launch {
            _state.update { it.copy(loading = true) }
            repository.approveHostRequest(hostId)
                .onSuccess { loadHosts(_state.value.tab) }
                .onFailure { e -> _state.update { it.copy(loading = false, error = e.message) } }
        }
    }

    fun rejectHost(hostId: String) {
        viewModelScope.launch {
            _state.update { it.copy(loading = true) }
            repository.rejectHostRequest(hostId)
                .onSuccess { loadHosts(_state.value.tab) }
                .onFailure { e -> _state.update { it.copy(loading = false, error = e.message) } }
        }
    }

    fun removeHost(hostId: String) {
        viewModelScope.launch {
            _state.update { it.copy(loading = true) }
            repository.removeHost(hostId)
                .onSuccess { loadHosts(_state.value.tab) }
                .onFailure { e -> _state.update { it.copy(loading = false, error = e.message) } }
        }
    }
}
