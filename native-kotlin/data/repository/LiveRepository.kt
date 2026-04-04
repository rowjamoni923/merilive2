package com.merilive.app.data.repository

import io.github.jan.supabase.functions.Functions
import io.github.jan.supabase.postgrest.Postgrest
import io.github.jan.supabase.postgrest.query.Columns
import io.github.jan.supabase.postgrest.query.Order
import io.github.jan.supabase.realtime.Realtime

import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json
import javax.inject.Inject

interface LiveRepository {
    suspend fun getActiveStreams(): List<ActiveStream>
    suspend fun getPartyRooms(): List<PartyRoomResponse>
    suspend fun getStreamToken(streamId: String): String
    suspend fun getBanners(): List<BannerResponse>
    suspend fun getBeautyFilters(): List<BeautyFilterResponse>
    suspend fun getArStickers(): List<ArStickerResponse>
}

class LiveRepositoryImpl @Inject constructor(
    private val postgrest: Postgrest,
    private val functions: Functions,
    private val realtime: Realtime,
) : LiveRepository {

    private val json = Json { ignoreUnknownKeys = true }

    override suspend fun getActiveStreams(): List<ActiveStream> {
        val response = functions.invoke("live-stream/active-streams")
        return json.decodeFromString(response.decodeAs())
    }

    override suspend fun getPartyRooms(): List<PartyRoomResponse> {
        return postgrest.from("party_rooms")
            .select(Columns.raw("""
                id, name, description, cover_image_url, host_id, category, max_seats,
                viewer_count, room_id, is_active,
                host:profiles_public!party_rooms_host_id_fkey(id, display_name, avatar_url, level, country_flag)
            """.trimIndent())) {
                filter { eq("is_active", true) }
                order("viewer_count", Order.DESCENDING)
            }
            .decodeList()
    }

    override suspend fun getStreamToken(streamId: String): String {
        val response = functions.invoke("live-stream/join")
        val tokenResponse: TokenResponse = json.decodeFromString(response.decodeAs())
        return tokenResponse.token
    }

    override suspend fun getBanners(): List<BannerResponse> {
        return postgrest.from("banners")
            .select {
                filter { eq("is_active", true) }
                order("display_order", Order.ASCENDING)
            }
            .decodeList()
    }

    override suspend fun getBeautyFilters(): List<BeautyFilterResponse> {
        return postgrest.from("beauty_filters")
            .select {
                filter { eq("is_active", true) }
                order("display_order", Order.ASCENDING)
            }
            .decodeList<BeautyFilterResponse>()
            .distinctBy { it.file_url }
    }

    override suspend fun getArStickers(): List<ArStickerResponse> {
        val stickers = postgrest.from("ar_stickers")
            .select {
                filter { eq("is_active", true) }
                order("display_order", Order.ASCENDING)
            }
            .decodeList<ArStickerResponse>()
            .distinctBy { it.file_url }

        if (stickers.isNotEmpty()) return stickers

        return postgrest.from("beauty_filters")
            .select {
                filter {
                    eq("is_active", true)
                    eq("category", "sticker")
                }
                order("display_order", Order.ASCENDING)
            }
            .decodeList<BeautyFilterResponse>()
            .distinctBy { it.file_url }
            .map {
                ArStickerResponse(
                    id = it.id,
                    name = it.name,
                    file_url = it.file_url,
                    file_type = "deepar",
                    preview_image_url = it.preview_image_url,
                    category = it.category,
                    is_free = it.is_free,
                    display_order = it.display_order,
                )
            }
    }
}

@Serializable
data class ActiveStream(
    val id: String,
    val host_id: String,
    val title: String? = null,
    val thumbnail_url: String? = null,
    val viewer_count: Int = 0,
    val category: String? = null,
    val host_name: String? = null,
    val host_avatar: String? = null,
    val host_level: Int? = null,
    val host_country_flag: String? = null,
)

@Serializable
data class PartyRoomResponse(
    val id: String,
    val name: String,
    val description: String? = null,
    val cover_image_url: String? = null,
    val host_id: String,
    val category: String? = null,
    val max_seats: Int = 9,
    val viewer_count: Int = 0,
    val room_id: String? = null,
    val host: HostInfo? = null,
)

@Serializable
data class HostInfo(
    val id: String,
    val display_name: String? = null,
    val avatar_url: String? = null,
    val level: Int? = null,
    val country_flag: String? = null,
)

@Serializable
data class TokenResponse(val token: String)

@Serializable
data class BannerResponse(
    val id: String,
    val title: String,
    val image_url: String? = null,
    val link_url: String? = null,
    val link_type: String? = null,
    val display_order: Int = 0,
)

@Serializable
data class BeautyFilterResponse(
    val id: String,
    val name: String,
    val file_url: String,
    val preview_image_url: String? = null,
    val category: String = "general",
    val is_free: Boolean = true,
    val display_order: Int = 0,
)

@Serializable
data class ArStickerResponse(
    val id: String,
    val name: String,
    val file_url: String,
    val file_type: String = "svga",
    val preview_image_url: String? = null,
    val category: String = "general",
    val is_free: Boolean = true,
    val display_order: Int = 0,
)