package com.merilive.app.ui.agency

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.merilive.app.data.repository.AgencyRepository
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import javax.inject.Inject

data class AgencyWithdrawalUiState(
    val loading: Boolean = true,
    val balance: Int = 0,
    val agencyId: String = "",
    val submitted: Boolean = false,
)

@HiltViewModel
class AgencyWithdrawalViewModel @Inject constructor(
    private val agencyRepository: AgencyRepository,
) : ViewModel() {

    private val _state = MutableStateFlow(AgencyWithdrawalUiState())
    val state = _state.asStateFlow()

    fun loadData() {
        viewModelScope.launch {
            try {
                val agency = agencyRepository.getMyAgency()
                _state.value = _state.value.copy(
                    loading = false,
                    balance = agency?.wallet_balance ?: 0,
                    agencyId = agency?.id ?: ""
                )
            } catch (_: Exception) {
                _state.value = _state.value.copy(loading = false)
            }
        }
    }

    fun submitWithdrawal(amount: Int, method: String) {
        viewModelScope.launch {
            _state.value = _state.value.copy(loading = true)
            try {
                val success = agencyRepository.submitAgencyWithdrawal(
                    _state.value.agencyId, amount, method, emptyMap()
                )
                _state.value = _state.value.copy(loading = false, submitted = success)
            } catch (_: Exception) {
                _state.value = _state.value.copy(loading = false)
            }
        }
    }

    fun resetSubmitted() { _state.value = _state.value.copy(submitted = false) }
}
