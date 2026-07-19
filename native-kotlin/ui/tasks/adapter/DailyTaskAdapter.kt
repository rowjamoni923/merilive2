package com.merilive.app.ui.tasks.adapter

import android.graphics.Color
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import androidx.recyclerview.widget.RecyclerView
import com.merilive.app.R
import com.merilive.app.data.repository.DailyTaskData
import com.merilive.app.data.repository.TaskProgressData
import com.merilive.app.databinding.ItemDailyTaskBinding

class DailyTaskAdapter(
    private val onClaim: (taskId: String) -> Unit,
) : RecyclerView.Adapter<DailyTaskAdapter.ViewHolder>() {

    private var tasks: List<DailyTaskData> = emptyList()
    private var progress: Map<String, TaskProgressData> = emptyMap()
    private var claimingId: String? = null

    fun submitList(
        newTasks: List<DailyTaskData>,
        newProgress: Map<String, TaskProgressData>,
        claimingTaskId: String? = null,
    ) {
        tasks = newTasks
        progress = newProgress
        claimingId = claimingTaskId
        notifyDataSetChanged()
    }

    inner class ViewHolder(val binding: ItemDailyTaskBinding) : RecyclerView.ViewHolder(binding.root) {
        fun bind(task: DailyTaskData) {
            val p = progress[task.id]
            val current = p?.current_progress ?: 0
            val required = task.requirement_value ?: 1
            val isCompleted = p?.is_completed == true
            val isClaimed = p?.is_claimed == true
            val isClaiming = claimingId == task.id

            binding.tvTaskTitle.text = task.title ?: "Task"
            binding.tvTaskDescription.text = task.description ?: ""
            binding.tvProgress.text = "$current / $required"
            binding.progressBar.max = required
            binding.progressBar.progress = current.coerceAtMost(required)

            // Reward text
            val rewardParts = mutableListOf<String>()
            task.reward_beans?.let { if (it > 0) rewardParts.add("+$it Beans") }
            task.reward_diamonds?.let { if (it > 0) rewardParts.add("+$it 💎") }
            binding.tvReward.text = rewardParts.joinToString(" ")

            // Icon color
            try {
                val color = Color.parseColor(task.icon_color ?: "#9333EA")
                binding.ivTaskIcon.setColorFilter(color)
            } catch (_: Exception) {}

            // Button state
            when {
                isClaimed -> {
                    binding.btnClaim.text = "✓ Claimed"
                    binding.btnClaim.isEnabled = false
                    binding.btnClaim.alpha = 0.5f
                }
                isCompleted -> {
                    binding.btnClaim.text = if (isClaiming) "..." else "Claim"
                    binding.btnClaim.isEnabled = !isClaiming
                    binding.btnClaim.alpha = 1f
                    binding.btnClaim.setOnClickListener { onClaim(task.id) }
                }
                else -> {
                    binding.btnClaim.text = "Go"
                    binding.btnClaim.isEnabled = true
                    binding.btnClaim.alpha = 0.7f
                    binding.btnClaim.setOnClickListener { /* Navigate to relevant section */ }
                }
            }
        }
    }

    override fun onCreateViewHolder(parent: ViewGroup, viewType: Int): ViewHolder {
        val binding = ItemDailyTaskBinding.inflate(LayoutInflater.from(parent.context), parent, false)
        return ViewHolder(binding)
    }

    override fun onBindViewHolder(holder: ViewHolder, position: Int) = holder.bind(tasks[position])
    override fun getItemCount() = tasks.size
}
