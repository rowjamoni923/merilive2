package com.merilive.app.data.repository

import io.github.jan.supabase.auth.Auth
import io.github.jan.supabase.postgrest.Postgrest
import io.github.jan.supabase.postgrest.query.Columns
import io.github.jan.supabase.postgrest.query.Order
import io.github.jan.supabase.postgrest.rpc
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put
import javax.inject.Inject

interface AgencyRepository {
    suspend fun getMyAgency(): AgencyData?
    suspend fun getAgencyHosts(agencyId: String): List<AgencyHostData>
    suspend fun getPendingRequests(agencyId: String): List<HostRequestData>
    suspend fun approveHostRequest(requestId: String): Boolean
    suspend fun rejectHostRequest(requestId: String, reason: String): Boolean
    suspend fun removeHost(agencyId: String, hostId: String): Boolean
    suspend fun getAgencyPerformance(agencyId: String, periodType: String): AgencyPerformanceData?
    suspend fun getAgencyWithdrawals(agencyId: String): List<AgencyWithdrawalData>
    suspend fun submitAgencyWithdrawal(agencyId: String, amount: Int, method: String, details: Map<String, String>): Boolean
    suspend fun getAgencyRankings(periodType: String): List<AgencyRankingData>
    suspend fun getSubAgents(parentAgencyId: String): List<SubAgentData>
    suspend fun getAgencyLevelTiers(): List<AgencyLevelTierData>
    suspend fun getDiamondTransactions(agencyId: String): List<DiamondTransactionData>
    suspend fun exchangeBeansToDiamonds(amount: Int): ExchangeResult
    suspend fun getAgencyCommissionHistory(agencyId: String): List<CommissionHistoryData>
    suspend fun getAgencyEarningsTransfers(agencyId: String): List<AgencyEarningsTransferData>
}

class AgencyRepositoryImpl @Inject constructor(
    private val auth: Auth,
    private val postgrest: Postgrest,
) : AgencyRepository {

    private fun currentUserId(): String? = auth.currentSessionOrNull()?.user?.id

    override suspend fun getMyAgency(): AgencyData? {
        val userId = currentUserId() ?: return null
        return try {
            postgrest.from("agencies")
                .select {
                    filter { eq("owner_id", userId) }
                    limit(1)
                }
                .decodeSingle()
        } catch (_: Exception) { null }
    }

    override suspend fun getAgencyHosts(agencyId: String): List<AgencyHostData> {
        return postgrest.from("agency_hosts")
            .select(Columns.raw("id, host_id, status, joined_at, host:profiles_public!agency_hosts_host_id_fkey(id, display_name, avatar_url, user_level, country_flag, is_verified)")) {
                filter {
                    eq("agency_id", agencyId)
                    eq("status", "active")
                }
                order("joined_at", Order.DESCENDING)
            }
            .decodeList()
    }

    override suspend fun getPendingRequests(agencyId: String): List<HostRequestData> {
        // host_applications has no agency_code column — use RPC
        return try {
            postgrest.rpc("get_agency_pending_requests", buildJsonObject {
                put("_agency_id", agencyId)
            }).decodeList()
        } catch (_: Exception) { emptyList() }
    }

    override suspend fun approveHostRequest(requestId: String): Boolean {
        return try {
            postgrest.rpc("approve_host_request", buildJsonObject {
                put("_request_id", requestId)
            })
            true
        } catch (_: Exception) { false }
    }

    override suspend fun rejectHostRequest(requestId: String, reason: String): Boolean {
        return try {
            postgrest.from("host_applications").update(mapOf(
                "status" to "rejected",
                "rejection_reason" to reason
            )) {
                filter { eq("id", requestId) }
            }
            true
        } catch (_: Exception) { false }
    }

    override suspend fun removeHost(agencyId: String, hostId: String): Boolean {
        return try {
            postgrest.from("agency_hosts").update(mapOf(
                "status" to "removed"
            )) {
                filter {
                    eq("agency_id", agencyId)
                    eq("host_id", hostId)
                }
            }
            true
        } catch (_: Exception) { false }
    }

    override suspend fun getAgencyPerformance(agencyId: String, periodType: String): AgencyPerformanceData? {
        return try {
            postgrest.from("agency_performance")
                .select {
                    filter {
                        eq("agency_id", agencyId)
                        eq("period_type", periodType)
                    }
                    order("period_start", Order.DESCENDING)
                    limit(1)
                }
                .decodeSingle()
        } catch (_: Exception) { null }
    }

    override suspend fun getAgencyWithdrawals(agencyId: String): List<AgencyWithdrawalData> {
        return postgrest.from("agency_withdrawals")
            .select {
                filter { eq("agency_id", agencyId) }
                order("requested_at", Order.DESCENDING)
                limit(50)
            }
            .decodeList()
    }

    override suspend fun submitAgencyWithdrawal(
        agencyId: String, amount: Int, method: String, details: Map<String, String>
    ): Boolean {
        return try {
            val insertData = mutableMapOf(
                "agency_id" to agencyId,
                "amount" to amount.toString(),
                "payment_method" to method,
                "status" to "pending"
            )
            insertData.putAll(details)
            postgrest.from("agency_withdrawals").insert(insertData)
            true
        } catch (_: Exception) { false }
    }

    override suspend fun getAgencyRankings(periodType: String): List<AgencyRankingData> {
        return postgrest.from("agency_rankings")
            .select(Columns.raw("*, agency:agencies_public!agency_rankings_agency_id_fkey(name, logo_url)")) {
                filter { eq("period_type", periodType) }
                order("rank_position", Order.ASCENDING)
                limit(50)
            }
            .decodeList()
    }

    override suspend fun getSubAgents(parentAgencyId: String): List<SubAgentData> {
        return postgrest.from("agencies")
            .select(Columns.raw("id, name, agency_code, total_hosts, total_agents, commission_rate, created_at")) {
                filter { eq("parent_agency_id", parentAgencyId) }
                order("created_at", Order.DESCENDING)
            }
            .decodeList()
    }

    override suspend fun getAgencyLevelTiers(): List<AgencyLevelTierData> {
        return postgrest.from("agency_level_tiers")
            .select {
                filter { eq("is_active", true) }
                order("display_order", Order.ASCENDING)
            }
            .decodeList()
    }

    override suspend fun getDiamondTransactions(agencyId: String): List<DiamondTransactionData> {
        return postgrest.from("agency_diamond_transactions")
            .select {
                filter { eq("agency_id", agencyId) }
                order("created_at", Order.DESCENDING)
                limit(50)
            }
            .decodeList()
    }

    override suspend fun exchangeBeansToDiamonds(amount: Int): ExchangeResult {
        val userId = currentUserId() ?: return ExchangeResult(false, 0, 0, "Not authenticated")
        return try {
            postgrest.rpc("exchange_user_beans_to_diamonds", buildJsonObject {
                put("_user_id", userId)
                put("_beans_amount", amount)
            }).decodeSingle()
        } catch (e: Exception) {
            ExchangeResult(false, 0, 0, e.message ?: "Exchange failed")
        }
    }

    override suspend fun getAgencyCommissionHistory(agencyId: String): List<CommissionHistoryData> {
        return postgrest.from("agency_commission_history")
            .select {
                filter { eq("agency_id", agencyId) }
                order("created_at", Order.DESCENDING)
                limit(50)
            }
            .decodeList()
    }

    override suspend fun getAgencyEarningsTransfers(agencyId: String): List<AgencyEarningsTransferData> {
        return postgrest.from("agency_earnings_transfers")
            .select {
                filter { eq("agency_id", agencyId) }
                order("created_at", Order.DESCENDING)
                limit(50)
            }
            .decodeList()
    }
}

// Data models
@Serializable
data class AgencyData(
    val id: String,
    val name: String? = null,
    val agency_code: String? = null,
    val owner_id: String? = null,
    val beans_balance: Int? = null,
    val diamond_balance: Int? = null,
    val wallet_balance: Int? = null,
    val commission_rate: Double? = null,
    val total_hosts: Int? = null,
    val total_agents: Int? = null,
    val level: String? = null,
    val logo_url: String? = null,
    val is_active: Boolean? = null,
    val is_blocked: Boolean? = null,
    val email: String? = null,
    val whatsapp_number: String? = null,
    val parent_agency_id: String? = null,
)

@Serializable
data class AgencyHostData(
    val id: String,
    val host_id: String? = null,
    val status: String? = null,
    val joined_at: String? = null,
)

@Serializable
data class HostRequestData(
    val id: String,
    val user_id: String? = null,
    val full_name: String? = null,
    val status: String? = null,
    val created_at: String? = null,
    val photo_url: String? = null,
)

@Serializable
data class AgencyPerformanceData(
    val id: String,
    val agency_id: String? = null,
    val period_type: String? = null,
    val period_start: String? = null,
    val total_income: Int? = null,
    val total_host_hours: Double? = null,
    val new_hosts_count: Int? = null,
    val golden_host_income: Int? = null,
)

@Serializable
data class AgencyWithdrawalData(
    val id: String,
    val amount: Int? = null,
    val status: String? = null,
    val payment_method: String? = null,
    val requested_at: String? = null,
    val processed_at: String? = null,
    val notes: String? = null,
)

@Serializable
data class AgencyRankingData(
    val id: String,
    val agency_id: String? = null,
    val rank_position: Int? = null,
    val metric_value: Int? = null,
    val period_type: String? = null,
    val ranking_type: String? = null,
)

@Serializable
data class SubAgentData(
    val id: String,
    val name: String? = null,
    val agency_code: String? = null,
    val total_hosts: Int? = null,
    val total_agents: Int? = null,
    val commission_rate: Double? = null,
    val created_at: String? = null,
)

@Serializable
data class AgencyLevelTierData(
    val id: String,
    val level_code: String? = null,
    val level_name: String? = null,
    val commission_rate: Double? = null,
    val min_weekly_income: Int? = null,
    val max_weekly_income: Int? = null,
    val badge_color: String? = null,
)

@Serializable
data class DiamondTransactionData(
    val id: String,
    val agency_id: String? = null,
    val diamond_amount: Int? = null,
    val beans_amount: Int? = null,
    val fee_amount: Int? = null,
    val transaction_type: String? = null,
    val created_at: String? = null,
)

@Serializable
data class ExchangeResult(
    val success: Boolean = false,
    val diamonds_received: Int = 0,
    val fee_deducted: Int = 0,
    val message: String? = null,
)

@Serializable
data class CommissionHistoryData(
    val id: String,
    val agency_id: String? = null,
    val host_id: String? = null,
    val commission_amount: Int? = null,
    val commission_rate: Double? = null,
    val original_amount: Int? = null,
    val transaction_type: String? = null,
    val created_at: String? = null,
)

@Serializable
data class AgencyEarningsTransferData(
    val id: String,
    val agency_id: String? = null,
    val host_id: String? = null,
    val amount: Int? = null,
    val gift_earnings: Int? = null,
    val call_earnings: Int? = null,
    val status: String? = null,
    val period_start: String? = null,
    val period_end: String? = null,
    val created_at: String? = null,
)
