package com.merilive.app.ui.trader

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.merilive.app.data.repository.TraderRepository
import com.merilive.app.data.repository.TraderWalletInfo
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import javax.inject.Inject

data class TraderWalletState(
    val loading: Boolean = false,
    val wallet: TraderWalletInfo = TraderWalletInfo(),
    val error: String? = null
)

@HiltViewModel
class TraderWalletViewModel @Inject constructor(
    private val repository: TraderRepository
) : ViewModel() {

    private val _state = MutableStateFlow(TraderWalletState())
    val state = _state.asStateFlow()

    fun loadWallet() {
        viewModelScope.launch {
            _state.update { it.copy(loading = true) }
            repository.getWalletInfo()
                .onSuccess { info -> _state.update { it.copy(loading = false, wallet = info) } }
                .onFailure { e -> _state.update { it.copy(loading = false, error = e.message) } }
        }
    }
}
