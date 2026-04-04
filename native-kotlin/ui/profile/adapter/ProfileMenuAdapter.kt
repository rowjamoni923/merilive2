package com.merilive.app.ui.profile.adapter

import android.view.LayoutInflater
import android.view.ViewGroup
import androidx.recyclerview.widget.RecyclerView
import com.merilive.app.databinding.ItemProfileMenuBinding
import com.merilive.app.ui.profile.ProfileMenuItem

class ProfileMenuAdapter(
    private val items: List<ProfileMenuItem>,
    private val onClick: (ProfileMenuItem) -> Unit,
) : RecyclerView.Adapter<ProfileMenuAdapter.ViewHolder>() {

    inner class ViewHolder(val binding: ItemProfileMenuBinding) : RecyclerView.ViewHolder(binding.root) {
        fun bind(item: ProfileMenuItem) {
            binding.ivIcon.setImageResource(item.iconRes)
            binding.tvTitle.text = item.title
            binding.root.setOnClickListener { onClick(item) }
        }
    }

    override fun onCreateViewHolder(parent: ViewGroup, viewType: Int): ViewHolder {
        val binding = ItemProfileMenuBinding.inflate(LayoutInflater.from(parent.context), parent, false)
        return ViewHolder(binding)
    }

    override fun onBindViewHolder(holder: ViewHolder, position: Int) = holder.bind(items[position])
    override fun getItemCount() = items.size
}
