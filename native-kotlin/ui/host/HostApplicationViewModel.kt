package com.merilive.app.ui.host

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.merilive.app.data.repository.HostApplicationData
import com.merilive.app.data.repository.TaskRepository
import dagger.hilt.android.lifecycle.HiltViewModel
import io.github.jan.supabase.auth.Auth
import io.github.jan.supabase.postgrest.Postgrest
import io.github.jan.supabase.postgrest.query.Columns
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import kotlinx.serialization.Serializable
import javax.inject.Inject

data class FoundUser(
    val id: String,
    val display_name: String?,
    val avatar_url: String?,
    val app_uid: String?,
    val is_host: Boolean?,
)

data class HostAppUiState(
    val loading: Boolean = false,
    val foundUser: FoundUser? = null,
    val userNotFound: Boolean = false,
    val appVerified: Boolean = false,
    val emailVerified: Boolean = false,
    val appCodeSent: Boolean = false,
    val emailCodeSent: Boolean = false,
    val generatedAppCode: String = "",
    val generatedEmailCode: String = "",
    val existingApplication: HostApplicationData? = null,
    val submitted: Boolean = false,
)

@HiltViewModel
class HostApplicationViewModel @Inject constructor(
    private val auth: Auth,
    private val postgrest: Postgrest,
    private val taskRepository: TaskRepository,
) : ViewModel() {

    private val _state = MutableStateFlow(HostAppUiState())
    val state = _state.asStateFlow()

    fun checkExistingApplication() {
        viewModelScope.launch {
            _state.value = _state.value.copy(loading = true)
            try {
                val existing = taskRepository.getHostApplicationStatus()
                _state.value = _state.value.copy(
                    loading = false,
                    existingApplication = existing
                )
            } catch (_: Exception) {
                _state.value = _state.value.copy(loading = false)
            }
        }
    }

    fun searchUser(uid: String) {
        viewModelScope.launch {
            _state.value = _state.value.copy(loading = true, userNotFound = false, foundUser = null)
            try {
                @Serializable
                data class SearchResult(
                    val id: String,
                    val display_name: String? = null,
                    val avatar_url: String? = null,
                    val app_uid: String? = null,
                    val is_host: Boolean? = null,
                )
                val result = postgrest.rpc("search_user_by_app_uid", mapOf("_app_uid" to uid.uppercase()))
                    .decodeList<SearchResult>()

                if (result.isNotEmpty()) {
                    val u = result.first()
                    _state.value = _state.value.copy(
                        loading = false,
                        foundUser = FoundUser(u.id, u.display_name, u.avatar_url, u.app_uid, u.is_host)
                    )
                } else {
                    _state.value = _state.value.copy(loading = false, userNotFound = true)
                }
            } catch (_: Exception) {
                _state.value = _state.value.copy(loading = false, userNotFound = true)
            }
        }
    }

    fun sendAppVerification() {
        val code = (100000..999999).random().toString()
        _state.value = _state.value.copy(generatedAppCode = code, appCodeSent = true)
        // In production, send via in-app notification
    }

    fun verifyAppCode(code: String) {
        if (code == _state.value.generatedAppCode) {
            _state.value = _state.value.copy(appVerified = true)
        }
    }

    fun sendEmailVerification(email: String) {
        val code = (100000..999999).random().toString()
        _state.value = _state.value.copy(generatedEmailCode = code, emailCodeSent = true)
        // In production, send via edge function
    }

    fun verifyEmailCode(code: String) {
        if (code == _state.value.generatedEmailCode) {
            _state.value = _state.value.copy(emailVerified = true)
        }
    }

    fun submitApplication() {
        viewModelScope.launch {
            _state.value = _state.value.copy(loading = true)
            try {
                val success = taskRepository.submitHostApplication(
                    agencyCode = "",
                    fullName = _state.value.foundUser?.display_name ?: "",
                    age = 18,
                    language = "en",
                    photoUrl = _state.value.foundUser?.avatar_url ?: "",
                    videoUrl = ""
                )
                _state.value = _state.value.copy(loading = false, submitted = success)
            } catch (_: Exception) {
                _state.value = _state.value.copy(loading = false)
            }
        }
    }
}
