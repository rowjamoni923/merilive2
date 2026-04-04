package com.merilive.app.ui.agency

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
import com.merilive.app.databinding.FragmentAgencyDashboardBinding
import com.merilive.app.ui.agency.adapter.AgencyHostAdapter
import com.merilive.app.ui.agency.adapter.PendingRequestAdapter
import com.merilive.app.ui.agency.adapter.CommissionHistoryAdapter
import dagger.hilt.android.AndroidEntryPoint
import kotlinx.coroutines.flow.collectLatest
import kotlinx.coroutines.launch

@AndroidEntryPoint
class AgencyDashboardFragment : Fragment() {

    private var _binding: FragmentAgencyDashboardBinding? = null
    private val binding get() = _binding!!
    private val viewModel: AgencyDashboardViewModel by viewModels()
    private lateinit var hostAdapter: AgencyHostAdapter
    private lateinit var requestAdapter: PendingRequestAdapter

    override fun onCreateView(
        inflater: LayoutInflater, container: ViewGroup?, savedInstanceState: Bundle?
    ): View {
        _binding = FragmentAgencyDashboardBinding.inflate(inflater, container, false)
        return binding.root
    }

    override fun onViewCreated(view: View, savedInstanceState: Bundle?) {
        super.onViewCreated(view, savedInstanceState)

        binding.btnBack.setOnClickListener { findNavController().popBackStack() }

        // Tabs
        binding.tabOverview.setOnClickListener { viewModel.switchTab("overview") }
        binding.tabHosts.setOnClickListener { viewModel.switchTab("hosts") }
        binding.tabRequests.setOnClickListener { viewModel.switchTab("requests") }
        binding.tabFinance.setOnClickListener { viewModel.switchTab("finance") }

        // Actions
        binding.btnWithdrawal.setOnClickListener {
            findNavController().navigate(R.id.action_agencyDashboard_to_agencyWithdrawal)
        }
        binding.btnExchange.setOnClickListener {
            findNavController().navigate(R.id.action_agencyDashboard_to_diamondExchange)
        }
        binding.btnRankings.setOnClickListener {
            findNavController().navigate(R.id.action_agencyDashboard_to_agencyRankings)
        }
        binding.btnSubAgents.setOnClickListener {
            findNavController().navigate(R.id.action_agencyDashboard_to_subAgents)
        }

        // Host list adapter
        hostAdapter = AgencyHostAdapter(
            onRemove = { hostId -> viewModel.removeHost(hostId) }
        )
        binding.rvHosts.layoutManager = LinearLayoutManager(requireContext())
        binding.rvHosts.adapter = hostAdapter

        // Pending request adapter
        requestAdapter = PendingRequestAdapter(
            onApprove = { requestId -> viewModel.approveRequest(requestId) },
            onReject = { requestId -> viewModel.rejectRequest(requestId) },
        )
        binding.rvRequests?.layoutManager = LinearLayoutManager(requireContext())
        binding.rvRequests?.adapter = requestAdapter

        // Finance tab
        binding.rvCommissionHistory?.layoutManager = LinearLayoutManager(requireContext())

        viewLifecycleOwner.lifecycleScope.launch {
            viewModel.state.collectLatest { state ->
                binding.progressBar.visibility = if (state.loading) View.VISIBLE else View.GONE
                binding.contentLayout.visibility = if (state.loading) View.GONE else View.VISIBLE

                state.agency?.let { agency ->
                    binding.tvAgencyName.text = agency.name ?: "Agency"
                    binding.tvAgencyCode.text = "Code: ${agency.agency_code}"
                    binding.tvTotalBeans.text = "${agency.wallet_balance ?: 0}"
                    binding.tvDiamonds.text = "${agency.diamond_balance ?: 0}"
                    binding.tvHostCount.text = "${agency.total_hosts ?: 0}"
                    binding.tvLevel.text = agency.level ?: "Starter"
                    binding.tvCommission.text = "${((agency.commission_rate ?: 0.0) * 100).toInt()}%"
                }

                // Tab highlighting
                val tabs = listOf(binding.tabOverview, binding.tabHosts, binding.tabRequests, binding.tabFinance)
                val tabNames = listOf("overview", "hosts", "requests", "finance")
                tabs.forEachIndexed { i, tab ->
                    tab.alpha = if (state.activeTab == tabNames[i]) 1f else 0.5f
                }

                binding.layoutOverview.visibility = if (state.activeTab == "overview") View.VISIBLE else View.GONE
                binding.layoutHosts.visibility = if (state.activeTab == "hosts") View.VISIBLE else View.GONE
                binding.layoutRequests.visibility = if (state.activeTab == "requests") View.VISIBLE else View.GONE
                binding.layoutFinance.visibility = if (state.activeTab == "finance") View.VISIBLE else View.GONE

                // Performance overview
                state.performance?.let { perf ->
                    binding.tvWeeklyIncome.text = "${perf.total_income ?: 0} Beans"
                    binding.tvHostHours.text = "${perf.total_host_hours ?: 0}h"
                    binding.tvNewHosts.text = "${perf.new_hosts_count ?: 0}"
                }

                // Hosts list
                hostAdapter.submitList(state.hosts)

                // Pending requests
                requestAdapter.submitList(state.pendingRequests)
                binding.tvPendingBadge.text = "${state.pendingRequests.size}"
                binding.tvPendingBadge.visibility = if (state.pendingRequests.isNotEmpty()) View.VISIBLE else View.GONE

                // Finance: commission history
                if (state.activeTab == "finance") {
                    binding.rvCommissionHistory?.adapter = CommissionHistoryAdapter(state.commissionHistory)
                }

                // Level tiers info
                state.levelTiers.firstOrNull { it.level_code == state.agency?.level }?.let { currentTier ->
                    binding.tvLevel.text = "${currentTier.level_name} (${((currentTier.commission_rate) * 100).toInt()}%)"
                }
            }
        }

        viewModel.loadDashboard()
    }

    override fun onDestroyView() {
        super.onDestroyView()
        _binding = null
    }
}
