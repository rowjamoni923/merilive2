package com.merilive.app.ui.tasks

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.merilive.app.data.repository.*
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import java.text.SimpleDateFormat
import java.util.*
import javax.inject.Inject

data class TasksUiState(
    val loading: Boolean = true,
    val tasks: List<DailyTaskData> = emptyList(),
    val progress: Map<String, TaskProgressData> = emptyMap(),
    val isHost: Boolean = false,
    val claimingTaskId: String? = null,
    val rewardPopup: Pair<Int, Int>? = null, // beans, diamonds
    val resetDate: String = "",
)

@HiltViewModel
class TasksViewModel @Inject constructor(
    private val taskRepository: TaskRepository,
) : ViewModel() {

    private val _state = MutableStateFlow(TasksUiState())
    val state = _state.asStateFlow()

    fun loadTasks() {
        viewModelScope.launch {
            _state.value = _state.value.copy(loading = true)
            try {
                val resetDate = getTaskResetDate()
                val tasks = taskRepository.getDailyTasks()
                val progress = taskRepository.getTaskProgress(resetDate)
                val progressMap = progress.associateBy { it.task_id }

                _state.value = _state.value.copy(
                    loading = false,
                    tasks = tasks,
                    progress = progressMap,
                    resetDate = resetDate,
                )
            } catch (e: Exception) {
                _state.value = _state.value.copy(loading = false)
            }
        }
    }

    fun claimTask(taskId: String) {
        viewModelScope.launch {
            _state.value = _state.value.copy(claimingTaskId = taskId)
            try {
                val result = taskRepository.claimTask(taskId, _state.value.resetDate)
                if (result.success) {
                    _state.value = _state.value.copy(
                        rewardPopup = Pair(result.beans_earned, result.diamonds_earned)
                    )
                    loadTasks() // Refresh
                }
            } catch (_: Exception) {
            } finally {
                _state.value = _state.value.copy(claimingTaskId = null)
            }
        }
    }

    fun dismissReward() {
        _state.value = _state.value.copy(rewardPopup = null)
    }

    private fun getTaskResetDate(): String {
        val cal = Calendar.getInstance(TimeZone.getTimeZone("Asia/Dhaka"))
        val hour = cal.get(Calendar.HOUR_OF_DAY)
        val minute = cal.get(Calendar.MINUTE)
        // Reset at 12:30 AM BST
        if (hour == 0 && minute < 30) {
            cal.add(Calendar.DAY_OF_YEAR, -1)
        }
        val sdf = SimpleDateFormat("yyyy-MM-dd", Locale.US)
        sdf.timeZone = TimeZone.getTimeZone("Asia/Dhaka")
        return sdf.format(cal.time)
    }
}
