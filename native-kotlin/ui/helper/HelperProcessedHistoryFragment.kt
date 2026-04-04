package com.merilive.app.ui.helper

import android.os.Bundle
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import androidx.fragment.app.Fragment
import androidx.fragment.app.viewModels
import androidx.lifecycle.lifecycleScope
import androidx.navigation.fragment.findNavController
import androidx.recyclerview.widget.LinearLayoutManager
import com.merilive.app.databinding.FragmentHelperProcessedHistoryBinding
import com.merilive.app.ui.helper.adapter.ProcessedHistoryAdapter
import dagger.hilt.android.AndroidEntryPoint
import kotlinx.coroutines.flow.collectLatest
import kotlinx.coroutines.launch

@AndroidEntryPoint
class HelperProcessedHistoryFragment : Fragment() {

    private var _binding: FragmentHelperProcessedHistoryBinding? = null
    private val binding get() = _binding!!
    private val viewModel: HelperProcessedHistoryViewModel by viewModels()
    private lateinit var adapter: ProcessedHistoryAdapter

    override fun onCreateView(inflater: LayoutInflater, container: ViewGroup?, savedInstanceState: Bundle?): View {
        _binding = FragmentHelperProcessedHistoryBinding.inflate(inflater, container, false)
        return binding.root
    }

    override fun onViewCreated(view: View, savedInstanceState: Bundle?) {
        super.onViewCreated(view, savedInstanceState)
        binding.btnBack.setOnClickListener { findNavController().popBackStack() }

        adapter = ProcessedHistoryAdapter()
        binding.recyclerView.layoutManager = LinearLayoutManager(requireContext())
        binding.recyclerView.adapter = adapter

        viewLifecycleOwner.lifecycleScope.launch {
            viewModel.state.collectLatest { state ->
                binding.progressBar.visibility = if (state.loading) View.VISIBLE else View.GONE
                binding.tvEmpty.visibility = if (!state.loading && state.items.isEmpty()) View.VISIBLE else View.GONE
                adapter.submitList(state.items)
            }
        }

        viewModel.loadHistory()
    }

    override fun onDestroyView() { super.onDestroyView(); _binding = null }
}
