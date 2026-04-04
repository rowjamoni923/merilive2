package com.merilive.app.ui.helper

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.merilive.app.data.repository.HelperRepository
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import javax.inject.Inject

data class SelfRechargeState(
    val loading: Boolean = false,
    val currentBalance: Long = 0,
    val success: Boolean = false,
    val error: String? = null
)

@HiltViewModel
class HelperSelfRechargeViewModel @Inject constructor(
    private val repository: HelperRepository
) : ViewModel() {

    private val _state = MutableStateFlow(SelfRechargeState())
    val state = _state.asStateFlow()

    fun loadBalance() {
        viewModelScope.launch {
            repository.getHelperProfile()
                .onSuccess { profile -> _state.update { it.copy(currentBalance = profile.diamond_balance) } }
        }
    }

    fun selfRecharge(amount: Long) {
        viewModelScope.launch {
            _state.update { it.copy(loading = true, error = null) }
            repository.selfRecharge(amount)
                .onSuccess { _state.update { it.copy(loading = false, success = true) } }
                .onFailure { e -> _state.update { it.copy(loading = false, error = e.message) } }
        }
    }

    fun clearError() { _state.update { it.copy(error = null) } }
}
