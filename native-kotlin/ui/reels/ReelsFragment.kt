package com.merilive.app.ui.reels

import android.os.Bundle
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import android.widget.Toast
import androidx.fragment.app.Fragment
import androidx.fragment.app.viewModels
import androidx.lifecycle.ViewModel
import androidx.lifecycle.lifecycleScope
import androidx.lifecycle.viewModelScope
import androidx.navigation.fragment.findNavController
import androidx.recyclerview.widget.LinearLayoutManager
import androidx.recyclerview.widget.PagerSnapHelper
import androidx.recyclerview.widget.RecyclerView
import com.merilive.app.R
import dagger.hilt.android.AndroidEntryPoint
import dagger.hilt.android.lifecycle.HiltViewModel
import io.github.jan.supabase.auth.Auth
import io.github.jan.supabase.postgrest.Postgrest
import io.github.jan.supabase.postgrest.query.Columns
import io.github.jan.supabase.postgrest.query.Order
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import kotlinx.serialization.Serializable
import javax.inject.Inject

@AndroidEntryPoint
class ReelsFragment : Fragment() {

    private val viewModel: ReelsViewModel by viewModels()

    override fun onCreateView(inflater: LayoutInflater, container: ViewGroup?, savedInstanceState: Bundle?): View {
        val rv = RecyclerView(requireContext()).apply {
            layoutParams = ViewGroup.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT)
            setBackgroundColor(resources.getColor(R.color.background, null))
            layoutManager = LinearLayoutManager(requireContext(), LinearLayoutManager.VERTICAL, false)
        }
        PagerSnapHelper().attachToRecyclerView(rv)

        viewModel.loadReels()
        viewLifecycleOwner.lifecycleScope.launch {
            viewModel.reels.collect { reels ->
                rv.adapter = ReelsAdapter(
                    reels = reels,
                    onProfileClick = { reel ->
                        val bundle = Bundle().apply { putString("userId", reel.user_id) }
                        findNavController().navigate(R.id.userProfileFragment, bundle)
                    },
                    onLikeClick = { reel -> viewModel.toggleLike(reel) },
                    onCommentClick = { reel ->
                        Toast.makeText(requireContext(), "Comments coming soon", Toast.LENGTH_SHORT).show()
                    },
                    onShareClick = { reel -> viewModel.shareReel(requireContext(), reel) },
                    onFollowClick = { reel -> viewModel.followUser(reel.user_id) },
                )
            }
        }
        return rv
    }
}

@HiltViewModel
class ReelsViewModel @Inject constructor(
    private val auth: Auth,
    private val postgrest: Postgrest,
) : ViewModel() {
    private val _reels = MutableStateFlow<List<ReelItem>>(emptyList())
    val reels = _reels.asStateFlow()

    private val likedReelIds = mutableSetOf<String>()

    fun loadReels() {
        viewModelScope.launch {
            try {
                _reels.value = postgrest.from("reels")
                    .select(Columns.raw("""
                        id, user_id, video_url, thumbnail_url, caption,
                        likes_count, comments_count, views_count, sound_name,
                        created_at,
                        user:profiles!reels_user_id_fkey(id, display_name, avatar_url, level, is_verified)
                    """.trimIndent())) {
                        filter { eq("is_active", true) }
                        order("created_at", Order.DESCENDING)
                        limit(50)
                    }
                    .decodeList()

                // Load user's liked reels
                val userId = auth.currentSessionOrNull()?.user?.id ?: return@launch
                val likes = postgrest.from("reel_likes")
                    .select(Columns.raw("reel_id")) {
                        filter { eq("user_id", userId) }
                    }
                    .decodeList<ReelLikeResponse>()
                likedReelIds.addAll(likes.map { it.reel_id })
            } catch (_: Exception) {}
        }
    }

    fun toggleLike(reel: ReelItem) {
        viewModelScope.launch {
            try {
                val userId = auth.currentSessionOrNull()?.user?.id ?: return@launch
                if (likedReelIds.contains(reel.id)) {
                    postgrest.from("reel_likes").delete {
                        filter {
                            eq("reel_id", reel.id)
                            eq("user_id", userId)
                        }
                    }
                    likedReelIds.remove(reel.id)
                    _reels.value = _reels.value.map {
                        if (it.id == reel.id) it.copy(likes_count = it.likes_count - 1) else it
                    }
                } else {
                    postgrest.from("reel_likes").insert(mapOf(
                        "reel_id" to reel.id,
                        "user_id" to userId,
                    ))
                    likedReelIds.add(reel.id)
                    _reels.value = _reels.value.map {
                        if (it.id == reel.id) it.copy(likes_count = it.likes_count + 1) else it
                    }
                }
            } catch (_: Exception) {}
        }
    }

    fun followUser(userId: String) {
        viewModelScope.launch {
            try {
                val myId = auth.currentSessionOrNull()?.user?.id ?: return@launch
                postgrest.rpc("follow_user", kotlinx.serialization.json.buildJsonObject {
                    put("_target_id", userId)
                })
            } catch (_: Exception) {}
        }
    }

    fun shareReel(context: android.content.Context, reel: ReelItem) {
        val intent = android.content.Intent(android.content.Intent.ACTION_SEND).apply {
            type = "text/plain"
            putExtra(android.content.Intent.EXTRA_TEXT, "Check out this reel on MeriLive! ${reel.video_url}")
        }
        context.startActivity(android.content.Intent.createChooser(intent, "Share Reel"))
    }
}

@Serializable
data class ReelItem(
    val id: String,
    val user_id: String,
    val video_url: String,
    val thumbnail_url: String? = null,
    val caption: String? = null,
    val likes_count: Int = 0,
    val comments_count: Int = 0,
    val views_count: Int = 0,
    val sound_name: String? = null,
    val created_at: String? = null,
    val user: ReelUserInfo? = null,
)

@Serializable
data class ReelUserInfo(
    val id: String,
    val display_name: String? = null,
    val avatar_url: String? = null,
    val level: Int? = null,
    val is_verified: Boolean? = null,
)

@Serializable
data class ReelLikeResponse(val reel_id: String)
