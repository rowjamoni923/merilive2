package com.merilive.app.ui.invitation

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.merilive.app.data.repository.*
import dagger.hilt.android.lifecycle.HiltViewModel
import io.github.jan.supabase.auth.Auth
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import javax.inject.Inject

data class InvitationUiState(
    val loading: Boolean = true,
    val leaderboard: List<InvitationLeaderboardEntry> = emptyList(),
    val tiers: List<InvitationTierData> = emptyList(),
    val myInviteCount: Int = 0,
    val shareLink: String = "",
    val claimedTierIds: Set<String> = emptySet(),
    val claimingTierId: String? = null,
)

@HiltViewModel
class InvitationViewModel @Inject constructor(
    private val auth: Auth,
    private val taskRepository: TaskRepository,
) : ViewModel() {

    private val _state = MutableStateFlow(InvitationUiState())
    val state = _state.asStateFlow()

    fun loadData() {
        viewModelScope.launch {
            _state.value = _state.value.copy(loading = true)
            try {
                val userId = auth.currentSessionOrNull()?.user?.id ?: ""
                val appUid = "" // Would be fetched from profile

                val leaderboard = taskRepository.getInvitationLeaderboard()
                val tiers = taskRepository.getInvitationTiers()
                val inviteCount = taskRepository.getMyInviteCount()
                val claimedIds = taskRepository.getClaimedTierIds().toSet()

                val shareLink = "https://merilive.com/link?ref=$appUid"

                _state.value = _state.value.copy(
                    loading = false,
                    leaderboard = leaderboard,
                    tiers = tiers,
                    myInviteCount = inviteCount,
                    shareLink = shareLink,
                    claimedTierIds = claimedIds,
                )
            } catch (e: Exception) {
                _state.value = _state.value.copy(loading = false)
            }
        }
    }

    fun claimTierReward(tierId: String) {
        viewModelScope.launch {
            _state.value = _state.value.copy(claimingTierId = tierId)
            try {
                val success = taskRepository.claimInvitationReward(tierId)
                if (success) {
                    _state.value = _state.value.copy(
                        claimedTierIds = _state.value.claimedTierIds + tierId
                    )
                }
            } catch (_: Exception) {
            } finally {
                _state.value = _state.value.copy(claimingTierId = null)
            }
        }
    }
}
