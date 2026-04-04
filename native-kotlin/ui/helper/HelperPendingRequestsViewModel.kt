package com.merilive.app.ui.helper

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.merilive.app.data.repository.HelperRepository
import com.merilive.app.data.repository.HelperWithdrawalRequest
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import javax.inject.Inject

data class PendingRequestsState(
    val loading: Boolean = false,
    val requests: List<HelperWithdrawalRequest> = emptyList(),
    val processingId: String? = null,
    val error: String? = null
)

@HiltViewModel
class HelperPendingRequestsViewModel @Inject constructor(
    private val repository: HelperRepository
) : ViewModel() {

    private val _state = MutableStateFlow(PendingRequestsState())
    val state = _state.asStateFlow()

    fun loadPendingRequests() {
        viewModelScope.launch {
            _state.update { it.copy(loading = true) }
            repository.getPendingRequests()
                .onSuccess { list -> _state.update { it.copy(loading = false, requests = list) } }
                .onFailure { e -> _state.update { it.copy(loading = false, error = e.message) } }
        }
    }

    fun showProcessDialog(request: HelperWithdrawalRequest) {
        _state.update { it.copy(processingId = request.id) }
    }

    fun processRequest(withdrawalId: String, transactionId: String, screenshotUrl: String?, notes: String?) {
        viewModelScope.launch {
            _state.update { it.copy(loading = true) }
            repository.processWithdrawal(withdrawalId, transactionId, screenshotUrl, notes)
                .onSuccess { loadPendingRequests() }
                .onFailure { e -> _state.update { it.copy(loading = false, error = e.message) } }
        }
    }

    fun rejectRequest(withdrawalId: String, reason: String) {
        viewModelScope.launch {
            _state.update { it.copy(loading = true) }
            repository.rejectWithdrawal(withdrawalId, reason)
                .onSuccess { loadPendingRequests() }
                .onFailure { e -> _state.update { it.copy(loading = false, error = e.message) } }
        }
    }
}
