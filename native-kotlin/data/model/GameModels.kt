package com.merilive.app.data.model

import kotlinx.serialization.Serializable
import kotlinx.serialization.json.JsonElement

// ===== Server-Driven Game Config (Admin Panel থেকে অটো-লোড) =====

@Serializable
data class GameConfig(
    val id: String = "",
    val game_key: String = "",
    val game_name: String = "",
    val game_name_bn: String? = null,
    val game_type: String = "slot",
    val icon_url: String? = null,
    val preview_url: String? = null,
    val description: String? = null,
    val is_active: Boolean = true,
    val is_premium: Boolean = false,
    val min_bet: Long = 1000,
    val max_bet: Long = 1000000,
    val house_edge_percent: Double = 5.0,
    val payout_multipliers: List<JsonElement> = emptyList(),
    val game_items: List<GameItemConfig> = emptyList(),
    val display_order: Int = 0,
    val available_in: List<String> = listOf("party_room", "live_stream"),
)

@Serializable
data class GameItemConfig(
    val slot: Int? = null,
    val name: String? = null,
    val emoji: String? = null,
    val multiplier: Double = 0.0,
    val hand: String? = null,
    val type: String? = null,
)

// ===== Game Play Request/Response =====

@Serializable
data class GamePlayRequest(
    val game_key: String,
    val room_id: String,
    val bet_amount: Long,
    val bet_details: Map<String, Long> = emptyMap(),
)

@Serializable
data class GamePlayResponse(
    val success: Boolean = false,
    val error: String? = null,
    val winning_slot: Int = 0,
    val winning_item: String = "",
    val winning_emoji: String = "",
    val payout_multiplier: Double = 0.0,
    val total_payout: Long = 0,
    val net_result: Long = 0,
    val new_balance: Long = 0,
    val balance: Long? = null,
)

// ===== Game Transaction History (matches DB: game_transactions) =====

@Serializable
data class GameTransaction(
    val id: String = "",
    val user_id: String = "",
    val game_id: String? = null,
    val game_name: String? = null,
    val transaction_type: String = "",
    val amount: Long = 0,
    val balance_before: Long? = null,
    val balance_after: Long? = null,
    val multiplier: Double? = null,
    val details: String? = null,
    val created_at: String = "",
)

// ===== Local UI Models =====

@Serializable
data class GameBet(
    val slot: Int,
    val amount: Long,
)

@Serializable
data class GameResult(
    val winning_slot: Int,
    val winning_item: String,
    val winning_emoji: String = "",
    val payout_multiplier: Double = 0.0,
    val total_payout: Long = 0,
    val new_balance: Long = 0,
)

@Serializable
data class TeenPattiHand(
    val cards: List<PlayingCard> = emptyList(),
    val hand_rank: String = "",
    val is_winner: Boolean = false,
)

@Serializable
data class PlayingCard(
    val suit: String,
    val rank: String,
) {
    val displayName: String get() = "$rank${suitEmoji}"
    val suitEmoji: String get() = when (suit) {
        "hearts" -> "♥️"
        "diamonds" -> "♦️"
        "clubs" -> "♣️"
        "spades" -> "♠️"
        else -> "?"
    }
}

@Serializable
data class RouletteResult(
    val number: Int,
    val color: String,
    val payout: Long = 0,
)

enum class GameType(val key: String, val displayName: String) {
    FERRIS_WHEEL("ferris_wheel", "Ferris Wheel"),
    TEEN_PATTI("teen_patti", "Teen Patti"),
    ROULETTE("roulette", "Roulette"),
}

val CHIP_VALUES = listOf(1_000L, 5_000L, 10_000L, 50_000L, 100_000L)

fun formatChipValue(value: Long): String = when {
    value >= 1_000_000 -> "${value / 1_000_000}M"
    value >= 1_000 -> "${value / 1_000}K"
    else -> "$value"
}
