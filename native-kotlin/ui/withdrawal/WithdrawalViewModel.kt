package com.merilive.app.ui.withdrawal

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.merilive.app.data.repository.TaskRepository
import dagger.hilt.android.lifecycle.HiltViewModel
import io.github.jan.supabase.auth.Auth
import io.github.jan.supabase.postgrest.Postgrest
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import kotlinx.serialization.Serializable
import javax.inject.Inject

data class WithdrawalUiState(
    val loading: Boolean = true,
    val beans: Int = 0,
    val submitted: Boolean = false,
)

@HiltViewModel
class WithdrawalViewModel @Inject constructor(
    private val auth: Auth,
    private val postgrest: Postgrest,
    private val taskRepository: TaskRepository,
) : ViewModel() {

    private val _state = MutableStateFlow(WithdrawalUiState())
    val state = _state.asStateFlow()

    fun loadData() {
        viewModelScope.launch {
            try {
                val userId = auth.currentSessionOrNull()?.user?.id ?: return@launch
                @Serializable data class BeansRow(val beans: Int? = null)
                val profile = postgrest.from("profiles")
                    .select {
                        filter { eq("id", userId) }
                    }
                    .decodeSingle<BeansRow>()
                _state.value = _state.value.copy(loading = false, beans = profile.beans ?: 0)
            } catch (_: Exception) {
                _state.value = _state.value.copy(loading = false)
            }
        }
    }

    fun submitWithdrawal(amount: Int, method: String, accountNumber: String, accountName: String) {
        viewModelScope.launch {
            _state.value = _state.value.copy(loading = true)
            try {
                val success = taskRepository.submitWithdrawal(amount, method, accountNumber, accountName)
                _state.value = _state.value.copy(loading = false, submitted = success)
            } catch (_: Exception) {
                _state.value = _state.value.copy(loading = false)
            }
        }
    }

    fun resetSubmitted() {
        _state.value = _state.value.copy(submitted = false)
    }
}
