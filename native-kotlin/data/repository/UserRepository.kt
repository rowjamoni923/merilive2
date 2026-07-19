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

interface UserRepository {
    suspend fun getProfile(userId: String): ProfileData
    suspend fun updateProfile(userId: String, updates: Map<String, String>)
    suspend fun uploadAvatar(userId: String, bytes: ByteArray): String
    suspend fun getFollowers(userId: String): List<FollowUser>
    suspend fun getFollowing(userId: String): List<FollowUser>
    suspend fun followUser(targetId: String)
    suspend fun unfollowUser(targetId: String)
    suspend fun blockUser(targetId: String)
    suspend fun searchUsers(query: String): List<FollowUser>
    suspend fun getConversations(): List<ConversationResponse>
    suspend fun getMessages(conversationId: String): List<MessageResponse>
    suspend fun sendMessage(conversationId: String, content: String)
    suspend fun getLeaderboard(period: String): List<LeaderboardResponse>
}

class UserRepositoryImpl @Inject constructor(
    private val auth: Auth,
    private val postgrest: Postgrest,
    private val storage: Storage,
) : UserRepository {

    override suspend fun getProfile(userId: String): ProfileData {
        return postgrest.from("profiles")
            .select(Columns.raw("""
                id, app_uid, display_name, avatar_url, bio, gender, user_level, 
                diamonds, beans, is_verified, is_face_verified, is_host, 
                country_name, country_flag, equipped_frame_id, current_vip_tier_id, 
                vip_expires_at, is_online, host_level, total_earnings, agency_id,
                is_agency_owner, cover_url, tags, beans_balance
            """.trimIndent())) {
                filter { eq("id", userId) }
            }
            .decodeSingle()
    }

    override suspend fun updateProfile(userId: String, updates: Map<String, String>) {
        postgrest.from("profiles").update(updates) { filter { eq("id", userId) } }
    }

    override suspend fun uploadAvatar(userId: String, bytes: ByteArray): String {
        val path = "avatars/$userId.jpg"
        storage.from("avatars").upload(path, bytes, upsert = true)
        return storage.from("avatars").publicUrl(path)
    }

    // followers/following use RPC since no 'follows' table exists
    override suspend fun getFollowers(userId: String): List<FollowUser> {
        return try {
            postgrest.rpc("get_user_followers", buildJsonObject {
                put("_user_id", userId)
            }).decodeList()
        } catch (_: Exception) { emptyList() }
    }

    override suspend fun getFollowing(userId: String): List<FollowUser> {
        return try {
            postgrest.rpc("get_user_following", buildJsonObject {
                put("_user_id", userId)
            }).decodeList()
        } catch (_: Exception) { emptyList() }
    }

    override suspend fun followUser(targetId: String) {
        postgrest.rpc("follow_user", buildJsonObject {
            put("_target_id", targetId)
        })
    }

    override suspend fun unfollowUser(targetId: String) {
        postgrest.rpc("unfollow_user", buildJsonObject {
            put("_target_id", targetId)
        })
    }

    override suspend fun blockUser(targetId: String) {
        postgrest.rpc("block_user", buildJsonObject {
            put("_target_id", targetId)
        })
    }

    override suspend fun searchUsers(query: String): List<FollowUser> {
        return postgrest.from("profiles_public")
            .select(Columns.raw("id, display_name, avatar_url, user_level, country_flag, is_verified, app_uid")) {
                filter {
                    or {
                        ilike("display_name", "%$query%")
                        ilike("app_uid", "%$query%")
                    }
                }
                limit(20)
            }
            .decodeList()
    }

    override suspend fun getConversations(): List<ConversationResponse> {
        val userId = auth.currentSessionOrNull()?.user?.id ?: return emptyList()
        return postgrest.from("conversations")
            .select {
                filter {
                    or {
                        eq("participant_1", userId)
                        eq("participant_2", userId)
                    }
                }
                order("last_message_at", Order.DESCENDING)
                limit(50)
            }
            .decodeList()
    }

    override suspend fun getMessages(conversationId: String): List<MessageResponse> {
        return postgrest.from("messages")
            .select {
                filter { eq("conversation_id", conversationId) }
                order("created_at", Order.ASCENDING)
                limit(100)
            }
            .decodeList()
    }

    override suspend fun sendMessage(conversationId: String, content: String) {
        val userId = auth.currentSessionOrNull()?.user?.id ?: return
        postgrest.from("messages").insert(
            mapOf(
                "conversation_id" to conversationId,
                "sender_id" to userId,
                "content" to content,
                "message_type" to "text"
            )
        )
    }

    override suspend fun getLeaderboard(period: String): List<LeaderboardResponse> {
        return try {
            postgrest.rpc("get_leaderboard", buildJsonObject {
                put("_period", period)
            }).decodeList()
        } catch (_: Exception) { emptyList() }
    }
}

@Serializable
data class ProfileData(
    val id: String,
    val app_uid: String? = null,
    val display_name: String? = null,
    val avatar_url: String? = null,
    val bio: String? = null,
    val gender: String? = null,
    val user_level: Int? = null,
    val diamonds: Int? = null,
    val beans: Int? = null,
    val is_verified: Boolean? = null,
    val is_face_verified: Boolean? = null,
    val is_host: Boolean? = null,
    val country_name: String? = null,
    val country_flag: String? = null,
    val equipped_frame_id: String? = null,
    val current_vip_tier_id: String? = null,
    val vip_expires_at: String? = null,
    val is_online: Boolean? = null,
    val host_level: Int? = null,
    val total_earnings: Long? = null,
    val agency_id: String? = null,
    val is_agency_owner: Boolean? = null,
    val cover_url: String? = null,
    val tags: List<String>? = null,
    val beans_balance: Long? = null,
)

@Serializable
data class FollowUser(
    val id: String,
    val display_name: String? = null,
    val avatar_url: String? = null,
    val user_level: Int? = null,
    val country_flag: String? = null,
    val is_verified: Boolean? = null,
    val app_uid: String? = null,
)

@Serializable
data class ConversationResponse(
    val id: String,
    val participant_1: String? = null,
    val participant_2: String? = null,
    val last_message_at: String? = null,
    val created_at: String? = null,
)

@Serializable
data class MessageResponse(
    val id: String,
    val conversation_id: String,
    val sender_id: String,
    val content: String? = null,
    val message_type: String = "text",
    val status: String? = null,
    val is_read: Boolean? = null,
    val delivered_at: String? = null,
    val read_at: String? = null,
    val created_at: String? = null,
)

@Serializable
data class LeaderboardResponse(
    val rank: Int? = null,
    val user_id: String? = null,
    val display_name: String? = null,
    val avatar_url: String? = null,
    val country_flag: String? = null,
    val score: Long = 0,
    val level: Int = 1,
)
