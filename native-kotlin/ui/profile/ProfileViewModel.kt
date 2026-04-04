package com.merilive.app.ui.profile

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import dagger.hilt.android.lifecycle.HiltViewModel
import io.github.jan.supabase.auth.Auth
import io.github.jan.supabase.postgrest.Postgrest
import io.github.jan.supabase.postgrest.query.Columns
import io.github.jan.supabase.realtime.Realtime
import io.github.jan.supabase.realtime.channel
import io.github.jan.supabase.realtime.postgresChangeFlow
import io.github.jan.supabase.realtime.PostgresAction
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import kotlinx.serialization.Serializable
import javax.inject.Inject

sealed class ProfileState {
    object Loading : ProfileState()
    data class Success(val profile: UserProfile) : ProfileState()
    data class Error(val message: String) : ProfileState()
}

@HiltViewModel
class ProfileViewModel @Inject constructor(
    private val auth: Auth,
    private val postgrest: Postgrest,
    private val realtime: Realtime,
) : ViewModel() {

    private val _profileState = MutableStateFlow<ProfileState>(ProfileState.Loading)
    val profileState = _profileState.asStateFlow()

    fun loadProfile() {
        viewModelScope.launch {
            _profileState.value = ProfileState.Loading
            try {
                val userId = auth.currentSessionOrNull()?.user?.id
                    ?: throw Exception("Not authenticated")

                val result = postgrest.from("profiles")
                    .select(Columns.raw("""
                        id, app_uid, display_name, avatar_url, bio, gender, 
                        user_level, coins, beans, diamonds, 
                        is_verified, is_face_verified, is_host, 
                        country_name, country_flag, equipped_frame_id,
                        current_vip_tier_id, vip_expires_at, agency_id, is_agency_owner,
                        cover_url, tags, total_earnings
                    """.trimIndent())) {
                        filter { eq("id", userId) }
                    }
                    .decodeSingle<ProfileResponse>()

                // Load frame URL if equipped
                var frameUrl: String? = null
                if (result.equipped_frame_id != null) {
                    try {
                        val frame = postgrest.from("avatar_frames")
                            .select(Columns.raw("frame_url")) {
                                filter { eq("id", result.equipped_frame_id) }
                            }
                            .decodeSingleOrNull<FrameData>()
                        frameUrl = frame?.frame_url
                    } catch (_: Exception) {}
                }

                val profile = UserProfile(
                    id = result.id,
                    app_uid = result.app_uid,
                    displayName = result.display_name,
                    avatarUrl = result.avatar_url,
                    frameUrl = frameUrl,
                    bio = result.bio,
                    gender = result.gender,
                    userLevel = result.user_level ?: 1,
                    coins = result.coins ?: 0,
                    beans = result.beans ?: 0,
                    diamonds = result.diamonds ?: 0,
                    isVip = result.current_vip_tier_id != null,
                    isVerified = result.is_verified ?: false,
                    isFaceVerified = result.is_face_verified ?: false,
                    isHost = result.is_host ?: false,
                    countryFlag = result.country_flag,
                    countryName = result.country_name,
                    hasAgency = result.agency_id != null,
                    isAgencyOwner = result.is_agency_owner ?: false,
                )
                _profileState.value = ProfileState.Success(profile)

                subscribeToProfileUpdates(userId)
            } catch (e: Exception) {
                _profileState.value = ProfileState.Error(e.message ?: "Unknown error")
            }
        }
    }

    private fun subscribeToProfileUpdates(userId: String) {
        viewModelScope.launch {
            try {
                val channel = realtime.channel("profile-$userId")
                val flow = channel.postgresChangeFlow<PostgresAction.Update>(schema = "public") {
                    table = "profiles"
                    filter = "id=eq.$userId"
                }
                channel.subscribe()

                flow.collect { change ->
                    loadProfile()
                }
            } catch (e: Exception) {
                // Silently fail realtime
            }
        }
    }

    fun logout() {
        viewModelScope.launch {
            auth.signOut()
        }
    }
}

@Serializable
data class ProfileResponse(
    val id: String,
    val app_uid: String? = null,
    val display_name: String? = null,
    val avatar_url: String? = null,
    val bio: String? = null,
    val gender: String? = null,
    val user_level: Int? = null,
    val coins: Int? = null,
    val beans: Int? = null,
    val diamonds: Int? = null,
    val is_verified: Boolean? = null,
    val is_face_verified: Boolean? = null,
    val is_host: Boolean? = null,
    val country_name: String? = null,
    val country_flag: String? = null,
    val equipped_frame_id: String? = null,
    val current_vip_tier_id: String? = null,
    val vip_expires_at: String? = null,
    val agency_id: String? = null,
    val is_agency_owner: Boolean? = null,
    val cover_url: String? = null,
    val tags: List<String>? = null,
    val total_earnings: Long? = null,
)

@Serializable
data class FrameData(val frame_url: String? = null)
