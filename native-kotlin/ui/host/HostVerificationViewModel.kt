package com.merilive.app.ui.host

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.merilive.app.data.repository.TaskRepository
import dagger.hilt.android.lifecycle.HiltViewModel
import io.github.jan.supabase.postgrest.Postgrest
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import kotlinx.serialization.Serializable
import javax.inject.Inject

data class HostVerificationUiState(
    val loading: Boolean = false,
    val currentStep: Int = 1,
    val fullName: String = "",
    val age: Int = 18,
    val language: String = "en",
    val photoUrl: String? = null,
    val videoUrl: String? = null,
    val agencyCode: String = "",
    val agencyVerified: Boolean = false,
    val submitted: Boolean = false,
)

@HiltViewModel
class HostVerificationViewModel @Inject constructor(
    private val postgrest: Postgrest,
    private val taskRepository: TaskRepository,
) : ViewModel() {

    private val _state = MutableStateFlow(HostVerificationUiState())
    val state = _state.asStateFlow()

    fun setBasicInfo(name: String, age: Int, language: String) {
        _state.value = _state.value.copy(fullName = name, age = age, language = language)
    }

    fun nextStep() {
        _state.value = _state.value.copy(currentStep = _state.value.currentStep + 1)
    }

    fun searchAgency(code: String) {
        viewModelScope.launch {
            _state.value = _state.value.copy(loading = true)
            try {
                @Serializable data class AgencyResult(val id: String, val name: String? = null)
                val result = postgrest.from("agencies")
                    .select {
                        filter { eq("agency_code", code.uppercase()) }
                        limit(1)
                    }
                    .decodeList<AgencyResult>()

                _state.value = _state.value.copy(
                    loading = false,
                    agencyCode = code,
                    agencyVerified = result.isNotEmpty()
                )
            } catch (_: Exception) {
                _state.value = _state.value.copy(loading = false)
            }
        }
    }

    fun submitVerification() {
        viewModelScope.launch {
            _state.value = _state.value.copy(loading = true)
            try {
                val s = _state.value
                val success = taskRepository.submitHostApplication(
                    agencyCode = s.agencyCode,
                    fullName = s.fullName,
                    age = s.age,
                    language = s.language,
                    photoUrl = s.photoUrl ?: "",
                    videoUrl = s.videoUrl ?: ""
                )
                _state.value = _state.value.copy(loading = false, submitted = success)
            } catch (_: Exception) {
                _state.value = _state.value.copy(loading = false)
            }
        }
    }
}
