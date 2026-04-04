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
import com.merilive.app.R
import com.merilive.app.databinding.FragmentAgencyHostManageBinding
import com.merilive.app.ui.agency.adapter.AgencyHostAdapter
import dagger.hilt.android.AndroidEntryPoint
import kotlinx.coroutines.flow.collectLatest
import kotlinx.coroutines.launch

@AndroidEntryPoint
class AgencyHostManageFragment : Fragment() {

    private var _binding: FragmentAgencyHostManageBinding? = null
    private val binding get() = _binding!!
    private val viewModel: AgencyHostManageViewModel by viewModels()
    private lateinit var adapter: AgencyHostAdapter

    override fun onCreateView(inflater: LayoutInflater, container: ViewGroup?, savedInstanceState: Bundle?): View {
        _binding = FragmentAgencyHostManageBinding.inflate(inflater, container, false)
        return binding.root
    }

    override fun onViewCreated(view: View, savedInstanceState: Bundle?) {
        super.onViewCreated(view, savedInstanceState)
        binding.btnBack.setOnClickListener { findNavController().popBackStack() }

        binding.tabActive.setOnClickListener { viewModel.loadHosts("active") }
        binding.tabPending.setOnClickListener { viewModel.loadHosts("pending") }

        adapter = AgencyHostAdapter(
            onApprove = { hostId -> viewModel.approveHost(hostId) },
            onReject = { hostId -> viewModel.rejectHost(hostId) },
            onRemove = { hostId -> viewModel.removeHost(hostId) },
            onProfile = { userId ->
                val bundle = Bundle().apply { putString("userId", userId) }
                findNavController().navigate(R.id.action_hostManage_to_userProfile, bundle)
            }
        )
        binding.recyclerView.layoutManager = LinearLayoutManager(requireContext())
        binding.recyclerView.adapter = adapter

        viewLifecycleOwner.lifecycleScope.launch {
            viewModel.state.collectLatest { state ->
                binding.progressBar.visibility = if (state.loading) View.VISIBLE else View.GONE
                binding.tvEmpty.visibility = if (!state.loading && state.hosts.isEmpty()) View.VISIBLE else View.GONE
                binding.tabActive.alpha = if (state.tab == "active") 1f else 0.5f
                binding.tabPending.alpha = if (state.tab == "pending") 1f else 0.5f
                adapter.submitList(state.hosts)
                adapter.currentTab = state.tab
            }
        }

        viewModel.loadHosts("active")
    }

    override fun onDestroyView() { super.onDestroyView(); _binding = null }
}
