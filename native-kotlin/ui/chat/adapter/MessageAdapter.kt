package com.merilive.app.ui.chat.adapter

import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import android.widget.LinearLayout
import android.widget.TextView
import androidx.recyclerview.widget.DiffUtil
import androidx.recyclerview.widget.ListAdapter
import androidx.recyclerview.widget.RecyclerView
import com.merilive.app.R
import com.merilive.app.data.model.ChatMessage

class MessageAdapter(
    private val currentUserId: String
) : ListAdapter<ChatMessage, MessageAdapter.ViewHolder>(DIFF) {

    companion object {
        private val DIFF = object : DiffUtil.ItemCallback<ChatMessage>() {
            override fun areItemsTheSame(a: ChatMessage, b: ChatMessage) = a.id == b.id
            override fun areContentsTheSame(a: ChatMessage, b: ChatMessage) = a == b
        }
    }

    inner class ViewHolder(view: View) : RecyclerView.ViewHolder(view) {
        val layoutReceived: LinearLayout = view.findViewById(R.id.layoutReceived)
        val layoutSent: LinearLayout = view.findViewById(R.id.layoutSent)
        val tvReceivedText: TextView = view.findViewById(R.id.tvReceivedText)
        val tvReceivedTime: TextView = view.findViewById(R.id.tvReceivedTime)
        val tvSentText: TextView = view.findViewById(R.id.tvSentText)
        val tvSentTime: TextView = view.findViewById(R.id.tvSentTime)
    }

    override fun onCreateViewHolder(parent: ViewGroup, viewType: Int): ViewHolder {
        val view = LayoutInflater.from(parent.context).inflate(R.layout.item_message, parent, false)
        return ViewHolder(view)
    }

    override fun onBindViewHolder(holder: ViewHolder, position: Int) {
        val msg = getItem(position)
        val isMine = msg.sender_id == currentUserId

        if (isMine) {
            holder.layoutSent.visibility = View.VISIBLE
            holder.layoutReceived.visibility = View.GONE

            // Message content based on type
            val displayText = when (msg.message_type) {
                "gift" -> msg.content ?: "🎁 Gift"
                "image" -> "📷 Photo"
                "call" -> "📞 Call"
                else -> msg.content ?: ""
            }
            holder.tvSentText.text = displayText

            // Delivery status checkmarks — uses msg.status (DB column)
            val statusIcon = when (msg.status) {
                "sending" -> "⏳"
                "sent" -> "✓"
                "delivered" -> "✓✓"
                "read" -> "✓✓" // blue tint in real app
                "failed" -> "❌"
                else -> "✓"
            }
            val timeStr = formatTime(msg.created_at)
            holder.tvSentTime.text = "$timeStr $statusIcon"
        } else {
            holder.layoutReceived.visibility = View.VISIBLE
            holder.layoutSent.visibility = View.GONE

            val displayText = when (msg.message_type) {
                "gift" -> msg.content ?: "🎁 Gift"
                "image" -> "📷 Photo"
                "call" -> "📞 Call"
                else -> msg.content ?: ""
            }
            holder.tvReceivedText.text = displayText
            holder.tvReceivedTime.text = formatTime(msg.created_at) ?: ""
        }
    }

    private fun formatTime(iso: String?): String? {
        if (iso == null) return null
        return try {
            val sdf = java.text.SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss", java.util.Locale.US)
            sdf.timeZone = java.util.TimeZone.getTimeZone("UTC")
            val date = sdf.parse(iso.take(19)) ?: return iso
            val outFmt = java.text.SimpleDateFormat("hh:mm a", java.util.Locale.US)
            outFmt.format(date)
        } catch (_: Exception) { iso.takeLast(8) }
    }
}
