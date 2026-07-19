package com.merilive.app.data.repository

import io.github.jan.supabase.auth.Auth
import io.github.jan.supabase.postgrest.Postgrest
import io.github.jan.supabase.postgrest.query.Columns
import io.github.jan.supabase.postgrest.query.Order
import io.github.jan.supabase.postgrest.rpc
import io.github.jan.supabase.storage.Storage
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put
import javax.inject.Inject

interface TaskRepository {
    suspend fun getDailyTasks(): List<DailyTaskData>
    suspend fun getTaskProgress(resetDate: String): List<TaskProgressData>
    suspend fun claimTask(taskId: String, resetDate: String): ClaimResult
    suspend fun getInvitationTiers(): List<InvitationTierData>
    suspend fun getMyInviteCount(): Int
    suspend fun getMyInvitedUsers(): List<InvitedUserData>
    suspend fun getClaimedTierIds(): List<String>
    suspend fun claimInvitationReward(tierId: String): Boolean
    suspend fun getConsumptionTiers(): List<ConsumptionTierData>
    suspend fun getLimitedOffers(): List<LimitedOfferData>
    suspend fun getDailyLoginStreak(): LoginStreakData?
    suspend fun claimDailyLogin(): Boolean
    suspend fun getNewHostBonusSettings(): NewHostBonusSettingsData?
    suspend fun getNewHostBonusProgress(): NewHostBonusProgressData?
    suspend fun getHostApplicationStatus(): HostApplicationData?
    suspend fun submitHostApplication(agencyCode: String, fullName: String, age: Int, language: String, photoUrl: String, videoUrl: String): Boolean
    suspend fun uploadMedia(bucket: String, path: String, bytes: ByteArray): String
    suspend fun getWeeklyEarnings(): List<WeeklyEarningData>
    suspend fun getWithdrawalHistory(): List<WithdrawalHistoryData>
    suspend fun submitWithdrawal(amount: Int, method: String, accountNumber: String, accountName: String): Boolean
    suspend fun getHelperData(): HelperDataResponse?
}

class TaskRepositoryImpl @Inject constructor(
    private val auth: Auth,
    private val postgrest: Postgrest,
    private val storage: Storage,
) : TaskRepository {

    private fun getCurrentUserId(): String? = auth.currentSessionOrNull()?.user?.id

    override suspend fun getDailyTasks(): List<DailyTaskData> {
        return postgrest.from("daily_tasks")
            .select {
                filter { eq("is_active", true) }
                order("display_order", Order.ASCENDING)
            }
            .decodeList()
    }

    override suspend fun getTaskProgress(resetDate: String): List<TaskProgressData> {
        val userId = getCurrentUserId() ?: return emptyList()
        // Use RPC since daily_task_progress table doesn't exist as direct table
        return try {
            postgrest.rpc("get_daily_task_progress", buildJsonObject {
                put("_user_id", userId)
                put("_reset_date", resetDate)
            }).decodeList()
        } catch (_: Exception) { emptyList() }
    }

    override suspend fun claimTask(taskId: String, resetDate: String): ClaimResult {
        val userId = getCurrentUserId() ?: return ClaimResult(false, 0, 0)
        return postgrest.rpc("claim_daily_task_reward", buildJsonObject {
            put("_user_id", userId)
            put("_task_id", taskId)
            put("_reset_date", resetDate)
        }).decodeSingle()
    }

    override suspend fun getInvitationTiers(): List<InvitationTierData> {
        return postgrest.from("invitation_settings")
            .select {
                filter { eq("is_active", true) }
                order("min_invites", Order.ASCENDING)
            }
            .decodeList()
    }

    override suspend fun getMyInviteCount(): Int {
        val userId = getCurrentUserId() ?: return 0
        val data = postgrest.from("user_invitations")
            .select(Columns.raw("id")) {
                filter { eq("inviter_id", userId) }
            }
            .decodeList<IdOnly>()
        return data.size
    }

    override suspend fun getMyInvitedUsers(): List<InvitedUserData> {
        val userId = getCurrentUserId() ?: return emptyList()
        return postgrest.from("user_invitations")
            .select(Columns.raw("id, invited_user:profiles_public!user_invitations_invited_user_id_fkey(id, display_name, avatar_url), created_at")) {
                filter { eq("inviter_id", userId) }
                order("created_at", Order.DESCENDING)
            }
            .decodeList()
    }

    override suspend fun getClaimedTierIds(): List<String> {
        val userId = getCurrentUserId() ?: return emptyList()
        return postgrest.from("invitation_reward_claims")
            .select(Columns.raw("tier_id")) {
                filter { eq("user_id", userId) }
            }
            .decodeList<TierIdOnly>()
            .map { it.tier_id }
    }

    override suspend fun claimInvitationReward(tierId: String): Boolean {
        val userId = getCurrentUserId() ?: return false
        return try {
            postgrest.rpc("claim_invitation_tier_reward", buildJsonObject {
                put("_user_id", userId)
                put("_tier_id", tierId)
            })
            true
        } catch (e: Exception) {
            false
        }
    }

    override suspend fun getConsumptionTiers(): List<ConsumptionTierData> {
        return postgrest.from("consumption_return_config")
            .select {
                filter { eq("is_active", true) }
                order("display_order", Order.ASCENDING)
            }
            .decodeList()
    }

    override suspend fun getLimitedOffers(): List<LimitedOfferData> {
        return postgrest.from("limited_time_offers")
            .select {
                filter { eq("is_active", true) }
            }
            .decodeList()
    }

    override suspend fun getDailyLoginStreak(): LoginStreakData? {
        val userId = getCurrentUserId() ?: return null
        return try {
            postgrest.rpc("get_daily_login_streak", buildJsonObject {
                put("_user_id", userId)
            }).decodeSingleOrNull()
        } catch (e: Exception) {
            null
        }
    }

    override suspend fun claimDailyLogin(): Boolean {
        val userId = getCurrentUserId() ?: return false
        return try {
            postgrest.rpc("claim_daily_login_reward", buildJsonObject {
                put("_user_id", userId)
            })
            true
        } catch (e: Exception) {
            false
        }
    }

    override suspend fun getNewHostBonusSettings(): NewHostBonusSettingsData? {
        return try {
            postgrest.from("app_settings")
                .select {
                    filter { eq("setting_key", "new_host_bonus") }
                }
                .decodeSingle<AppSettingJsonRow>()
                .let { null } // Parse from JSON setting_value
        } catch (e: Exception) {
            null
        }
    }

    override suspend fun getNewHostBonusProgress(): NewHostBonusProgressData? {
        val userId = getCurrentUserId() ?: return null
        return try {
            postgrest.rpc("get_new_host_bonus_progress", buildJsonObject {
                put("_user_id", userId)
            }).decodeSingleOrNull()
        } catch (e: Exception) {
            null
        }
    }

    override suspend fun getHostApplicationStatus(): HostApplicationData? {
        val userId = getCurrentUserId() ?: return null
        return try {
            postgrest.from("host_applications")
                .select {
                    filter { eq("user_id", userId) }
                    order("created_at", Order.DESCENDING)
                    limit(1)
                }
                .decodeSingle()
        } catch (e: Exception) {
            null
        }
    }

    override suspend fun submitHostApplication(
        agencyCode: String, fullName: String, age: Int,
        language: String, photoUrl: String, videoUrl: String
    ): Boolean {
        val userId = getCurrentUserId() ?: return false
        return try {
            // host_applications has no agency_code column — use RPC to handle matching
            postgrest.rpc("submit_host_application", buildJsonObject {
                put("_user_id", userId)
                put("_agency_code", agencyCode)
                put("_full_name", fullName)
                put("_age", age)
                put("_language", language)
                put("_photo_url", photoUrl)
                put("_video_url", videoUrl)
            })
            true
        } catch (e: Exception) {
            false
        }
    }

    override suspend fun uploadMedia(bucket: String, path: String, bytes: ByteArray): String {
        storage.from(bucket).upload(path, bytes, upsert = true)
        return storage.from(bucket).publicUrl(path)
    }

    override suspend fun getWeeklyEarnings(): List<WeeklyEarningData> {
        val userId = getCurrentUserId() ?: return emptyList()
        return postgrest.from("agency_earnings_transfers")
            .select {
                filter { eq("host_id", userId) }
                order("created_at", Order.DESCENDING)
                limit(50)
            }
            .decodeList()
    }

    override suspend fun getWithdrawalHistory(): List<WithdrawalHistoryData> {
        val userId = getCurrentUserId() ?: return emptyList()
        // diamond_transfers uses sender_id, not user_id
        return postgrest.from("diamond_transfers")
            .select {
                filter { eq("sender_id", userId) }
                order("created_at", Order.DESCENDING)
                limit(50)
            }
            .decodeList()
    }

    override suspend fun submitWithdrawal(
        amount: Int, method: String, accountNumber: String, accountName: String
    ): Boolean {
        val userId = getCurrentUserId() ?: return false
        return try {
            // Use RPC since diamond_transfers doesn't have payment_method/account columns
            postgrest.rpc("submit_user_withdrawal", buildJsonObject {
                put("_user_id", userId)
                put("_amount", amount)
                put("_method", method)
                put("_account_number", accountNumber)
                put("_account_name", accountName)
            })
            true
        } catch (e: Exception) {
            false
        }
    }

    override suspend fun getHelperData(): HelperDataResponse? {
        val userId = getCurrentUserId() ?: return null
        return try {
            postgrest.from("topup_helpers")
                .select {
                    filter { eq("user_id", userId) }
                }
                .decodeSingle()
        } catch (e: Exception) {
            null
        }
    }
}

// Data models
@Serializable data class IdOnly(val id: String)
@Serializable data class TierIdOnly(val tier_id: String)
@Serializable data class AppSettingJsonRow(val setting_key: String, val setting_value: String? = null)

@Serializable
data class DailyTaskData(
    val id: String,
    val title: String? = null,
    val description: String? = null,
    val task_type: String? = null,
    val requirement_type: String? = null,
    val requirement_value: Int? = null,
    val reward_beans: Int? = null,
    val reward_diamonds: Int? = null,
    val icon_name: String? = null,
    val icon_color: String? = null,
    val display_order: Int? = null,
    val show_in_live: Boolean? = null,
    val target_audience: String? = null,
    val duration_hours: Int? = null,
)

@Serializable
data class TaskProgressData(
    val task_id: String,
    val current_progress: Int? = null,
    val is_completed: Boolean? = null,
    val is_claimed: Boolean? = null,
)

@Serializable
data class ClaimResult(
    val success: Boolean = false,
    val beans_earned: Int = 0,
    val diamonds_earned: Int = 0,
)

@Serializable
data class InvitationTierData(
    val id: String,
    val tier_name: String? = null,
    val min_invites: Int? = null,
    val max_invites: Int? = null,
    val reward_beans: Int? = null,
    val reward_diamonds: Int? = null,
    val bonus_percentage: Double? = null,
    val badge_color: String? = null,
    val is_active: Boolean? = null,
)

@Serializable
data class InvitedUserData(
    val id: String,
    val created_at: String? = null,
)

@Serializable
data class ConsumptionTierData(
    val id: String,
    val tier_name: String? = null,
    val min_spend: Int? = null,
    val max_spend: Int? = null,
    val return_percentage: Double? = null,
    val max_return_diamonds: Int? = null,
    val period_type: String? = null,
)

@Serializable
data class LimitedOfferData(
    val id: String,
    val title: String? = null,
    val description: String? = null,
    val bonus_percentage: Double? = null,
    val ends_at: String? = null,
    val badge_text: String? = null,
    val total_claimed: Int? = null,
    val total_max_claims: Int? = null,
)

@Serializable
data class LoginStreakData(
    val user_id: String? = null,
    val current_streak: Int = 0,
    val longest_streak: Int = 0,
    val last_claim_date: String? = null,
    val total_claims: Int = 0,
)

@Serializable
data class NewHostBonusSettingsData(
    val beans_per_hour: Int = 0,
    val max_hours_per_day: Int = 5,
    val eligible_days: Int = 7,
    val is_active: Boolean = false,
)

@Serializable
data class NewHostBonusProgressData(
    val hours_completed: Double = 0.0,
    val beans_earned: Int = 0,
    val day_number: Int = 1,
)

@Serializable
data class HostApplicationData(
    val id: String,
    val user_id: String? = null,
    val full_name: String? = null,
    val status: String? = null,
    val created_at: String? = null,
    val reviewed_at: String? = null,
    val rejection_reason: String? = null,
    val photo_url: String? = null,
    val video_url: String? = null,
)

@Serializable
data class WeeklyEarningData(
    val id: String,
    val amount: Int? = null,
    val gift_earnings: Int? = null,
    val call_earnings: Int? = null,
    val status: String? = null,
    val agency_name: String? = null,
    val period_start: String? = null,
    val period_end: String? = null,
    val created_at: String? = null,
)

@Serializable
data class WithdrawalHistoryData(
    val id: String,
    val amount: Int? = null,
    val status: String? = null,
    val sender_type: String? = null,
    val note: String? = null,
    val created_at: String? = null,
)

@Serializable
data class HelperDataResponse(
    val id: String,
    val user_id: String? = null,
    val trader_level: Int? = null,
    val wallet_balance: Long? = null,
    val total_bought: Long? = null,
    val total_sold: Long? = null,
    val total_earnings: Long? = null,
    val commission_rate: Double? = null,
    val is_active: Boolean? = null,
    val is_verified: Boolean? = null,
    val country_code: String? = null,
)
