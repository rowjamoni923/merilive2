package com.merilive.app.ui.agency

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.merilive.app.data.repository.AgencyRepository
import com.merilive.app.data.repository.SubAgentData
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import javax.inject.Inject

data class SubAgentsUiState(
    val loading: Boolean = true,
    val subAgents: List<SubAgentData> = emptyList(),
)

@HiltViewModel
class SubAgentsViewModel @Inject constructor(
    private val agencyRepository: AgencyRepository,
) : ViewModel() {

    private val _state = MutableStateFlow(SubAgentsUiState())
    val state = _state.asStateFlow()

    fun loadSubAgents() {
        viewModelScope.launch {
            try {
                val agency = agencyRepository.getMyAgency()
                val subs = if (agency != null) agencyRepository.getSubAgents(agency.id) else emptyList()
                _state.value = _state.value.copy(loading = false, subAgents = subs)
            } catch (_: Exception) {
                _state.value = _state.value.copy(loading = false)
            }
        }
    }
}
