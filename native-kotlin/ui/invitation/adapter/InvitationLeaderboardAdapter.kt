package com.merilive.app.ui.invitation.adapter

import android.view.LayoutInflater
import android.view.ViewGroup
import androidx.recyclerview.widget.RecyclerView
import coil.load
import coil.transform.CircleCropTransformation
import com.merilive.app.R
import com.merilive.app.data.repository.InvitationLeaderboardEntry
import com.merilive.app.databinding.ItemLeaderboardBinding

class InvitationLeaderboardAdapter : RecyclerView.Adapter<InvitationLeaderboardAdapter.ViewHolder>() {

    private var items: List<InvitationLeaderboardEntry> = emptyList()

    fun submitList(newItems: List<InvitationLeaderboardEntry>) {
        items = newItems
        notifyDataSetChanged()
    }

    inner class ViewHolder(val binding: ItemLeaderboardBinding) : RecyclerView.ViewHolder(binding.root) {
        fun bind(entry: InvitationLeaderboardEntry, position: Int) {
            binding.tvRank.text = "#${position + 1}"
            binding.tvName.text = entry.display_name ?: "User"
            binding.tvScore.text = "${entry.total_invites ?: 0} invites"
            binding.ivAvatar.load(entry.avatar_url) {
                crossfade(true)
                placeholder(R.drawable.ic_avatar_placeholder)
                error(R.drawable.ic_avatar_placeholder)
                transformations(CircleCropTransformation())
            }
        }
    }

    override fun onCreateViewHolder(parent: ViewGroup, viewType: Int): ViewHolder {
        val binding = ItemLeaderboardBinding.inflate(LayoutInflater.from(parent.context), parent, false)
        return ViewHolder(binding)
    }

    override fun onBindViewHolder(holder: ViewHolder, position: Int) = holder.bind(items[position], position)
    override fun getItemCount() = items.size
}
