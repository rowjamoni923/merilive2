package com.merilive.app.ui.live.adapter

import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import android.widget.TextView
import androidx.recyclerview.widget.DiffUtil
import androidx.recyclerview.widget.ListAdapter
import androidx.recyclerview.widget.RecyclerView
import com.merilive.app.R
import com.merilive.app.data.model.LiveChatMessage

class LiveChatAdapter : ListAdapter<LiveChatMessage, LiveChatAdapter.ViewHolder>(DIFF) {

    companion object {
        private val DIFF = object : DiffUtil.ItemCallback<LiveChatMessage>() {
            override fun areItemsTheSame(a: LiveChatMessage, b: LiveChatMessage) = a.id == b.id
            override fun areContentsTheSame(a: LiveChatMessage, b: LiveChatMessage) = a == b
        }
    }

    inner class ViewHolder(view: View) : RecyclerView.ViewHolder(view) {
        val tvEmoji: TextView = view.findViewById(R.id.tvEmoji)
        val tvChatText: TextView = view.findViewById(R.id.tvChatText)
    }

    override fun onCreateViewHolder(parent: ViewGroup, viewType: Int): ViewHolder {
        return ViewHolder(LayoutInflater.from(parent.context).inflate(R.layout.item_live_chat, parent, false))
    }

    override fun onBindViewHolder(holder: ViewHolder, position: Int) {
        val item = getItem(position)
        holder.tvEmoji.text = item.levelEmoji ?: "💬"
        val formatted = buildString {
            append(item.senderName)
            append(": ")
            append(item.message)
        }
        holder.tvChatText.text = formatted
    }
}
