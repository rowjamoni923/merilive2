package com.merilive.app.ui.reels

import android.view.LayoutInflater
import android.view.ViewGroup
import androidx.recyclerview.widget.RecyclerView
import coil.load
import coil.transform.CircleCropTransformation
import com.merilive.app.databinding.ItemReelBinding

class ReelsAdapter(
    private val reels: List<ReelItem>,
    private val onProfileClick: (ReelItem) -> Unit,
    private val onLikeClick: (ReelItem) -> Unit,
    private val onCommentClick: (ReelItem) -> Unit,
    private val onShareClick: (ReelItem) -> Unit,
    private val onFollowClick: (ReelItem) -> Unit,
) : RecyclerView.Adapter<ReelsAdapter.ViewHolder>() {

    inner class ViewHolder(val binding: ItemReelBinding) : RecyclerView.ViewHolder(binding.root) {
        fun bind(reel: ReelItem) {
            // Caption & user info
            val userName = reel.user?.display_name ?: "User"
            val verifiedBadge = if (reel.user?.is_verified == true) " ✓" else ""
            binding.tvCaption.text = "@$userName$verifiedBadge\n${reel.caption ?: ""}"

            // Counts
            binding.tvLikes.text = formatCount(reel.likes_count)
            binding.tvComments.text = formatCount(reel.comments_count)

            // Avatar
            reel.user?.avatar_url?.let {
                binding.ivAvatar.load(it) { transformations(CircleCropTransformation()) }
            }

            // Click actions
            binding.ivAvatar.setOnClickListener { onProfileClick(reel) }
            binding.btnLike.setOnClickListener { onLikeClick(reel) }
            binding.btnComment.setOnClickListener { onCommentClick(reel) }
            binding.btnShareReel.setOnClickListener { onShareClick(reel) }

            // Thumbnail as placeholder (ExoPlayer would handle video in production)
            reel.thumbnail_url?.let {
                binding.videoSurface.tag = it // Store for potential thumbnail loading
            }
        }

        private fun formatCount(count: Int): String = when {
            count >= 1_000_000 -> String.format("%.1fM", count / 1_000_000.0)
            count >= 1_000 -> String.format("%.1fK", count / 1_000.0)
            else -> count.toString()
        }
    }

    override fun onCreateViewHolder(parent: ViewGroup, viewType: Int): ViewHolder {
        val binding = ItemReelBinding.inflate(LayoutInflater.from(parent.context), parent, false)
        return ViewHolder(binding)
    }

    override fun onBindViewHolder(holder: ViewHolder, position: Int) = holder.bind(reels[position])
    override fun getItemCount() = reels.size
}
