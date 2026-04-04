package com.merilive.app.ui.agency

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.merilive.app.data.repository.AgencyRepository
import dagger.hilt.android.lifecycle.HiltViewModel
import io.github.jan.supabase.auth.Auth
import io.github.jan.supabase.postgrest.Postgrest
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import kotlinx.serialization.Serializable
import javax.inject.Inject

data class DiamondExchangeUiState(
    val loading: Boolean = true,
    val beans: Int = 0,
    val estimatedDiamonds: Int = 0,
    val exchangeSuccess: Boolean = false,
    val lastDiamonds: Int = 0,
)

@HiltViewModel
class DiamondExchangeViewModel @Inject constructor(
    private val auth: Auth,
    private val postgrest: Postgrest,
    private val agencyRepository: AgencyRepository,
) : ViewModel() {

    private val _state = MutableStateFlow(DiamondExchangeUiState())
    val state = _state.asStateFlow()

    fun loadData() {
        viewModelScope.launch {
            try {
                val userId = auth.currentSessionOrNull()?.user?.id ?: return@launch
                @Serializable data class BeansRow(val beans: Int? = null)
                val profile = postgrest.from("profiles")
                    .select { filter { eq("id", userId) } }
                    .decodeSingle<BeansRow>()
                _state.value = _state.value.copy(
                    loading = false,
                    beans = profile.beans ?: 0,
                    estimatedDiamonds = ((profile.beans ?: 0) * 0.75).toInt() // 25% fee
                )
            } catch (_: Exception) {
                _state.value = _state.value.copy(loading = false)
            }
        }
    }

    fun exchange(beansAmount: Int) {
        viewModelScope.launch {
            _state.value = _state.value.copy(loading = true)
            try {
                val result = agencyRepository.exchangeBeansToDiamonds(beansAmount)
                if (result.success) {
                    _state.value = _state.value.copy(
                        loading = false,
                        exchangeSuccess = true,
                        lastDiamonds = result.diamonds_received
                    )
                    loadData() // Refresh balance
                } else {
                    _state.value = _state.value.copy(loading = false)
                }
            } catch (_: Exception) {
                _state.value = _state.value.copy(loading = false)
            }
        }
    }

    fun resetSuccess() { _state.value = _state.value.copy(exchangeSuccess = false) }
}
