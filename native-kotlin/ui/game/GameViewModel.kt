package com.merilive.app.ui.game

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.merilive.app.data.model.*
import dagger.hilt.android.lifecycle.HiltViewModel
import io.github.jan.supabase.functions.Functions
import io.github.jan.supabase.postgrest.Postgrest
import io.github.jan.supabase.postgrest.query.Columns
import io.github.jan.supabase.realtime.Realtime
import io.github.jan.supabase.realtime.channel
import io.github.jan.supabase.realtime.postgresChangeFlow
import io.github.jan.supabase.realtime.PostgresAction
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import kotlinx.serialization.json.Json
import kotlinx.serialization.encodeToString
import javax.inject.Inject

sealed class GameState {
    object Idle : GameState()
    object Spinning : GameState()
    data class Result(val result: GameResult) : GameState()
    data class Error(val message: String) : GameState()
}

sealed class TeenPattiState {
    object Idle : TeenPattiState()
    object Dealing : TeenPattiState()
    data class Result(
        val playerHand: TeenPattiHand,
        val dealerHand: TeenPattiHand,
        val payout: Long,
    ) : TeenPattiState()
    data class Error(val message: String) : TeenPattiState()
}

sealed class RouletteState {
    object Idle : RouletteState()
    object Spinning : RouletteState()
    data class Result(val result: RouletteResult) : RouletteState()
    data class Error(val message: String) : RouletteState()
}

@HiltViewModel
class GameViewModel @Inject constructor(
    private val functions: Functions,
    private val postgrest: Postgrest,
) : ViewModel() {

    private val json = Json { ignoreUnknownKeys = true; coerceInputValues = true }

    private val _gameConfigs = MutableStateFlow<List<GameConfig>>(emptyList())
    val gameConfigs = _gameConfigs.asStateFlow()

    private val _userBalance = MutableStateFlow(0L)
    val userBalance = _userBalance.asStateFlow()

    private val _ferrisState = MutableStateFlow<GameState>(GameState.Idle)
    val ferrisState = _ferrisState.asStateFlow()

    private val _ferrisBets = MutableStateFlow<Map<Int, Long>>(emptyMap())
    val ferrisBets = _ferrisBets.asStateFlow()

    private val _selectedChip = MutableStateFlow(CHIP_VALUES[0])
    val selectedChip = _selectedChip.asStateFlow()

    private val _teenPattiState = MutableStateFlow<TeenPattiState>(TeenPattiState.Idle)
    val teenPattiState = _teenPattiState.asStateFlow()

    private val _teenPattiBet = MutableStateFlow(CHIP_VALUES[0])
    val teenPattiBet = _teenPattiBet.asStateFlow()

    private val _rouletteState = MutableStateFlow<RouletteState>(RouletteState.Idle)
    val rouletteState = _rouletteState.asStateFlow()

    private val _rouletteBets = MutableStateFlow<Map<String, Long>>(emptyMap())
    val rouletteBets = _rouletteBets.asStateFlow()

    init {
        loadGameConfigs()
    }

    fun loadGameConfigs() {
        viewModelScope.launch {
            try {
                val result = postgrest.from("game_configs")
                    .select {
                        filter { eq("is_active", true) }
                        order("display_order", io.github.jan.supabase.postgrest.query.Order.ASCENDING)
                    }
                _gameConfigs.value = json.decodeFromString(result.decodeAs())
            } catch (e: Exception) {
                _gameConfigs.value = getDefaultConfigs()
            }
        }
    }

    fun getGameConfig(gameKey: String): GameConfig? =
        _gameConfigs.value.find { it.game_key == gameKey }

    fun getAvailableGames(context: String): List<GameConfig> =
        _gameConfigs.value.filter { it.available_in.contains(context) }

    fun selectChip(value: Long) { _selectedChip.value = value }

    // ===== Ferris Wheel =====
    fun placeFerrisBet(slot: Int) {
        val current = _ferrisBets.value.toMutableMap()
        current[slot] = (current[slot] ?: 0) + _selectedChip.value
        _ferrisBets.value = current
    }

    fun clearFerrisBets() { _ferrisBets.value = emptyMap() }

    fun spinFerrisWheel(roomId: String) {
        val bets = _ferrisBets.value
        if (bets.isEmpty()) return
        _ferrisState.value = GameState.Spinning
        val totalBet = bets.values.sum()

        viewModelScope.launch {
            try {
                val request = GamePlayRequest(
                    game_key = "ferris_wheel",
                    room_id = roomId,
                    bet_amount = totalBet,
                    bet_details = bets.mapKeys { it.key.toString() },
                )
                val response = functions.invoke("game-play", body = request)
                val result: GamePlayResponse = json.decodeFromString(response.decodeAs())

                if (result.error != null) {
                    _ferrisState.value = GameState.Error(result.error)
                    delay(2000)
                    _ferrisState.value = GameState.Idle
                    return@launch
                }

                delay(3000)
                _ferrisState.value = GameState.Result(
                    GameResult(
                        winning_slot = result.winning_slot,
                        winning_item = result.winning_item,
                        winning_emoji = result.winning_emoji,
                        payout_multiplier = result.payout_multiplier,
                        total_payout = result.total_payout,
                        new_balance = result.new_balance,
                    )
                )
                _userBalance.value = result.new_balance
                _ferrisBets.value = emptyMap()
                delay(3000)
                _ferrisState.value = GameState.Idle
            } catch (e: Exception) {
                _ferrisState.value = GameState.Error(e.message ?: "Spin failed")
                delay(2000)
                _ferrisState.value = GameState.Idle
            }
        }
    }

    // ===== Teen Patti =====
    fun setTeenPattiBet(amount: Long) { _teenPattiBet.value = amount }

    fun playTeenPatti(roomId: String) {
        _teenPattiState.value = TeenPattiState.Dealing

        viewModelScope.launch {
            try {
                val request = GamePlayRequest(
                    game_key = "teen_patti",
                    room_id = roomId,
                    bet_amount = _teenPattiBet.value,
                )
                val response = functions.invoke("game-play", body = request)
                val result: GamePlayResponse = json.decodeFromString(response.decodeAs())

                if (result.error != null) {
                    _teenPattiState.value = TeenPattiState.Error(result.error)
                    delay(2000)
                    _teenPattiState.value = TeenPattiState.Idle
                    return@launch
                }

                delay(2000)
                _teenPattiState.value = TeenPattiState.Result(
                    playerHand = TeenPattiHand(hand_rank = result.winning_item, is_winner = result.total_payout > 0),
                    dealerHand = TeenPattiHand(hand_rank = "dealer"),
                    payout = result.total_payout,
                )
                _userBalance.value = result.new_balance
                delay(4000)
                _teenPattiState.value = TeenPattiState.Idle
            } catch (e: Exception) {
                _teenPattiState.value = TeenPattiState.Error(e.message ?: "Game failed")
                delay(2000)
                _teenPattiState.value = TeenPattiState.Idle
            }
        }
    }

    // ===== Roulette =====
    fun placeRouletteBet(target: String) {
        val current = _rouletteBets.value.toMutableMap()
        current[target] = (current[target] ?: 0) + _selectedChip.value
        _rouletteBets.value = current
    }

    fun clearRouletteBets() { _rouletteBets.value = emptyMap() }

    fun spinRoulette(roomId: String) {
        val bets = _rouletteBets.value
        if (bets.isEmpty()) return
        _rouletteState.value = RouletteState.Spinning
        val totalBet = bets.values.sum()

        viewModelScope.launch {
            try {
                val request = GamePlayRequest(
                    game_key = "roulette",
                    room_id = roomId,
                    bet_amount = totalBet,
                    bet_details = bets,
                )
                val response = functions.invoke("game-play", body = request)
                val result: GamePlayResponse = json.decodeFromString(response.decodeAs())

                if (result.error != null) {
                    _rouletteState.value = RouletteState.Error(result.error)
                    delay(2000)
                    _rouletteState.value = RouletteState.Idle
                    return@launch
                }

                delay(4000)
                _rouletteState.value = RouletteState.Result(
                    RouletteResult(
                        number = result.winning_slot,
                        color = result.winning_item,
                        payout = result.total_payout,
                    )
                )
                _userBalance.value = result.new_balance
                _rouletteBets.value = emptyMap()
                delay(3000)
                _rouletteState.value = RouletteState.Idle
            } catch (e: Exception) {
                _rouletteState.value = RouletteState.Error(e.message ?: "Spin failed")
                delay(2000)
                _rouletteState.value = RouletteState.Idle
            }
        }
    }

    private fun getDefaultConfigs(): List<GameConfig> = listOf(
        GameConfig(
            game_key = "ferris_wheel", game_name = "Ferris Wheel", game_type = "slot",
            min_bet = 1000, max_bet = 500000, display_order = 1,
            game_items = listOf(
                GameItemConfig(slot = 0, name = "Burger", emoji = "🍔", multiplier = 2.0),
                GameItemConfig(slot = 1, name = "Pizza", emoji = "🍕", multiplier = 3.0),
                GameItemConfig(slot = 2, name = "Fries", emoji = "🍟", multiplier = 1.5),
                GameItemConfig(slot = 3, name = "Cake", emoji = "🎂", multiplier = 5.0),
                GameItemConfig(slot = 4, name = "Ice Cream", emoji = "🍦", multiplier = 2.5),
                GameItemConfig(slot = 5, name = "Donut", emoji = "🍩", multiplier = 4.0),
                GameItemConfig(slot = 6, name = "Sushi", emoji = "🍣", multiplier = 8.0),
                GameItemConfig(slot = 7, name = "Taco", emoji = "🌮", multiplier = 1.8),
            ),
        ),
        GameConfig(game_key = "teen_patti", game_name = "Teen Patti", game_type = "card", min_bet = 1000, max_bet = 500000, display_order = 2),
        GameConfig(game_key = "roulette", game_name = "Roulette", game_type = "roulette", min_bet = 1000, max_bet = 1000000, display_order = 3),
    )
}
