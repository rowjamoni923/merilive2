package com.merilive.app.ui.invitation

import android.content.ClipData
import android.content.ClipboardManager
import android.content.Context
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
import com.merilive.app.databinding.FragmentInvitationBinding
import com.merilive.app.ui.invitation.adapter.InvitationLeaderboardAdapter
import com.merilive.app.ui.invitation.adapter.InvitationTierAdapter
import dagger.hilt.android.AndroidEntryPoint
import kotlinx.coroutines.flow.collectLatest
import kotlinx.coroutines.launch

@AndroidEntryPoint
class InvitationFragment : Fragment() {

    private var _binding: FragmentInvitationBinding? = null
    private val binding get() = _binding!!
    private val viewModel: InvitationViewModel by viewModels()
    private lateinit var leaderboardAdapter: InvitationLeaderboardAdapter
    private lateinit var tierAdapter: InvitationTierAdapter

    override fun onCreateView(
        inflater: LayoutInflater, container: ViewGroup?, savedInstanceState: Bundle?
    ): View {
        _binding = FragmentInvitationBinding.inflate(inflater, container, false)
        return binding.root
    }

    override fun onViewCreated(view: View, savedInstanceState: Bundle?) {
        super.onViewCreated(view, savedInstanceState)

        binding.btnBack.setOnClickListener { findNavController().popBackStack() }

        leaderboardAdapter = InvitationLeaderboardAdapter()
        binding.rvLeaderboard.layoutManager = LinearLayoutManager(requireContext())
        binding.rvLeaderboard.adapter = leaderboardAdapter

        tierAdapter = InvitationTierAdapter { tierId ->
            viewModel.claimTierReward(tierId)
        }
        binding.rvTiers.layoutManager = LinearLayoutManager(requireContext())
        binding.rvTiers.adapter = tierAdapter

        binding.btnCopyLink.setOnClickListener {
            val clipboard = requireContext().getSystemService(Context.CLIPBOARD_SERVICE) as ClipboardManager
            clipboard.setPrimaryClip(ClipData.newPlainText("invite", viewModel.state.value.shareLink))
            Toast.makeText(requireContext(), "Link copied!", Toast.LENGTH_SHORT).show()
        }

        binding.btnShare.setOnClickListener {
            val intent = android.content.Intent(android.content.Intent.ACTION_SEND).apply {
                type = "text/plain"
                putExtra(android.content.Intent.EXTRA_TEXT, viewModel.state.value.shareLink)
            }
            startActivity(android.content.Intent.createChooser(intent, "Share Invitation"))
        }

        viewLifecycleOwner.lifecycleScope.launch {
            viewModel.state.collectLatest { state ->
                binding.progressBar.visibility = if (state.loading) View.VISIBLE else View.GONE
                binding.contentLayout.visibility = if (state.loading) View.GONE else View.VISIBLE

                binding.tvMyInvites.text = state.myInviteCount.toString()
                binding.tvShareLink.text = state.shareLink

                leaderboardAdapter.submitList(state.leaderboard)
                tierAdapter.submitList(state.tiers, state.claimedTierIds, state.myInviteCount, state.claimingTierId)
            }
        }

        viewModel.loadData()
    }

    override fun onDestroyView() {
        super.onDestroyView()
        _binding = null
    }
}
