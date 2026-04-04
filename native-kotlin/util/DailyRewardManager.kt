package com.merilive.app.util

import android.content.Context
import android.util.Log
import kotlinx.coroutines.*
import io.github.jan.supabase.postgrest.Postgrest

/**
 * Handles daily login reward check & claim
 */
class DailyRewardManager(
    private val postgrest: Postgrest,
    private val userId: String,
) {
    data class DailyRewardStatus(
        val canClaim: Boolean = false,
        val currentDay: Int = 1,
        val streak: Int = 0,
        val rewardCoins: Long = 0,
        val rewardDiamonds: Long = 0,
    )

    suspend fun checkStatus(): DailyRewardStatus {
        return try {
            val today = java.time.LocalDate.now().toString()
            val result = postgrest.from("daily_login_claims")
                .select {
                    filter {
                        eq("user_id", userId)
                        eq("claimed_date", today)
                    }
                }
            
            val claims: List<Map<String, Any>> = kotlinx.serialization.json.Json { ignoreUnknownKeys = true }
                .decodeFromString(result.decodeAs())

            if (claims.isEmpty()) {
                // Can claim today
                val allClaims = postgrest.from("daily_login_claims")
                    .select {
                        filter { eq("user_id", userId) }
                        order("claimed_date", io.github.jan.supabase.postgrest.query.Order.DESCENDING)
                        limit(7)
                    }
                val history: List<Map<String, Any>> = kotlinx.serialization.json.Json { ignoreUnknownKeys = true }
                    .decodeFromString(allClaims.decodeAs())
                
                val nextDay = (history.size % 7) + 1
                
                // Get reward config
                val configResult = postgrest.from("daily_login_rewards_config")
                    .select {
                        filter {
                            eq("day_number", nextDay)
                            eq("is_active", true)
                        }
                    }

                DailyRewardStatus(
                    canClaim = true,
                    currentDay = nextDay,
                    streak = history.size,
                )
            } else {
                DailyRewardStatus(canClaim = false)
            }
        } catch (e: Exception) {
            Log.e("DailyRewardManager", "Check failed", e)
            DailyRewardStatus()
        }
    }

    suspend fun claimReward(): Boolean {
        return try {
            val result = postgrest.rpc("claim_daily_login_reward", mapOf("p_user_id" to userId))
            true
        } catch (e: Exception) {
            Log.e("DailyRewardManager", "Claim failed", e)
            false
        }
    }
}