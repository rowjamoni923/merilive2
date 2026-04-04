package com.merilive.app.ui.agency.adapter

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
import com.merilive.app.data.model.AgencyHost

class AgencyHostAdapter(
    private val onItemClick: (AgencyHost) -> Unit
) : ListAdapter<AgencyHost, AgencyHostAdapter.ViewHolder>(DIFF) {

    companion object {
        private val DIFF = object : DiffUtil.ItemCallback<AgencyHost>() {
            override fun areItemsTheSame(a: AgencyHost, b: AgencyHost) = a.hostId == b.hostId
            override fun areContentsTheSame(a: AgencyHost, b: AgencyHost) = a == b
        }
    }

    inner class ViewHolder(view: View) : RecyclerView.ViewHolder(view) {
        val ivAvatar: ImageView = view.findViewById(R.id.ivAvatar)
        val tvName: TextView = view.findViewById(R.id.tvName)
        val tvUid: TextView = view.findViewById(R.id.tvUid)
        val tvStatus: TextView = view.findViewById(R.id.tvStatus)

        init {
            view.setOnClickListener {
                val pos = bindingAdapterPosition
                if (pos != RecyclerView.NO_POSITION) onItemClick(getItem(pos))
            }
        }
    }

    override fun onCreateViewHolder(parent: ViewGroup, viewType: Int): ViewHolder {
        return ViewHolder(LayoutInflater.from(parent.context).inflate(R.layout.item_host, parent, false))
    }

    override fun onBindViewHolder(holder: ViewHolder, position: Int) {
        val item = getItem(position)
        holder.tvName.text = item.displayName ?: "Host"
        holder.tvUid.text = "ID: ${item.app_uid ?: ""}"
        holder.tvStatus.text = item.status ?: "active"
        item.avatarUrl?.let {
            holder.ivAvatar.load(it) { transformations(CircleCropTransformation()) }
        }
    }
}
