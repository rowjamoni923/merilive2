package com.merilive.app.ui.tasks

import android.os.Bundle
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import android.widget.Toast
import androidx.fragment.app.Fragment
import androidx.fragment.app.viewModels
import androidx.lifecycle.lifecycleScope
import androidx.navigation.fragment.findNavController
import androidx.recyclerview.widget.LinearLayoutManager
import com.merilive.app.R
import com.merilive.app.databinding.FragmentTasksBinding
import com.merilive.app.ui.tasks.adapter.DailyTaskAdapter
import dagger.hilt.android.AndroidEntryPoint
import kotlinx.coroutines.flow.collectLatest
import kotlinx.coroutines.launch

@AndroidEntryPoint
class TasksFragment : Fragment() {

    private var _binding: FragmentTasksBinding? = null
    private val binding get() = _binding!!
    private val viewModel: TasksViewModel by viewModels()
    private lateinit var taskAdapter: DailyTaskAdapter

    override fun onCreateView(
        inflater: LayoutInflater, container: ViewGroup?, savedInstanceState: Bundle?
    ): View {
        _binding = FragmentTasksBinding.inflate(inflater, container, false)
        return binding.root
    }

    override fun onViewCreated(view: View, savedInstanceState: Bundle?) {
        super.onViewCreated(view, savedInstanceState)

        binding.btnBack.setOnClickListener { findNavController().popBackStack() }

        taskAdapter = DailyTaskAdapter { taskId ->
            viewModel.claimTask(taskId)
        }
        binding.rvTasks.layoutManager = LinearLayoutManager(requireContext())
        binding.rvTasks.adapter = taskAdapter

        viewLifecycleOwner.lifecycleScope.launch {
            viewModel.state.collectLatest { state ->
                binding.progressBar.visibility = if (state.loading) View.VISIBLE else View.GONE
                binding.rvTasks.visibility = if (state.loading) View.GONE else View.VISIBLE

                taskAdapter.submitList(state.tasks, state.progress, state.claimingTaskId)

                state.rewardPopup?.let { (beans, coins) ->
                    val msg = buildString {
                        if (beans > 0) append("+$beans Beans ")
                        if (coins > 0) append("+$coins Diamonds")
                    }
                    Toast.makeText(requireContext(), "🎉 $msg", Toast.LENGTH_SHORT).show()
                    viewModel.dismissReward()
                }
            }
        }

        viewModel.loadTasks()
    }

    override fun onDestroyView() {
        super.onDestroyView()
        _binding = null
    }
}
