package com.merilive.app.data.repository

import io.github.jan.supabase.auth.Auth
import io.github.jan.supabase.functions.Functions
import io.github.jan.supabase.postgrest.Postgrest
import io.github.jan.supabase.postgrest.query.Order

import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json
import javax.inject.Inject

interface CallRepository {
    suspend fun initiateCall(calleeId: String, callType: String): CallResponse
    suspend fun acceptCall(callId: String): CallTokenResponse
    suspend fun rejectCall(callId: String)
    suspend fun endCall(callId: String)
    suspend fun getCallHistory(): List<CallHistoryItem>
    suspend fun getCallRates(): CallRates
}

class CallRepositoryImpl @Inject constructor(
    private val auth: Auth,
    private val postgrest: Postgrest,
    private val functions: Functions,
) : CallRepository {

    private val json = Json { ignoreUnknownKeys = true }

    override suspend fun initiateCall(calleeId: String, callType: String): CallResponse {
        val response = functions.invoke("private-call/initiate")
        return json.decodeFromString(response.decodeAs())
    }

    override suspend fun acceptCall(callId: String): CallTokenResponse {
        val response = functions.invoke("private-call/accept")
        return json.decodeFromString(response.decodeAs())
    }

    override suspend fun rejectCall(callId: String) {
        functions.invoke("private-call/reject")
    }

    override suspend fun endCall(callId: String) {
        functions.invoke("private-call/end")
    }

    override suspend fun getCallHistory(): List<CallHistoryItem> {
        val userId = auth.currentSessionOrNull()?.user?.id ?: return emptyList()
        return postgrest.from("private_calls")
            .select {
                filter {
                    or {
                        eq("caller_id", userId)
                        eq("host_id", userId)
                    }
                }
                order("created_at", Order.DESCENDING)
                limit(50)
            }
            .decodeList()
    }

    override suspend fun getCallRates(): CallRates {
        return try {
            val response = postgrest.from("app_settings")
                .select {
                    filter { eq("setting_key", "call_rates") }
                }
                .decodeSingle<AppSettingRow>()
            json.decodeFromString(response.setting_value)
        } catch (e: Exception) {
            CallRates()
        }
    }
}

@Serializable data class CallResponse(val call_id: String, val room_id: String? = null)
@Serializable data class CallTokenResponse(val token: String, val room_id: String)

@Serializable
data class CallHistoryItem(
    val id: String,
    val caller_id: String,
    val host_id: String,
    val status: String = "ended",
    val duration_seconds: Int? = null,
    val diamonds_spent: Int? = null,
    val diamonds_per_minute: Int? = null,
    val total_diamonds_deducted: Int? = null,
    val created_at: String? = null,
)

@Serializable
data class CallRates(
    val video_rate_per_minute: Int = 60,
    val audio_rate_per_minute: Int = 30,
    val grace_period_seconds: Int = 21,
)

@Serializable
data class AppSettingRow(
    val setting_key: String,
    val setting_value: String,
)
