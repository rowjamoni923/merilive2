package com.merilive.app.data.repository

import io.github.jan.supabase.postgrest.Postgrest
import io.github.jan.supabase.postgrest.query.Order
import kotlinx.serialization.json.Json
import javax.inject.Inject
import javax.inject.Singleton

@Singleton
class GameRepository @Inject constructor(
    private val postgrest: Postgrest,
) {
    private val json = Json { ignoreUnknownKeys = true; coerceInputValues = true }

    suspend fun getActiveGames(): List<com.merilive.app.data.model.GameConfig> {
        val result = postgrest.from("game_configs")
            .select {
                filter { eq("is_active", true) }
                order("display_order", Order.ASCENDING)
            }
        return json.decodeFromString(result.decodeAs())
    }

    suspend fun getGameByKey(gameKey: String): com.merilive.app.data.model.GameConfig? {
        val result = postgrest.from("game_configs")
            .select {
                filter {
                    eq("game_key", gameKey)
                    eq("is_active", true)
                }
                limit(1)
            }
        val list: List<com.merilive.app.data.model.GameConfig> = json.decodeFromString(result.decodeAs())
        return list.firstOrNull()
    }

    suspend fun getGameHistory(userId: String, limit: Int = 50): List<com.merilive.app.data.model.GameTransaction> {
        val result = postgrest.from("game_transactions")
            .select {
                filter { eq("user_id", userId) }
                order("created_at", Order.DESCENDING)
                limit(limit.toLong())
            }
        return json.decodeFromString(result.decodeAs())
    }

    suspend fun getGamesForContext(context: String): List<com.merilive.app.data.model.GameConfig> {
        val all = getActiveGames()
        return all.filter { it.available_in.contains(context) }
    }
}