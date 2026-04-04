package com.merilive.app.ui.notifications.adapter

import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import android.widget.ImageView
import android.widget.TextView
import androidx.recyclerview.widget.DiffUtil
import androidx.recyclerview.widget.ListAdapter
import androidx.recyclerview.widget.RecyclerView
import com.merilive.app.R
import com.merilive.app.data.model.AppNotification

class NotificationAdapter(
    private val onItemClick: (AppNotification) -> Unit
) : ListAdapter<AppNotification, NotificationAdapter.ViewHolder>(DIFF) {

    companion object {
        private val DIFF = object : DiffUtil.ItemCallback<AppNotification>() {
            override fun areItemsTheSame(a: AppNotification, b: AppNotification) = a.id == b.id
            override fun areContentsTheSame(a: AppNotification, b: AppNotification) = a == b
        }
    }

    inner class ViewHolder(view: View) : RecyclerView.ViewHolder(view) {
        val ivIcon: ImageView = view.findViewById(R.id.ivIcon)
        val tvTitle: TextView = view.findViewById(R.id.tvTitle)
        val tvBody: TextView = view.findViewById(R.id.tvBody)
        val tvTime: TextView = view.findViewById(R.id.tvTime)

        init {
            view.setOnClickListener {
                val pos = bindingAdapterPosition
                if (pos != RecyclerView.NO_POSITION) onItemClick(getItem(pos))
            }
        }
    }

    override fun onCreateViewHolder(parent: ViewGroup, viewType: Int): ViewHolder {
        return ViewHolder(LayoutInflater.from(parent.context).inflate(R.layout.item_notification, parent, false))
    }

    override fun onBindViewHolder(holder: ViewHolder, position: Int) {
        val item = getItem(position)
        holder.tvTitle.text = item.title
        holder.tvBody.text = item.body ?: ""
        holder.tvTime.text = item.timeFormatted ?: ""
        // Set icon based on notification type
        val iconRes = when (item.type) {
            "gift" -> R.drawable.ic_gift
            "call" -> R.drawable.ic_call
            "follow" -> R.drawable.ic_profile
            "message" -> R.drawable.ic_chat
            else -> R.drawable.ic_notification
        }
        holder.ivIcon.setImageResource(iconRes)
    }
}
