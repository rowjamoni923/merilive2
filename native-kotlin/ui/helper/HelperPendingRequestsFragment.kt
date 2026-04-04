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
import com.merilive.app.databinding.FragmentHelperPendingRequestsBinding
import com.merilive.app.ui.helper.adapter.PendingRequestAdapter
import dagger.hilt.android.AndroidEntryPoint
import kotlinx.coroutines.flow.collectLatest
import kotlinx.coroutines.launch

@AndroidEntryPoint
class HelperPendingRequestsFragment : Fragment() {

    private var _binding: FragmentHelperPendingRequestsBinding? = null
    private val binding get() = _binding!!
    private val viewModel: HelperPendingRequestsViewModel by viewModels()
    private lateinit var adapter: PendingRequestAdapter

    override fun onCreateView(inflater: LayoutInflater, container: ViewGroup?, savedInstanceState: Bundle?): View {
        _binding = FragmentHelperPendingRequestsBinding.inflate(inflater, container, false)
        return binding.root
    }

    override fun onViewCreated(view: View, savedInstanceState: Bundle?) {
        super.onViewCreated(view, savedInstanceState)
        binding.btnBack.setOnClickListener { findNavController().popBackStack() }

        adapter = PendingRequestAdapter(
            onProcess = { request -> viewModel.showProcessDialog(request) },
            onReject = { request -> viewModel.rejectRequest(request.id, "Rejected by helper") }
        )
        binding.recyclerView.layoutManager = LinearLayoutManager(requireContext())
        binding.recyclerView.adapter = adapter

        viewLifecycleOwner.lifecycleScope.launch {
            viewModel.state.collectLatest { state ->
                binding.progressBar.visibility = if (state.loading) View.VISIBLE else View.GONE
                binding.tvEmpty.visibility = if (!state.loading && state.requests.isEmpty()) View.VISIBLE else View.GONE
                adapter.submitList(state.requests)
            }
        }

        viewModel.loadPendingRequests()
    }

    override fun onDestroyView() { super.onDestroyView(); _binding = null }
}
