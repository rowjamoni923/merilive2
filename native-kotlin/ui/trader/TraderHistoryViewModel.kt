package com.merilive.app.ui.trader

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.merilive.app.data.repository.TraderRepository
import com.merilive.app.data.repository.TraderTransferRecord
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import javax.inject.Inject

data class TraderHistoryState(
    val loading: Boolean = false,
    val items: List<TraderTransferRecord> = emptyList(),
    val error: String? = null
)

@HiltViewModel
class TraderHistoryViewModel @Inject constructor(
    private val repository: TraderRepository
) : ViewModel() {

    private val _state = MutableStateFlow(TraderHistoryState())
    val state = _state.asStateFlow()

    fun loadHistory(page: Int = 0) {
        viewModelScope.launch {
            _state.update { it.copy(loading = true) }
            repository.getTransferHistory(page)
                .onSuccess { list -> _state.update { it.copy(loading = false, items = list) } }
                .onFailure { e -> _state.update { it.copy(loading = false, error = e.message) } }
        }
    }
}
