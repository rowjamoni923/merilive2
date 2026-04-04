package com.merilive.app.ui.agency

import android.os.Bundle
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import androidx.fragment.app.Fragment
import androidx.fragment.app.viewModels
import androidx.lifecycle.lifecycleScope
import androidx.navigation.fragment.findNavController
import androidx.recyclerview.widget.LinearLayoutManager
import com.merilive.app.databinding.FragmentAgencyRankingsBinding
import dagger.hilt.android.AndroidEntryPoint
import kotlinx.coroutines.flow.collectLatest
import kotlinx.coroutines.launch

@AndroidEntryPoint
class AgencyRankingsFragment : Fragment() {

    private var _binding: FragmentAgencyRankingsBinding? = null
    private val binding get() = _binding!!
    private val viewModel: AgencyRankingsViewModel by viewModels()

    override fun onCreateView(inflater: LayoutInflater, container: ViewGroup?, savedInstanceState: Bundle?): View {
        _binding = FragmentAgencyRankingsBinding.inflate(inflater, container, false)
        return binding.root
    }

    override fun onViewCreated(view: View, savedInstanceState: Bundle?) {
        super.onViewCreated(view, savedInstanceState)
        binding.btnBack.setOnClickListener { findNavController().popBackStack() }

        binding.tabWeekly.setOnClickListener { viewModel.loadRankings("weekly") }
        binding.tabMonthly.setOnClickListener { viewModel.loadRankings("monthly") }

        viewLifecycleOwner.lifecycleScope.launch {
            viewModel.state.collectLatest { state ->
                binding.progressBar.visibility = if (state.loading) View.VISIBLE else View.GONE
                binding.tabWeekly.alpha = if (state.periodType == "weekly") 1f else 0.5f
                binding.tabMonthly.alpha = if (state.periodType == "monthly") 1f else 0.5f
            }
        }

        viewModel.loadRankings("weekly")
    }

    override fun onDestroyView() { super.onDestroyView(); _binding = null }
}
