package com.merilive.app.ui.home.adapter

import android.view.LayoutInflater
import android.view.ViewGroup
import androidx.recyclerview.widget.RecyclerView
import coil.load
import coil.transform.RoundedCornersTransformation
import com.merilive.app.data.repository.ActiveStream
import com.merilive.app.data.repository.BannerResponse
import com.merilive.app.data.repository.PartyRoomResponse
import com.merilive.app.databinding.ItemBannerBinding
import com.merilive.app.databinding.ItemLiveStreamBinding
import com.merilive.app.databinding.ItemPartyRoomBinding

// ===== Banner Adapter (with click handler) =====
class BannerAdapter(
    private val banners: List<BannerResponse>,
    private val onClick: (BannerResponse) -> Unit = {},
) : RecyclerView.Adapter<BannerAdapter.VH>() {

    inner class VH(val binding: ItemBannerBinding) : RecyclerView.ViewHolder(binding.root)

    override fun onCreateViewHolder(parent: ViewGroup, viewType: Int): VH {
        return VH(ItemBannerBinding.inflate(LayoutInflater.from(parent.context), parent, false))
    }

    override fun onBindViewHolder(holder: VH, position: Int) {
        val banner = banners[position]
        holder.binding.ivBanner.load(banner.image_url) {
            crossfade(true)
            transformations(RoundedCornersTransformation(16f))
        }
        holder.binding.root.setOnClickListener { onClick(banner) }
    }

    override fun getItemCount() = banners.size
}

// ===== Live Stream Adapter =====
class LiveStreamAdapter(
    private val streams: List<ActiveStream>,
    private val onClick: (ActiveStream) -> Unit,
) : RecyclerView.Adapter<LiveStreamAdapter.VH>() {

    inner class VH(val binding: ItemLiveStreamBinding) : RecyclerView.ViewHolder(binding.root)

    override fun onCreateViewHolder(parent: ViewGroup, viewType: Int): VH {
        return VH(ItemLiveStreamBinding.inflate(LayoutInflater.from(parent.context), parent, false))
    }

    override fun onBindViewHolder(holder: VH, position: Int) {
        val stream = streams[position]
        holder.binding.apply {
            ivThumbnail.load(stream.thumbnail_url) {
                crossfade(true)
                transformations(RoundedCornersTransformation(12f))
            }
            ivAvatar.load(stream.host_avatar) { crossfade(true) }
            tvHostName.text = stream.host_name ?: "Host"
            tvViewerCount.text = "${stream.viewer_count}"
            tvCountryFlag.text = stream.host_country_flag ?: "🌍"
            tvCategory.text = stream.category ?: ""

            root.setOnClickListener { onClick(stream) }
        }
    }

    override fun getItemCount() = streams.size
}

// ===== Party Room Adapter =====
class PartyRoomAdapter(
    private val rooms: List<PartyRoomResponse>,
    private val onClick: (PartyRoomResponse) -> Unit,
) : RecyclerView.Adapter<PartyRoomAdapter.VH>() {

    inner class VH(val binding: ItemPartyRoomBinding) : RecyclerView.ViewHolder(binding.root)

    override fun onCreateViewHolder(parent: ViewGroup, viewType: Int): VH {
        return VH(ItemPartyRoomBinding.inflate(LayoutInflater.from(parent.context), parent, false))
    }

    override fun onBindViewHolder(holder: VH, position: Int) {
        val room = rooms[position]
        holder.binding.apply {
            ivCover.load(room.cover_image_url) {
                crossfade(true)
                transformations(RoundedCornersTransformation(12f))
            }
            tvRoomName.text = room.name
            tvHostName.text = room.host?.display_name ?: "Host"
            tvViewerCount.text = "${room.viewer_count}"
            tvCategory.text = room.category ?: ""

            root.setOnClickListener { onClick(room) }
        }
    }

    override fun getItemCount() = rooms.size
}
