package com.merilive.app.ui.agency

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.merilive.app.data.repository.AgencyRankingData
import com.merilive.app.data.repository.AgencyRepository
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import javax.inject.Inject

data class AgencyRankingsUiState(
    val loading: Boolean = true,
    val rankings: List<AgencyRankingData> = emptyList(),
    val periodType: String = "weekly",
)

@HiltViewModel
class AgencyRankingsViewModel @Inject constructor(
    private val agencyRepository: AgencyRepository,
) : ViewModel() {

    private val _state = MutableStateFlow(AgencyRankingsUiState())
    val state = _state.asStateFlow()

    fun loadRankings(periodType: String) {
        viewModelScope.launch {
            _state.value = _state.value.copy(loading = true, periodType = periodType)
            try {
                val rankings = agencyRepository.getAgencyRankings(periodType)
                _state.value = _state.value.copy(loading = false, rankings = rankings)
            } catch (_: Exception) {
                _state.value = _state.value.copy(loading = false)
            }
        }
    }
}
