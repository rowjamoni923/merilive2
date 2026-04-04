package com.merilive.app.ui.live

import android.view.LayoutInflater
import android.view.ViewGroup
import androidx.recyclerview.widget.DiffUtil
import androidx.recyclerview.widget.ListAdapter
import androidx.recyclerview.widget.RecyclerView
import com.merilive.app.databinding.ItemMusicTrackBinding

class MusicTrackAdapter(
    private val onPlay: (MusicTrack) -> Unit
) : ListAdapter<MusicTrack, MusicTrackAdapter.ViewHolder>(DIFF) {

    var currentPlayingId: String? = null

    companion object {
        private val DIFF = object : DiffUtil.ItemCallback<MusicTrack>() {
            override fun areItemsTheSame(a: MusicTrack, b: MusicTrack) = a.id == b.id
            override fun areContentsTheSame(a: MusicTrack, b: MusicTrack) = a == b
        }
    }

    inner class ViewHolder(private val binding: ItemMusicTrackBinding) :
        RecyclerView.ViewHolder(binding.root) {
        fun bind(track: MusicTrack) {
            binding.tvTitle.text = track.title
            binding.tvArtist.text = track.artist
            binding.tvDuration.text = track.duration_seconds?.let { "${it / 60}:${String.format("%02d", it % 60)}" } ?: ""
            binding.btnPlay.setImageResource(
                if (track.id == currentPlayingId) android.R.drawable.ic_media_pause
                else android.R.drawable.ic_media_play
            )
            binding.root.alpha = if (track.id == currentPlayingId) 1f else 0.7f
            binding.root.setOnClickListener { onPlay(track) }
            binding.btnPlay.setOnClickListener { onPlay(track) }
        }
    }

    override fun onCreateViewHolder(parent: ViewGroup, viewType: Int) = ViewHolder(
        ItemMusicTrackBinding.inflate(LayoutInflater.from(parent.context), parent, false)
    )

    override fun onBindViewHolder(holder: ViewHolder, position: Int) = holder.bind(getItem(position))
}
