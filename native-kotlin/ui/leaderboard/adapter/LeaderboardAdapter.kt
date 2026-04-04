package com.merilive.app.ui.leaderboard.adapter

import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import android.widget.ImageView
import android.widget.TextView
import androidx.recyclerview.widget.RecyclerView
import coil.load
import coil.transform.CircleCropTransformation
import com.merilive.app.R
import com.merilive.app.ui.leaderboard.LeaderboardEntry

class LeaderboardAdapter(
    private val items: List<LeaderboardEntry>,
    private val onItemClick: (LeaderboardEntry) -> Unit
) : RecyclerView.Adapter<LeaderboardAdapter.ViewHolder>() {

    inner class ViewHolder(view: View) : RecyclerView.ViewHolder(view) {
        val tvRank: TextView = view.findViewById(R.id.tvRank)
        val ivAvatar: ImageView = view.findViewById(R.id.ivAvatar)
        val tvName: TextView = view.findViewById(R.id.tvName)
        val tvLevel: TextView = view.findViewById(R.id.tvLevel)
        val tvScore: TextView = view.findViewById(R.id.tvScore)

        init {
            view.setOnClickListener {
                val pos = bindingAdapterPosition
                if (pos != RecyclerView.NO_POSITION) onItemClick(items[pos])
            }
        }
    }

    override fun onCreateViewHolder(parent: ViewGroup, viewType: Int): ViewHolder {
        val view = LayoutInflater.from(parent.context).inflate(R.layout.item_leaderboard, parent, false)
        return ViewHolder(view)
    }

    override fun onBindViewHolder(holder: ViewHolder, position: Int) {
        val item = items[position]
        holder.tvRank.text = "${position + 1}"
        holder.tvName.text = item.displayName
        holder.tvLevel.text = "Lv.${item.level}"
        holder.tvScore.text = formatScore(item.score)
        item.avatarUrl?.let {
            holder.ivAvatar.load(it) { transformations(CircleCropTransformation()) }
        }
    }

    override fun getItemCount() = items.size

    private fun formatScore(score: Long): String {
        return when {
            score >= 1_000_000 -> "${score / 1_000_000}M"
            score >= 1_000 -> "${score / 1_000}K"
            else -> score.toString()
        }
    }
}
