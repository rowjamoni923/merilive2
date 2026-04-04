package com.merilive.app.data.repository

import io.github.jan.supabase.functions.Functions
import io.github.jan.supabase.postgrest.Postgrest
import io.github.jan.supabase.postgrest.query.Columns
import io.github.jan.supabase.postgrest.rpc
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put
import javax.inject.Inject

// ─── Models ───
@Serializable
data class HelperProfile(
    val id: String = "",
    val user_id: String = "",
    val display_name: String = "",
    val avatar_url: String? = null,
    val diamond_balance: Long = 0,
    val total_processed: Long = 0,
    val total_earned: Long = 0,
    val commission_rate: Double = 0.12,
    val is_active: Boolean = true,
    val is_verified: Boolean = false,
    val level: Int = 0,
    val country_code: String? = null,
    val payment_methods: List<HelperPaymentMethod> = emptyList()
)

@Serializable
data class HelperPaymentMethod(
    val method_type: String = "",
    val account_number: String = "",
    val account_name: String? = null,
    val is_primary: Boolean = false
)

@Serializable
data class HelperWithdrawalRequest(
    val id: String = "",
    val agency_id: String = "",
    val agency_name: String? = null,
    val amount: Long = 0,
    val payment_method: String? = null,
    val payment_details: String? = null,
    val status: String = "pending",
    val requested_at: String = "",
    val country_code: String? = null,
    val currency_code: String? = null,
    val local_currency_amount: Double? = null
)

@Serializable
data class HelperProcessedItem(
    val id: String = "",
    val agency_name: String? = null,
    val amount: Long = 0,
    val diamond_reward: Long = 0,
    val helper_net_reward: Long = 0,
    val status: String = "",
    val processed_at: String? = null,
    val transaction_id: String? = null
)

@Serializable
data class HelperDashboardStats(
    val totalDiamonds: Long = 0,
    val totalProcessed: Long = 0,
    val totalEarned: Long = 0,
    val pendingCount: Int = 0,
    val todayProcessed: Int = 0,
    val commissionRate: Double = 0.12
)

// ─── Interface ───
interface HelperRepository {
    suspend fun getHelperProfile(): Result<HelperProfile>
    suspend fun getDashboardStats(): Result<HelperDashboardStats>
    suspend fun getPendingRequests(): Result<List<HelperWithdrawalRequest>>
    suspend fun getProcessedHistory(page: Int = 0, limit: Int = 20): Result<List<HelperProcessedItem>>
    suspend fun processWithdrawal(
        withdrawalId: String,
        transactionId: String,
        screenshotUrl: String?,
        notes: String?
    ): Result<Boolean>
    suspend fun rejectWithdrawal(withdrawalId: String, reason: String): Result<Boolean>
    suspend fun selfRecharge(amount: Long): Result<Boolean>
}

// ─── Implementation ───
class HelperRepositoryImpl @Inject constructor(
    private val postgrest: Postgrest,
    private val functions: Functions
) : HelperRepository {

    override suspend fun getHelperProfile(): Result<HelperProfile> = runCatching {
        postgrest.rpc("get_helper_profile").decodeSingle<HelperProfile>()
    }

    override suspend fun getDashboardStats(): Result<HelperDashboardStats> = runCatching {
        postgrest.rpc("get_helper_dashboard_stats").decodeSingle<HelperDashboardStats>()
    }

    override suspend fun getPendingRequests(): Result<List<HelperWithdrawalRequest>> = runCatching {
        postgrest.rpc("get_helper_pending_withdrawals").decodeList<HelperWithdrawalRequest>()
    }

    override suspend fun getProcessedHistory(page: Int, limit: Int): Result<List<HelperProcessedItem>> = runCatching {
        postgrest.rpc("get_helper_processed_history", buildJsonObject {
            put("p_offset", page * limit)
            put("p_limit", limit)
        }).decodeList<HelperProcessedItem>()
    }

    override suspend fun processWithdrawal(
        withdrawalId: String,
        transactionId: String,
        screenshotUrl: String?,
        notes: String?
    ): Result<Boolean> = runCatching {
        postgrest.rpc("helper_process_withdrawal", buildJsonObject {
            put("p_withdrawal_id", withdrawalId)
            put("p_transaction_id", transactionId)
            put("p_screenshot_url", screenshotUrl)
            put("p_notes", notes)
        })
        true
    }

    override suspend fun rejectWithdrawal(withdrawalId: String, reason: String): Result<Boolean> = runCatching {
        postgrest.rpc("helper_reject_withdrawal", buildJsonObject {
            put("p_withdrawal_id", withdrawalId)
            put("p_reason", reason)
        })
        true
    }

    override suspend fun selfRecharge(amount: Long): Result<Boolean> = runCatching {
        postgrest.rpc("helper_transfer_diamonds_to_self", buildJsonObject {
            put("p_amount", amount)
        })
        true
    }
}
