package com.merilive.app.ui.trader

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.merilive.app.data.repository.AgencySearchResult
import com.merilive.app.data.repository.TraderRepository
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import javax.inject.Inject

data class AgencyTransferState(
    val loading: Boolean = false,
    val foundAgency: AgencySearchResult? = null,
    val success: Boolean = false,
    val error: String? = null
)

@HiltViewModel
class TraderAgencyTransferViewModel @Inject constructor(
    private val repository: TraderRepository
) : ViewModel() {

    private val _state = MutableStateFlow(AgencyTransferState())
    val state = _state.asStateFlow()

    fun searchAgency(code: String) {
        viewModelScope.launch {
            _state.update { it.copy(loading = true, foundAgency = null, error = null) }
            repository.searchAgencyByCode(code)
                .onSuccess { agency ->
                    if (agency != null) _state.update { it.copy(loading = false, foundAgency = agency) }
                    else _state.update { it.copy(loading = false, error = "Agency not found") }
                }
                .onFailure { e -> _state.update { it.copy(loading = false, error = e.message) } }
        }
    }

    fun transfer(amount: Long, notes: String?) {
        val agencyId = _state.value.foundAgency?.id ?: return
        viewModelScope.launch {
            _state.update { it.copy(loading = true, error = null) }
            repository.transferToAgency(agencyId, amount, notes)
                .onSuccess { _state.update { it.copy(loading = false, success = true) } }
                .onFailure { e -> _state.update { it.copy(loading = false, error = e.message) } }
        }
    }

    fun clearError() { _state.update { it.copy(error = null) } }
}
