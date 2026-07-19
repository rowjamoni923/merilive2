package com.merilive.app.ui.profile

import android.os.Bundle
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import androidx.fragment.app.Fragment
import androidx.fragment.app.viewModels
import androidx.lifecycle.lifecycleScope
import androidx.navigation.fragment.findNavController
import androidx.recyclerview.widget.GridLayoutManager
import coil.load
import coil.transform.CircleCropTransformation
import com.merilive.app.R
import com.merilive.app.databinding.FragmentProfileBinding
import com.merilive.app.ui.profile.adapter.ProfileMenuAdapter
import dagger.hilt.android.AndroidEntryPoint
import kotlinx.coroutines.flow.collectLatest
import kotlinx.coroutines.launch

@AndroidEntryPoint
class ProfileFragment : Fragment() {

    private var _binding: FragmentProfileBinding? = null
    private val binding get() = _binding!!
    private val viewModel: ProfileViewModel by viewModels()

    override fun onCreateView(inflater: LayoutInflater, container: ViewGroup?, savedInstanceState: Bundle?): View {
        _binding = FragmentProfileBinding.inflate(inflater, container, false)
        return binding.root
    }

    override fun onViewCreated(view: View, savedInstanceState: Bundle?) {
        super.onViewCreated(view, savedInstanceState)
        setupUI()
        observeState()
        viewModel.loadProfile()
    }

    private fun setupUI() {
        binding.btnEditProfile.setOnClickListener {
            findNavController().navigate(R.id.action_profile_to_editProfile)
        }
        binding.btnSettings.setOnClickListener {
            findNavController().navigate(R.id.action_profile_to_settings)
        }
        binding.btnWallet.setOnClickListener {
            findNavController().navigate(R.id.action_profile_to_wallet)
        }
        binding.btnLevel.setOnClickListener {
            findNavController().navigate(R.id.action_profile_to_level)
        }
        binding.btnFollowers.setOnClickListener {
            findNavController().navigate(R.id.action_profile_to_followers)
        }
        binding.btnFollowing.setOnClickListener {
            findNavController().navigate(R.id.action_profile_to_following)
        }
        binding.btnHostDashboard.setOnClickListener {
            findNavController().navigate(R.id.action_profile_to_hostDashboard)
        }
        binding.btnVIP.setOnClickListener {
            findNavController().navigate(R.id.action_profile_to_vip)
        }
        binding.btnRecharge.setOnClickListener {
            findNavController().navigate(R.id.action_profile_to_recharge)
        }

        // Menu grid — role-based items added dynamically
        binding.rvProfileMenu.layoutManager = GridLayoutManager(requireContext(), 4)
    }

    private fun observeState() {
        viewLifecycleOwner.lifecycleScope.launch {
            viewModel.profileState.collectLatest { state ->
                when (state) {
                    is ProfileState.Loading -> {
                        binding.shimmerLayout.visibility = View.VISIBLE
                        binding.contentLayout.visibility = View.GONE
                    }
                    is ProfileState.Success -> {
                        binding.shimmerLayout.visibility = View.GONE
                        binding.contentLayout.visibility = View.VISIBLE
                        bindProfile(state.profile)
                        setupMenuForRole(state.profile)
                    }
                    is ProfileState.Error -> {
                        binding.shimmerLayout.visibility = View.GONE
                        binding.contentLayout.visibility = View.VISIBLE
                    }
                }
            }
        }
    }

    private fun bindProfile(profile: UserProfile) {
        binding.apply {
            tvDisplayName.text = profile.displayName ?: "User"
            tvUid.text = "ID: ${profile.app_uid ?: ""}"
            tvBio.text = profile.bio ?: ""
            tvLevel.text = "Lv.${profile.userLevel}"
            tvDiamonds.text = formatCount(profile.diamonds)
            tvBeans.text = formatCount(profile.beans)

            // Avatar with frame
            ivAvatar.load(profile.avatarUrl) {
                crossfade(true)
                placeholder(R.drawable.ic_avatar_placeholder)
                error(R.drawable.ic_avatar_placeholder)
                transformations(CircleCropTransformation())
            }

            // Avatar frame
            if (!profile.frameUrl.isNullOrEmpty()) {
                ivAvatarFrame.visibility = View.VISIBLE
                ivAvatarFrame.load(profile.frameUrl) { crossfade(true) }
            } else {
                ivAvatarFrame.visibility = View.GONE
            }

            // Badges
            ivVipBadge.visibility = if (profile.isVip) View.VISIBLE else View.GONE
            ivVerifiedBadge.visibility = if (profile.isVerified || profile.isFaceVerified) View.VISIBLE else View.GONE

            // Host dashboard button
            btnHostDashboard.visibility = if (profile.isHost) View.VISIBLE else View.GONE

            // Country flag
            if (!profile.countryFlag.isNullOrEmpty()) {
                tvCountryFlag.text = profile.countryFlag
                tvCountryFlag.visibility = View.VISIBLE
            }

            // Gender icon
            ivGender.setImageResource(
                if (profile.gender == "female") R.drawable.ic_female else R.drawable.ic_male
            )
        }
    }

    private fun setupMenuForRole(profile: UserProfile) {
        val items = mutableListOf(
            ProfileMenuItem("wallet", "Wallet", R.drawable.ic_menu_wallet),
            ProfileMenuItem("vip", "VIP", R.drawable.ic_menu_vip),
            ProfileMenuItem("level", "Level", R.drawable.ic_menu_level),
            ProfileMenuItem("shop", "Shop", R.drawable.ic_menu_shop),
            ProfileMenuItem("tasks", "My Tasks", R.drawable.ic_menu_tasks),
            ProfileMenuItem("invitation", "Invitation", R.drawable.ic_menu_invitation),
            ProfileMenuItem("rewards", "Rewards", R.drawable.ic_menu_rewards),
        )

        // Role-based cards
        if (profile.isHost) {
            items.add(ProfileMenuItem("host_center", "Host Center", R.drawable.ic_menu_host))
            items.add(ProfileMenuItem("call_history", "Call History", R.drawable.ic_menu_call_history))
            items.add(ProfileMenuItem("withdrawal", "Withdrawal", R.drawable.ic_menu_withdrawal))
        }

        if (profile.hasAgency) {
            items.add(ProfileMenuItem("agency", "Agency", R.drawable.ic_menu_agency))
        }

        // Always at bottom
        items.add(ProfileMenuItem("settings", "Settings", R.drawable.ic_menu_settings))
        items.add(ProfileMenuItem("help", "Help", R.drawable.ic_menu_help))

        binding.rvProfileMenu.adapter = ProfileMenuAdapter(items) { menuItem ->
            when (menuItem.id) {
                "wallet" -> findNavController().navigate(R.id.action_profile_to_wallet)
                "vip" -> findNavController().navigate(R.id.action_profile_to_vip)
                "level" -> findNavController().navigate(R.id.action_profile_to_level)
                "shop" -> findNavController().navigate(R.id.action_profile_to_shop)
                "tasks" -> findNavController().navigate(R.id.action_profile_to_tasks)
                "invitation" -> findNavController().navigate(R.id.action_profile_to_invitation)
                "rewards" -> findNavController().navigate(R.id.action_profile_to_rewards)
                "agency" -> findNavController().navigate(R.id.action_profile_to_agency)
                "host_center" -> findNavController().navigate(R.id.action_profile_to_hostDashboard)
                "call_history" -> findNavController().navigate(R.id.action_profile_to_callHistory)
                "withdrawal" -> findNavController().navigate(R.id.action_profile_to_withdrawal)
                "helper" -> findNavController().navigate(R.id.action_profile_to_helperDashboard)
                "trader" -> findNavController().navigate(R.id.action_profile_to_traderWallet)
                "host_application" -> findNavController().navigate(R.id.action_profile_to_hostApplication)
                "settings" -> findNavController().navigate(R.id.action_profile_to_settings)
                "help" -> findNavController().navigate(R.id.action_profile_to_help)
            }
        }
    }

    private fun formatCount(count: Int): String {
        return when {
            count >= 1_000_000 -> String.format("%.1fM", count / 1_000_000.0)
            count >= 1_000 -> String.format("%.1fK", count / 1_000.0)
            else -> count.toString()
        }
    }

    override fun onDestroyView() {
        super.onDestroyView()
        _binding = null
    }
}

data class ProfileMenuItem(val id: String, val title: String, val iconRes: Int)

data class UserProfile(
    val id: String,
    val app_uid: String?,
    val displayName: String?,
    val avatarUrl: String?,
    val frameUrl: String?,
    val bio: String?,
    val gender: String?,
    val userLevel: Int = 1,
    val beans: Int = 0,
    val diamonds: Int = 0,
    val isVip: Boolean = false,
    val isVerified: Boolean = false,
    val isFaceVerified: Boolean = false,
    val isHost: Boolean = false,
    val hasAgency: Boolean = false,
    val isAgencyOwner: Boolean = false,
    val countryFlag: String? = null,
    val countryName: String? = null,
)
