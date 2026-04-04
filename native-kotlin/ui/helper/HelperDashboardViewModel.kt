package com.merilive.app.ui.helper

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.merilive.app.data.repository.HelperDashboardStats
import com.merilive.app.data.repository.HelperRepository
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import javax.inject.Inject

data class HelperDashboardState(
    val loading: Boolean = false,
    val stats: HelperDashboardStats = HelperDashboardStats(),
    val error: String? = null
)

@HiltViewModel
class HelperDashboardViewModel @Inject constructor(
    private val repository: HelperRepository
) : ViewModel() {

    private val _state = MutableStateFlow(HelperDashboardState())
    val state = _state.asStateFlow()

    fun loadDashboard() {
        viewModelScope.launch {
            _state.update { it.copy(loading = true, error = null) }
            repository.getDashboardStats()
                .onSuccess { stats -> _state.update { it.copy(loading = false, stats = stats) } }
                .onFailure { e -> _state.update { it.copy(loading = false, error = e.message) } }
        }
    }

    fun clearError() { _state.update { it.copy(error = null) } }
}
