package com.merilive.app.ui.rewards

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
import com.merilive.app.databinding.FragmentRewardsBinding
import dagger.hilt.android.AndroidEntryPoint
import kotlinx.coroutines.flow.collectLatest
import kotlinx.coroutines.launch

@AndroidEntryPoint
class RewardsFragment : Fragment() {

    private var _binding: FragmentRewardsBinding? = null
    private val binding get() = _binding!!
    private val viewModel: RewardsViewModel by viewModels()

    override fun onCreateView(
        inflater: LayoutInflater, container: ViewGroup?, savedInstanceState: Bundle?
    ): View {
        _binding = FragmentRewardsBinding.inflate(inflater, container, false)
        return binding.root
    }

    override fun onViewCreated(view: View, savedInstanceState: Bundle?) {
        super.onViewCreated(view, savedInstanceState)

        binding.btnBack.setOnClickListener { findNavController().popBackStack() }

        // Tab switching
        binding.tabDaily.setOnClickListener { viewModel.switchTab("daily") }
        binding.tabCashback.setOnClickListener { viewModel.switchTab("cashback") }
        binding.tabOffers.setOnClickListener { viewModel.switchTab("offers") }

        // Daily login claim
        binding.btnClaimDaily.setOnClickListener { viewModel.claimDailyLogin() }

        viewLifecycleOwner.lifecycleScope.launch {
            viewModel.state.collectLatest { state ->
                binding.progressBar.visibility = if (state.loading) View.VISIBLE else View.GONE
                binding.contentLayout.visibility = if (state.loading) View.GONE else View.VISIBLE

                // Tab highlighting
                val selectedAlpha = 1f
                val unselectedAlpha = 0.5f
                binding.tabDaily.alpha = if (state.activeTab == "daily") selectedAlpha else unselectedAlpha
                binding.tabCashback.alpha = if (state.activeTab == "cashback") selectedAlpha else unselectedAlpha
                binding.tabOffers.alpha = if (state.activeTab == "offers") selectedAlpha else unselectedAlpha

                // Show/hide sections
                binding.layoutDaily.visibility = if (state.activeTab == "daily") View.VISIBLE else View.GONE
                binding.layoutCashback.visibility = if (state.activeTab == "cashback") View.VISIBLE else View.GONE
                binding.layoutOffers.visibility = if (state.activeTab == "offers") View.VISIBLE else View.GONE

                // Daily login streak
                binding.tvStreak.text = "Day ${state.currentStreak}"
                binding.tvTotalClaims.text = "${state.totalClaims} total"
                binding.btnClaimDaily.isEnabled = !state.alreadyClaimedToday
                binding.btnClaimDaily.text = if (state.alreadyClaimedToday) "✓ Claimed" else "Claim Today"

                // First recharge
                binding.layoutFirstRecharge.visibility = if (!state.hasFirstRecharge) View.VISIBLE else View.GONE
                binding.tvFirstRechargeBonus.text = "${state.firstRechargeMultiplier}x Bonus"
            }
        }

        viewModel.loadRewards()
    }

    override fun onDestroyView() {
        super.onDestroyView()
        _binding = null
    }
}
