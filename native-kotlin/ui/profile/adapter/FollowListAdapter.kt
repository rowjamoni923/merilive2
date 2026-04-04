package com.merilive.app.ui.profile.adapter

import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import android.widget.ImageView
import android.widget.TextView
import androidx.recyclerview.widget.DiffUtil
import androidx.recyclerview.widget.ListAdapter
import androidx.recyclerview.widget.RecyclerView
import coil.load
import coil.transform.CircleCropTransformation
import com.merilive.app.R
import com.merilive.app.data.repository.FollowUser

class FollowListAdapter(
    private val onItemClick: (FollowUser) -> Unit
) : ListAdapter<FollowUser, FollowListAdapter.ViewHolder>(DIFF) {

    companion object {
        private val DIFF = object : DiffUtil.ItemCallback<FollowUser>() {
            override fun areItemsTheSame(a: FollowUser, b: FollowUser) = a.id == b.id
            override fun areContentsTheSame(a: FollowUser, b: FollowUser) = a == b
        }
    }

    inner class ViewHolder(view: View) : RecyclerView.ViewHolder(view) {
        val ivAvatar: ImageView = view.findViewById(R.id.ivAvatar)
        val tvName: TextView = view.findViewById(R.id.tvName)
        val tvUid: TextView = view.findViewById(R.id.tvUid)

        init {
            view.setOnClickListener {
                val pos = bindingAdapterPosition
                if (pos != RecyclerView.NO_POSITION) onItemClick(getItem(pos))
            }
        }
    }

    override fun onCreateViewHolder(parent: ViewGroup, viewType: Int): ViewHolder {
        return ViewHolder(LayoutInflater.from(parent.context).inflate(R.layout.item_user, parent, false))
    }

    override fun onBindViewHolder(holder: ViewHolder, position: Int) {
        val item = getItem(position)
        holder.tvName.text = item.display_name ?: "User"
        holder.tvUid.text = "ID: ${item.app_uid ?: item.id.take(8)}"
        item.avatar_url?.let {
            holder.ivAvatar.load(it) { transformations(CircleCropTransformation()) }
        }
    }
}
