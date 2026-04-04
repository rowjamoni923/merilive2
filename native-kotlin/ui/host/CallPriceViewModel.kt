package com.merilive.app.ui.host

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import dagger.hilt.android.lifecycle.HiltViewModel
import io.github.jan.supabase.auth.Auth
import io.github.jan.supabase.postgrest.Postgrest
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import kotlinx.serialization.Serializable
import javax.inject.Inject

data class CallPriceUiState(
    val loading: Boolean = true,
    val videoPrice: Int = 0,
    val audioPrice: Int = 0,
    val saved: Boolean = false,
)

@HiltViewModel
class CallPriceViewModel @Inject constructor(
    private val auth: Auth,
    private val postgrest: Postgrest,
) : ViewModel() {

    private val _state = MutableStateFlow(CallPriceUiState())
    val state = _state.asStateFlow()

    fun loadCallPrices() {
        viewModelScope.launch {
            try {
                val userId = auth.currentSessionOrNull()?.user?.id ?: return@launch
                @Serializable
                data class PriceRow(
                    val video_call_price: Int? = null,
                    val audio_call_price: Int? = null,
                )
                val result = postgrest.from("profiles")
                    .select {
                        filter { eq("id", userId) }
                    }
                    .decodeSingle<PriceRow>()

                _state.value = _state.value.copy(
                    loading = false,
                    videoPrice = result.video_call_price ?: 60,
                    audioPrice = result.audio_call_price ?: 40,
                )
            } catch (_: Exception) {
                _state.value = _state.value.copy(loading = false)
            }
        }
    }

    fun updateCallPrices(videoPrice: Int, audioPrice: Int) {
        viewModelScope.launch {
            _state.value = _state.value.copy(loading = true)
            try {
                val userId = auth.currentSessionOrNull()?.user?.id ?: return@launch
                postgrest.from("profiles").update(mapOf(
                    "video_call_price" to videoPrice.toString(),
                    "audio_call_price" to audioPrice.toString()
                )) {
                    filter { eq("id", userId) }
                }
                _state.value = _state.value.copy(
                    loading = false,
                    videoPrice = videoPrice,
                    audioPrice = audioPrice,
                    saved = true
                )
            } catch (_: Exception) {
                _state.value = _state.value.copy(loading = false)
            }
        }
    }

    fun resetSaved() {
        _state.value = _state.value.copy(saved = false)
    }
}
