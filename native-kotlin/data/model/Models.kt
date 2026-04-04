package com.merilive.app.data.model

import kotlinx.serialization.Serializable

@Serializable
data class UserProfile(
    val id: String,
    val app_uid: String? = null,
    val displayName: String? = null,
    val avatarUrl: String? = null,
    val frameUrl: String? = null,
    val bio: String? = null,
    val gender: String? = null,
    val user_level: Int = 1,
    val host_level: Int = 0,
    val coins: Int = 0,
    val beans: Int = 0,
    val diamonds: Int = 0,
    val isVip: Boolean = false,
    val is_verified: Boolean = false,
    val is_face_verified: Boolean = false,
    val is_host: Boolean = false,
    val is_online: Boolean = false,
    val country_flag: String? = null,
    val country_name: String? = null,
    val agency_id: String? = null,
    val is_agency_owner: Boolean = false,
    val equipped_frame_id: String? = null,
    val current_vip_tier_id: String? = null,
    val vip_expires_at: String? = null,
    val total_earnings: Long = 0,
    val cover_url: String? = null,
    val tags: List<String>? = null,
)

@Serializable
data class LiveStream(
    val id: String,
    val host_id: String,
    val title: String? = null,
    val thumbnail_url: String? = null,
    val viewer_count: Int = 0,
    val is_live: Boolean = false,
    val category: String? = null,
    val room_id: String? = null,
    val livekit_token: String? = null,
    val host: StreamHost? = null,
)

@Serializable
data class StreamHost(
    val id: String,
    val display_name: String? = null,
    val avatar_url: String? = null,
    val user_level: Int? = null,
    val country_flag: String? = null,
    val is_verified: Boolean? = null,
)

@Serializable
data class Gift(
    val id: String,
    val name: String,
    val icon_url: String? = null,
    val animation_url: String? = null,
    val animation_type: String? = null,
    val coin_price: Int = 0,
    val coin_value: Int = 0,
    val category: String? = null,
    val is_active: Boolean = true,
    val display_order: Int = 0,
    val sound_url: String? = null,
    val sound_duration_ms: Int? = null,
)

@Serializable
data class GiftCategory(
    val id: String,
    val name: String,
    val icon: String? = null,
    val display_order: Int = 0,
)

@Serializable
data class PartyRoom(
    val id: String,
    val name: String,
    val description: String? = null,
    val cover_image_url: String? = null,
    val host_id: String,
    val category: String? = null,
    val max_seats: Int = 9,
    val is_active: Boolean = true,
    val viewer_count: Int = 0,
    val room_id: String? = null,
    val host: StreamHost? = null,
)

@Serializable
data class PrivateCall(
    val id: String,
    val caller_id: String,
    val host_id: String,
    val status: String = "pending",
    val started_at: String? = null,
    val connected_at: String? = null,
    val ended_at: String? = null,
    val duration_seconds: Int? = null,
    val coins_spent: Int? = null,
    val coins_per_minute: Int? = null,
    val total_coins_deducted: Int? = null,
    val host_earned: Int? = null,
)

@Serializable
data class ChatMessage(
    val id: String,
    val conversation_id: String,
    val sender_id: String,
    val content: String? = null,
    val message_type: String = "text",
    val is_read: Boolean = false,
    val status: String? = null,
    val delivered_at: String? = null,
    val read_at: String? = null,
    val created_at: String? = null,
)

@Serializable
data class Notification(
    val id: String,
    val user_id: String,
    val title: String,
    val message: String,
    val type: String,
    val is_read: Boolean = false,
    val data: String? = null,
    val created_at: String? = null,
)

@Serializable
data class LeaderboardEntry(
    val rank: Int,
    val user_id: String,
    val display_name: String? = null,
    val avatar_url: String? = null,
    val country_flag: String? = null,
    val score: Long = 0,
    val user_level: Int = 1,
)

@Serializable
data class BeautyFilter(
    val id: String,
    val name: String,
    val file_url: String,
    val preview_image_url: String? = null,
    val category: String = "general",
    val is_free: Boolean = true,
    val is_active: Boolean = true,
    val display_order: Int = 0,
)

@Serializable
data class ArSticker(
    val id: String,
    val name: String,
    val file_url: String,
    val file_type: String = "svga",
    val preview_image_url: String? = null,
    val category: String = "general",
    val is_free: Boolean = true,
    val is_active: Boolean = true,
    val display_order: Int = 0,
)

@Serializable
data class AvatarFrame(
    val id: String,
    val name: String,
    val frame_url: String,
    val preview_url: String? = null,
    val category: String? = null,
    val is_premium: Boolean = false,
    val price_diamonds: Int = 0,
    val min_level: Int = 0,
)

@Serializable
data class VipPackage(
    val id: String,
    val name: String,
    val level: Int,
    val price_diamonds: Int,
    val duration_days: Int,
    val benefits: List<String> = emptyList(),
    val badge_url: String? = null,
)

@Serializable
data class RechargePackage(
    val id: String,
    val name: String,
    val coins: Int,
    val price_bdt: Double,
    val bonus_coins: Int = 0,
    val is_popular: Boolean = false,
    val google_product_id: String? = null,
)

@Serializable
data class Banner(
    val id: String,
    val title: String,
    val image_url: String? = null,
    val link_url: String? = null,
    val link_type: String? = null,
    val is_active: Boolean = true,
    val display_order: Int = 0,
)

@Serializable
data class Agency(
    val id: String,
    val name: String,
    val agency_code: String,
    val logo_url: String? = null,
    val level: String? = null,
    val total_hosts: Int = 0,
    val diamond_balance: Int = 0,
    val commission_rate: Double = 0.0,
    val is_active: Boolean = true,
)

// ===== Additional Models for Adapters =====

@Serializable
data class Conversation(
    val id: String,
    val otherUserId: String,
    val otherUserName: String? = null,
    val otherUserAvatar: String? = null,
    val lastMessage: String? = null,
    val lastMessageTime: String? = null,
    val unreadCount: Int = 0,
    val isOnline: Boolean = false,
) {
    val senderId: String get() = otherUserId
    val content: String? get() = lastMessage
    val timeFormatted: String? get() = lastMessageTime
}

@Serializable
data class AppNotification(
    val id: String,
    val title: String,
    val body: String? = null,
    val type: String = "system",
    val isRead: Boolean = false,
    val timeFormatted: String? = null,
    val data: String? = null,
)

@Serializable
data class ShopItem(
    val id: String,
    val name: String,
    val previewUrl: String? = null,
    val priceDiamonds: Int = 0,
    val category: String = "frame",
    val isOwned: Boolean = false,
)

@Serializable
data class Transaction(
    val id: String,
    val type: String,
    val amount: Int = 0,
    val dateFormatted: String? = null,
    val status: String = "completed",
)

@Serializable
data class AgencyHost(
    val hostId: String,
    val displayName: String? = null,
    val avatarUrl: String? = null,
    val app_uid: String? = null,
    val status: String? = "active",
    val totalEarnings: Long = 0,
)

@Serializable
data class EarningsTransfer(
    val id: String,
    val transferType: String = "gift",
    val amount: Int = 0,
    val status: String = "pending",
    val dateFormatted: String? = null,
)

@Serializable
data class LiveChatMessage(
    val id: String,
    val senderName: String,
    val message: String,
    val senderId: String? = null,
    val levelEmoji: String? = null,
    val giftId: String? = null,
)

// Extension properties for Gift adapter compatibility
val Gift.imageUrl: String? get() = icon_url
val Gift.coinPrice: Int get() = coin_price

// Extension properties for ChatMessage adapter compatibility
val ChatMessage.senderId: String get() = sender_id
val ChatMessage.timeFormatted: String? get() = created_at

// Extension properties for LeaderboardEntry adapter compatibility
val LeaderboardEntry.userId: String get() = user_id
val LeaderboardEntry.displayName: String? get() = display_name
val LeaderboardEntry.avatarUrl: String? get() = avatar_url

// Extension properties for ArSticker adapter compatibility
val ArSticker.previewImageUrl: String? get() = preview_image_url

// Extension properties for RechargePackage adapter compatibility
val RechargePackage.diamonds: Int get() = coins
val RechargePackage.priceDisplay: String get() = "৳${price_bdt.toInt()}"
