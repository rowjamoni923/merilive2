package com.merilive.app.ui.trader

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.merilive.app.data.repository.TraderRepository
import com.merilive.app.data.repository.UserSearchResult
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import javax.inject.Inject

data class TraderTransferState(
    val loading: Boolean = false,
    val foundUser: UserSearchResult? = null,
    val success: Boolean = false,
    val error: String? = null
)

@HiltViewModel
class TraderTransferViewModel @Inject constructor(
    private val repository: TraderRepository
) : ViewModel() {

    private val _state = MutableStateFlow(TraderTransferState())
    val state = _state.asStateFlow()

    fun searchUser(uid: String) {
        viewModelScope.launch {
            _state.update { it.copy(loading = true, foundUser = null, error = null) }
            repository.searchUserByUid(uid)
                .onSuccess { user ->
                    if (user != null) _state.update { it.copy(loading = false, foundUser = user) }
                    else _state.update { it.copy(loading = false, error = "User not found") }
                }
                .onFailure { e -> _state.update { it.copy(loading = false, error = e.message) } }
        }
    }

    fun transfer(amount: Long, notes: String?) {
        val userId = _state.value.foundUser?.id ?: return
        viewModelScope.launch {
            _state.update { it.copy(loading = true, error = null) }
            repository.transferToUser(userId, amount, notes)
                .onSuccess { _state.update { it.copy(loading = false, success = true) } }
                .onFailure { e -> _state.update { it.copy(loading = false, error = e.message) } }
        }
    }

    fun clearError() { _state.update { it.copy(error = null) } }
}
