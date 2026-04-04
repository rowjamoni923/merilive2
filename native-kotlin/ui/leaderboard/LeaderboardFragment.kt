package com.merilive.app.ui.leaderboard

import android.os.Bundle
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import androidx.fragment.app.Fragment
import androidx.fragment.app.viewModels
import androidx.lifecycle.lifecycleScope
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import androidx.navigation.fragment.findNavController
import androidx.recyclerview.widget.LinearLayoutManager
import com.merilive.app.databinding.FragmentLeaderboardBinding
import dagger.hilt.android.AndroidEntryPoint
import dagger.hilt.android.lifecycle.HiltViewModel
import io.github.jan.supabase.postgrest.Postgrest
import io.github.jan.supabase.postgrest.query.Order
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import kotlinx.serialization.Serializable
import javax.inject.Inject

@AndroidEntryPoint
class LeaderboardFragment : Fragment() {

    private var _binding: FragmentLeaderboardBinding? = null
    private val binding get() = _binding!!
    private val viewModel: LeaderboardViewModel by viewModels()

    override fun onCreateView(
        inflater: LayoutInflater, container: ViewGroup?, savedInstanceState: Bundle?
    ): View {
        _binding = FragmentLeaderboardBinding.inflate(inflater, container, false)
        return binding.root
    }

    override fun onViewCreated(view: View, savedInstanceState: Bundle?) {
        super.onViewCreated(view, savedInstanceState)

        binding.btnBack.setOnClickListener { findNavController().navigateUp() }
        binding.rvLeaderboard.layoutManager = LinearLayoutManager(requireContext())

        // Tabs: Daily, Weekly, Monthly
        val tabs = listOf("Daily", "Weekly", "Monthly")
        binding.tabLayout.removeAllTabs()
        tabs.forEach { binding.tabLayout.addTab(binding.tabLayout.newTab().setText(it)) }

        binding.tabLayout.addOnTabSelectedListener(object : com.google.android.material.tabs.TabLayout.OnTabSelectedListener {
            override fun onTabSelected(tab: com.google.android.material.tabs.TabLayout.Tab?) {
                val period = when (tab?.position) {
                    0 -> "daily"
                    1 -> "weekly"
                    2 -> "monthly"
                    else -> "daily"
                }
                viewModel.loadLeaderboard(period)
            }
            override fun onTabUnselected(tab: com.google.android.material.tabs.TabLayout.Tab?) {}
            override fun onTabReselected(tab: com.google.android.material.tabs.TabLayout.Tab?) {}
        })

        // Type chips: Gifters, Receivers
        binding.chipGifters.setOnClickListener { viewModel.loadLeaderboard(viewModel.currentPeriod, "gifters") }
        binding.chipReceivers.setOnClickListener { viewModel.loadLeaderboard(viewModel.currentPeriod, "receivers") }

        viewModel.loadLeaderboard("daily")
        observeState()
    }

    private fun observeState() {
        viewLifecycleOwner.lifecycleScope.launchWhenStarted {
            viewModel.entries.collect { entries ->
                binding.rvLeaderboard.adapter = LeaderboardAdapter(entries) { entry ->
                    // Navigate to user profile
                    val bundle = Bundle().apply { putString("userId", entry.userId) }
                    findNavController().navigate(com.merilive.app.R.id.action_leaderboard_to_profile, bundle)
                }

                // Top 3 podium
                if (entries.size >= 3) {
                    bindPodium(entries[0], entries[1], entries[2])
                }
            }
        }
    }

    private fun bindPodium(first: LeaderboardEntry, second: LeaderboardEntry, third: LeaderboardEntry) {
        binding.tvFirst.text = first.displayName
        binding.tvFirstScore.text = formatScore(first.score)
        binding.tvSecond.text = second.displayName
        binding.tvSecondScore.text = formatScore(second.score)
        binding.tvThird.text = third.displayName
        binding.tvThirdScore.text = formatScore(third.score)
    }

    private fun formatScore(score: Long): String = when {
        score >= 1_000_000 -> String.format("%.1fM", score / 1_000_000.0)
        score >= 1_000 -> String.format("%.1fK", score / 1_000.0)
        else -> score.toString()
    }

    override fun onDestroyView() {
        super.onDestroyView()
        _binding = null
    }
}

data class LeaderboardEntry(
    val rank: Int, val userId: String, val displayName: String,
    val avatarUrl: String?, val score: Long, val level: Int,
    val countryFlag: String?,
)

@HiltViewModel
class LeaderboardViewModel @Inject constructor(
    private val postgrest: Postgrest,
) : ViewModel() {

    private val _entries = MutableStateFlow<List<LeaderboardEntry>>(emptyList())
    val entries = _entries.asStateFlow()
    var currentPeriod = "daily"
    var currentType = "gifters"

    fun loadLeaderboard(period: String, type: String = currentType) {
        currentPeriod = period
        currentType = type
        viewModelScope.launch {
            try {
                val tableName = if (type == "gifters") "leaderboard_gifters" else "leaderboard_receivers"
                val result = postgrest.from(tableName)
                    .select {
                        filter { eq("period_type", period) }
                        order("score", Order.DESCENDING)
                        limit(100)
                    }
                    .decodeList<LeaderboardResponse>()

                _entries.value = result.mapIndexed { index, it ->
                    LeaderboardEntry(
                        rank = index + 1,
                        userId = it.user_id,
                        displayName = it.display_name ?: "User",
                        avatarUrl = it.avatar_url,
                        score = it.score ?: 0,
                        level = it.level ?: 1,
                        countryFlag = it.country_flag,
                    )
                }
            } catch (_: Exception) {
                _entries.value = emptyList()
            }
        }
    }
}

@Serializable
data class LeaderboardResponse(
    val user_id: String, val display_name: String? = null,
    val avatar_url: String? = null, val score: Long? = null,
    val level: Int? = null, val country_flag: String? = null,
)
