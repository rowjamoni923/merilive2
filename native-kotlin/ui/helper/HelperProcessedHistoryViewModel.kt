package com.merilive.app.ui.helper

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.merilive.app.data.repository.HelperProcessedItem
import com.merilive.app.data.repository.HelperRepository
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import javax.inject.Inject

data class ProcessedHistoryState(
    val loading: Boolean = false,
    val items: List<HelperProcessedItem> = emptyList(),
    val error: String? = null
)

@HiltViewModel
class HelperProcessedHistoryViewModel @Inject constructor(
    private val repository: HelperRepository
) : ViewModel() {

    private val _state = MutableStateFlow(ProcessedHistoryState())
    val state = _state.asStateFlow()

    fun loadHistory(page: Int = 0) {
        viewModelScope.launch {
            _state.update { it.copy(loading = true) }
            repository.getProcessedHistory(page)
                .onSuccess { list -> _state.update { it.copy(loading = false, items = list) } }
                .onFailure { e -> _state.update { it.copy(loading = false, error = e.message) } }
        }
    }
}
