package com.merilive.app.ui.rewards

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.merilive.app.data.repository.*
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import java.text.SimpleDateFormat
import java.util.*
import javax.inject.Inject

data class RewardsUiState(
    val loading: Boolean = true,
    val activeTab: String = "daily",
    val currentStreak: Int = 0,
    val totalClaims: Int = 0,
    val alreadyClaimedToday: Boolean = false,
    val hasFirstRecharge: Boolean = true,
    val firstRechargeMultiplier: Int = 2,
    val consumptionTiers: List<ConsumptionTierData> = emptyList(),
    val limitedOffers: List<LimitedOfferData> = emptyList(),
    val userWeeklySpend: Int = 0,
)

@HiltViewModel
class RewardsViewModel @Inject constructor(
    private val taskRepository: TaskRepository,
) : ViewModel() {

    private val _state = MutableStateFlow(RewardsUiState())
    val state = _state.asStateFlow()

    fun loadRewards() {
        viewModelScope.launch {
            _state.value = _state.value.copy(loading = true)
            try {
                val streak = taskRepository.getDailyLoginStreak()
                val tiers = taskRepository.getConsumptionTiers()
                val offers = taskRepository.getLimitedOffers()

                val today = SimpleDateFormat("yyyy-MM-dd", Locale.US).format(Date())
                val alreadyClaimed = streak?.last_claim_date == today

                _state.value = _state.value.copy(
                    loading = false,
                    currentStreak = streak?.current_streak ?: 0,
                    totalClaims = streak?.total_claims ?: 0,
                    alreadyClaimedToday = alreadyClaimed,
                    consumptionTiers = tiers,
                    limitedOffers = offers,
                )
            } catch (e: Exception) {
                _state.value = _state.value.copy(loading = false)
            }
        }
    }

    fun switchTab(tab: String) {
        _state.value = _state.value.copy(activeTab = tab)
    }

    fun claimDailyLogin() {
        viewModelScope.launch {
            try {
                val success = taskRepository.claimDailyLogin()
                if (success) {
                    _state.value = _state.value.copy(
                        alreadyClaimedToday = true,
                        currentStreak = _state.value.currentStreak + 1,
                        totalClaims = _state.value.totalClaims + 1,
                    )
                }
            } catch (_: Exception) {}
        }
    }
}
