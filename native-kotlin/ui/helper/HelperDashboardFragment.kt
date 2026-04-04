package com.merilive.app.ui.helper

import android.os.Bundle
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import androidx.fragment.app.Fragment
import androidx.fragment.app.viewModels
import androidx.lifecycle.lifecycleScope
import androidx.navigation.fragment.findNavController
import com.merilive.app.R
import com.merilive.app.databinding.FragmentHelperDashboardBinding
import dagger.hilt.android.AndroidEntryPoint
import kotlinx.coroutines.flow.collectLatest
import kotlinx.coroutines.launch

@AndroidEntryPoint
class HelperDashboardFragment : Fragment() {

    private var _binding: FragmentHelperDashboardBinding? = null
    private val binding get() = _binding!!
    private val viewModel: HelperDashboardViewModel by viewModels()

    override fun onCreateView(inflater: LayoutInflater, container: ViewGroup?, savedInstanceState: Bundle?): View {
        _binding = FragmentHelperDashboardBinding.inflate(inflater, container, false)
        return binding.root
    }

    override fun onViewCreated(view: View, savedInstanceState: Bundle?) {
        super.onViewCreated(view, savedInstanceState)

        binding.btnBack.setOnClickListener { findNavController().popBackStack() }
        binding.btnPendingRequests.setOnClickListener {
            findNavController().navigate(R.id.action_helper_to_pendingRequests)
        }
        binding.btnProcessedHistory.setOnClickListener {
            findNavController().navigate(R.id.action_helper_to_processedHistory)
        }
        binding.btnSelfRecharge.setOnClickListener {
            findNavController().navigate(R.id.action_helper_to_selfRecharge)
        }

        viewLifecycleOwner.lifecycleScope.launch {
            viewModel.state.collectLatest { state ->
                binding.progressBar.visibility = if (state.loading) View.VISIBLE else View.GONE
                binding.tvDiamondBalance.text = String.format("%,d", state.stats.totalDiamonds)
                binding.tvTotalProcessed.text = String.format("%,d", state.stats.totalProcessed)
                binding.tvTotalEarned.text = String.format("%,d", state.stats.totalEarned)
                binding.tvPendingCount.text = state.stats.pendingCount.toString()
                binding.tvTodayProcessed.text = state.stats.todayProcessed.toString()
                binding.tvCommissionRate.text = "${(state.stats.commissionRate * 100).toInt()}%"

                state.error?.let {
                    com.google.android.material.snackbar.Snackbar.make(binding.root, it, com.google.android.material.snackbar.Snackbar.LENGTH_SHORT).show()
                    viewModel.clearError()
                }
            }
        }

        viewModel.loadDashboard()
    }

    override fun onDestroyView() { super.onDestroyView(); _binding = null }
}
