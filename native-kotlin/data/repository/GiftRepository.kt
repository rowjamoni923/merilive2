package com.merilive.app.data.repository

import io.github.jan.supabase.functions.Functions
import io.github.jan.supabase.postgrest.Postgrest
import io.github.jan.supabase.postgrest.query.Order

import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json
import javax.inject.Inject

interface GiftRepository {
    suspend fun getGifts(): List<GiftResponse>
    suspend fun getGiftCategories(): List<GiftCategoryResponse>
    suspend fun sendGift(giftId: String, receiverId: String, streamId: String?, quantity: Int): Boolean
}

class GiftRepositoryImpl @Inject constructor(
    private val postgrest: Postgrest,
    private val functions: Functions,
) : GiftRepository {

    private val json = Json { ignoreUnknownKeys = true }

    override suspend fun getGifts(): List<GiftResponse> {
        return postgrest.from("gifts")
            .select {
                filter { eq("is_active", true) }
                order("display_order", Order.ASCENDING)
            }
            .decodeList()
    }

    override suspend fun getGiftCategories(): List<GiftCategoryResponse> {
        return postgrest.from("gift_categories")
            .select {
                filter { eq("is_active", true) }
                order("display_order", Order.ASCENDING)
            }
            .decodeList()
    }

    override suspend fun sendGift(giftId: String, receiverId: String, streamId: String?, quantity: Int): Boolean {
        return try {
            functions.invoke("send-gift")
            true
        } catch (e: Exception) {
            false
        }
    }
}

@Serializable
data class GiftResponse(
    val id: String,
    val name: String,
    val icon_url: String? = null,
    val animation_url: String? = null,
    val animation_type: String? = null,
    val coin_price: Int = 0,        // DB generated column synced from coin_value
    val coin_value: Int = 0,        // actual DB column
    val category: String? = null,   // text field, NOT category_id
    val is_active: Boolean = true,
    val display_order: Int = 0,
    val sound_url: String? = null,
    val sound_duration_ms: Int? = null,
)

@Serializable
data class GiftCategoryResponse(
    val id: String,
    val name: String,
    val icon: String? = null,
    val display_order: Int = 0,
    val is_active: Boolean = true,
)
