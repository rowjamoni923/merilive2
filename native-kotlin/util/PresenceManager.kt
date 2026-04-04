package com.merilive.app.util

import android.content.Context
import android.util.Log
import kotlinx.coroutines.*
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow
import io.github.jan.supabase.postgrest.Postgrest

/**
 * Manages user online/offline presence and heartbeat
 */
class PresenceManager(
    private val postgrest: Postgrest,
    private val userId: String,
) {
    private var heartbeatJob: Job? = null
    private val scope = CoroutineScope(Dispatchers.IO + SupervisorJob())

    private val _isOnline = MutableStateFlow(false)
    val isOnline = _isOnline.asStateFlow()

    fun startHeartbeat() {
        heartbeatJob?.cancel()
        heartbeatJob = scope.launch {
            while (isActive) {
                try {
                    postgrest.from("profiles").update(
                        mapOf(
                            "is_online" to true,
                            "last_seen_at" to "now()",
                        )
                    ) {
                        filter { eq("id", userId) }
                    }
                    _isOnline.value = true
                } catch (e: Exception) {
                    Log.w("PresenceManager", "Heartbeat failed", e)
                }
                delay(AppConstants.HEARTBEAT_INTERVAL_MS)
            }
        }
    }

    fun goOffline() {
        heartbeatJob?.cancel()
        _isOnline.value = false
        scope.launch {
            try {
                postgrest.from("profiles").update(
                    mapOf(
                        "is_online" to false,
                        "last_seen_at" to "now()",
                    )
                ) {
                    filter { eq("id", userId) }
                }
            } catch (e: Exception) {
                Log.w("PresenceManager", "Go offline failed", e)
            }
        }
    }

    fun destroy() {
        goOffline()
        scope.cancel()
    }
}