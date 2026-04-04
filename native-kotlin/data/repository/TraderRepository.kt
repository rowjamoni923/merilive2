package com.merilive.app.data.repository

import io.github.jan.supabase.functions.Functions
import io.github.jan.supabase.postgrest.Postgrest
import io.github.jan.supabase.postgrest.rpc
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put
import javax.inject.Inject

// ─── Models ───
@Serializable
data class TraderWalletInfo(
    val diamond_balance: Long = 0,
    val total_transferred: Long = 0,
    val total_received: Long = 0,
    val display_name: String = "",
    val level: Int = 0
)

@Serializable
data class TraderTransferRecord(
    val id: String = "",
    val amount: Long = 0,
    val transfer_type: String = "",
    val target_name: String? = null,
    val target_uid: String? = null,
    val status: String = "completed",
    val created_at: String = "",
    val notes: String? = null
)

@Serializable
data class UserSearchResult(
    val id: String = "",
    val display_name: String = "",
    val uid: String = "",
    val avatar_url: String? = null
)

@Serializable
data class AgencySearchResult(
    val id: String = "",
    val name: String = "",
    val agency_code: String = "",
    val logo_url: String? = null
)

// ─── Interface ───
interface TraderRepository {
    suspend fun getWalletInfo(): Result<TraderWalletInfo>
    suspend fun getTransferHistory(page: Int = 0, limit: Int = 20): Result<List<TraderTransferRecord>>
    suspend fun transferToUser(userId: String, amount: Long, notes: String?): Result<Boolean>
    suspend fun transferToAgency(agencyId: String, amount: Long, notes: String?): Result<Boolean>
    suspend fun searchUserByUid(uid: String): Result<UserSearchResult?>
    suspend fun searchAgencyByCode(code: String): Result<AgencySearchResult?>
}

// ─── Implementation ───
class TraderRepositoryImpl @Inject constructor(
    private val postgrest: Postgrest,
    private val functions: Functions
) : TraderRepository {

    override suspend fun getWalletInfo(): Result<TraderWalletInfo> = runCatching {
        postgrest.rpc("get_trader_wallet_info").decodeSingle<TraderWalletInfo>()
    }

    override suspend fun getTransferHistory(page: Int, limit: Int): Result<List<TraderTransferRecord>> = runCatching {
        postgrest.rpc("get_trader_transfer_history", buildJsonObject {
            put("p_offset", page * limit)
            put("p_limit", limit)
        }).decodeList<TraderTransferRecord>()
    }

    override suspend fun transferToUser(userId: String, amount: Long, notes: String?): Result<Boolean> = runCatching {
        postgrest.rpc("trader_transfer_to_user", buildJsonObject {
            put("p_target_user_id", userId)
            put("p_amount", amount)
            put("p_notes", notes)
        })
        true
    }

    override suspend fun transferToAgency(agencyId: String, amount: Long, notes: String?): Result<Boolean> = runCatching {
        postgrest.rpc("trader_transfer_to_agency", buildJsonObject {
            put("p_target_agency_id", agencyId)
            put("p_amount", amount)
            put("p_notes", notes)
        })
        true
    }

    override suspend fun searchUserByUid(uid: String): Result<UserSearchResult?> = runCatching {
        postgrest.rpc("search_user_by_uid", buildJsonObject {
            put("p_uid", uid)
        }).decodeSingleOrNull<UserSearchResult>()
    }

    override suspend fun searchAgencyByCode(code: String): Result<AgencySearchResult?> = runCatching {
        postgrest.rpc("search_agency_by_code", buildJsonObject {
            put("p_code", code)
        }).decodeSingleOrNull<AgencySearchResult>()
    }
}
