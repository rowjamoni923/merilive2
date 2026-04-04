package com.merilive.app.ui.party

import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import androidx.recyclerview.widget.DiffUtil
import androidx.recyclerview.widget.ListAdapter
import androidx.recyclerview.widget.RecyclerView
import coil.load
import coil.transform.CircleCropTransformation
import com.merilive.app.R
import com.merilive.app.databinding.ItemPartySeatBinding

class PartySeatAdapter(
    private val onSeatClick: (PartySeat) -> Unit,
    private val onKick: (PartySeat) -> Unit,
    private val onMute: (PartySeat) -> Unit
) : ListAdapter<PartySeat, PartySeatAdapter.ViewHolder>(DIFF) {

    companion object {
        private val DIFF = object : DiffUtil.ItemCallback<PartySeat>() {
            override fun areItemsTheSame(a: PartySeat, b: PartySeat) = a.seatIndex == b.seatIndex
            override fun areContentsTheSame(a: PartySeat, b: PartySeat) = a == b
        }
    }

    inner class ViewHolder(private val binding: ItemPartySeatBinding) :
        RecyclerView.ViewHolder(binding.root) {
        fun bind(seat: PartySeat) {
            if (seat.userId != null) {
                // Occupied seat
                binding.ivAvatar.visibility = View.VISIBLE
                binding.tvName.text = seat.displayName ?: "User"
                binding.tvName.visibility = View.VISIBLE
                binding.ivAvatar.load(seat.avatarUrl) {
                    placeholder(R.drawable.ic_avatar_placeholder)
                    error(R.drawable.ic_avatar_placeholder)
                    transformations(CircleCropTransformation())
                }
                binding.ivMuted.visibility = if (seat.isMuted) View.VISIBLE else View.GONE
                binding.ivSpeaking.visibility = if (seat.isSpeaking) View.VISIBLE else View.GONE
                binding.ivEmpty.visibility = View.GONE
            } else if (seat.isLocked) {
                // Locked seat
                binding.ivAvatar.visibility = View.GONE
                binding.tvName.text = "🔒"
                binding.tvName.visibility = View.VISIBLE
                binding.ivMuted.visibility = View.GONE
                binding.ivSpeaking.visibility = View.GONE
                binding.ivEmpty.visibility = View.GONE
            } else {
                // Empty seat
                binding.ivAvatar.visibility = View.GONE
                binding.tvName.visibility = View.GONE
                binding.ivMuted.visibility = View.GONE
                binding.ivSpeaking.visibility = View.GONE
                binding.ivEmpty.visibility = View.VISIBLE
            }

            binding.root.setOnClickListener { onSeatClick(seat) }
            binding.root.setOnLongClickListener {
                if (seat.userId != null) {
                    // Show popup for kick/mute
                    val popup = android.widget.PopupMenu(binding.root.context, binding.root)
                    popup.menu.add("Kick").setOnMenuItemClickListener { onKick(seat); true }
                    popup.menu.add(if (seat.isMuted) "Unmute" else "Mute").setOnMenuItemClickListener { onMute(seat); true }
                    popup.show()
                }
                true
            }
        }
    }

    override fun onCreateViewHolder(parent: ViewGroup, viewType: Int) = ViewHolder(
        ItemPartySeatBinding.inflate(LayoutInflater.from(parent.context), parent, false)
    )

    override fun onBindViewHolder(holder: ViewHolder, position: Int) = holder.bind(getItem(position))
}
