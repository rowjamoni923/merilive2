package com.merilive.app.ui.profile

import android.os.Bundle
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import androidx.fragment.app.Fragment
import androidx.fragment.app.viewModels
import androidx.lifecycle.ViewModel
import androidx.lifecycle.lifecycleScope
import androidx.lifecycle.viewModelScope
import androidx.navigation.fragment.findNavController
import com.merilive.app.R
import com.merilive.app.databinding.FragmentUserProfileBinding
import com.merilive.app.data.repository.*
import dagger.hilt.android.AndroidEntryPoint
import dagger.hilt.android.lifecycle.HiltViewModel
import io.github.jan.supabase.postgrest.Postgrest
import io.github.jan.supabase.postgrest.query.Columns
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import javax.inject.Inject

@AndroidEntryPoint
class UserProfileFragment : Fragment() {

    private var _binding: FragmentUserProfileBinding? = null
    private val binding get() = _binding!!
    private val viewModel: UserProfileViewModel by viewModels()

    override fun onCreateView(inflater: LayoutInflater, container: ViewGroup?, savedInstanceState: Bundle?): View {
        _binding = FragmentUserProfileBinding.inflate(inflater, container, false)
        return binding.root
    }

    override fun onViewCreated(view: View, savedInstanceState: Bundle?) {
        super.onViewCreated(view, savedInstanceState)
        val userId = arguments?.getString("userId") ?: return

        binding.btnBack.setOnClickListener { findNavController().navigateUp() }
        binding.btnFollow.setOnClickListener { viewModel.toggleFollow(userId) }
        binding.btnChat.setOnClickListener {
            val bundle = Bundle().apply {
                putString("conversationId", "")
                putString("otherUserId", userId)
                putString("otherUserName", binding.tvName.text.toString())
                putString("otherUserAvatar", null)
            }
            findNavController().navigate(R.id.action_userProfile_to_chat, bundle)
        }
        binding.btnCall.setOnClickListener {
            val bundle = Bundle().apply {
                putString("calleeId", userId)
                putString("callType", "video")
            }
            findNavController().navigate(R.id.action_userProfile_to_privateCall, bundle)
        }
        binding.btnGift.setOnClickListener {
            com.merilive.app.ui.live.GiftBottomSheet.newInstance("", userId)
                .show(childFragmentManager, "gifts")
        }

        viewModel.loadUser(userId)
        observeState()
    }

    private fun observeState() {
        viewLifecycleOwner.lifecycleScope.launch {
            viewModel.userState.collect { state ->
                when (state) {
                    is UserProfileState.Loading -> binding.progressBar.visibility = View.VISIBLE
                    is UserProfileState.Success -> {
                        binding.progressBar.visibility = View.GONE
                        val user = state.user
                        binding.tvName.text = user.display_name ?: "User"
                        binding.tvUid.text = "ID: ${user.app_uid ?: ""}"
                        binding.tvLevel.text = "Lv.${user.user_level ?: 1}"
                        binding.tvBio.text = user.bio ?: ""
                        binding.tvCountry.text = user.country_flag ?: ""
                    }
                    is UserProfileState.Error -> binding.progressBar.visibility = View.GONE
                }
            }
        }
    }

    override fun onDestroyView() { super.onDestroyView(); _binding = null }
}

sealed class UserProfileState {
    object Loading : UserProfileState()
    data class Success(val user: ProfileData) : UserProfileState()
    data class Error(val message: String) : UserProfileState()
}

@HiltViewModel
class UserProfileViewModel @Inject constructor(
    private val userRepository: UserRepository,
) : ViewModel() {
    private val _userState = MutableStateFlow<UserProfileState>(UserProfileState.Loading)
    val userState = _userState.asStateFlow()

    fun loadUser(userId: String) {
        viewModelScope.launch {
            try {
                val profile = userRepository.getProfile(userId)
                _userState.value = UserProfileState.Success(profile)
            } catch (e: Exception) {
                _userState.value = UserProfileState.Error(e.message ?: "Failed")
            }
        }
    }

    fun toggleFollow(userId: String) {
        viewModelScope.launch {
            try { userRepository.followUser(userId) } catch (_: Exception) {}
        }
    }
}
