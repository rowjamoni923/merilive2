package com.merilive.app.util

import android.content.Context
import android.util.Log
import com.merilive.app.util.SecureStorage
import io.github.jan.supabase.auth.Auth
import io.github.jan.supabase.auth.status.SessionStatus
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow

sealed class AuthState {
    object Loading : AuthState()
    object Authenticated : AuthState()
    object Unauthenticated : AuthState()
    data class Error(val message: String) : AuthState()
}

class SessionManager(
    private val context: Context,
    private val auth: Auth,
) {
    private val _authState = MutableStateFlow<AuthState>(AuthState.Loading)
    val authState = _authState.asStateFlow()

    val currentUserId: String?
        get() = auth.currentUserOrNull()?.id

    val accessToken: String?
        get() = auth.currentSessionOrNull()?.accessToken

    val isLoggedIn: Boolean
        get() = currentUserId != null

    suspend fun initialize() {
        try {
            auth.sessionStatus.collect { status ->
                when (status) {
                    is SessionStatus.Authenticated -> {
                        saveTokens()
                        _authState.value = AuthState.Authenticated
                    }
                    is SessionStatus.NotAuthenticated -> {
                        clearTokens()
                        _authState.value = AuthState.Unauthenticated
                    }
                    is SessionStatus.Initializing -> {
                        _authState.value = AuthState.Loading
                    }
                    else -> {}
                }
            }
        } catch (e: Exception) {
            Log.e("SessionManager", "Init failed", e)
            _authState.value = AuthState.Error(e.message ?: "Session error")
        }
    }

    suspend fun signOut() {
        try {
            auth.signOut()
            clearTokens()
            _authState.value = AuthState.Unauthenticated
        } catch (e: Exception) {
            Log.e("SessionManager", "Sign out failed", e)
        }
    }

    private fun saveTokens() {
        val session = auth.currentSessionOrNull() ?: return
        SecureStorage.saveToken(context, AppConstants.PREF_ACCESS_TOKEN, session.accessToken)
        SecureStorage.saveToken(context, AppConstants.PREF_REFRESH_TOKEN, session.refreshToken)
        SecureStorage.saveToken(context, AppConstants.PREF_USER_ID, auth.currentUserOrNull()?.id ?: "")
    }

    private fun clearTokens() {
        SecureStorage.clearAll(context)
    }
}