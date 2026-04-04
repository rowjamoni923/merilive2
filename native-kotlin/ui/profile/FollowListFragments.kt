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
import androidx.recyclerview.widget.LinearLayoutManager
import com.merilive.app.databinding.FragmentFollowListBinding
import com.merilive.app.data.repository.*
import dagger.hilt.android.AndroidEntryPoint
import dagger.hilt.android.lifecycle.HiltViewModel
import io.github.jan.supabase.auth.Auth
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import javax.inject.Inject

@AndroidEntryPoint
class FollowersFragment : Fragment() {
    private var _binding: FragmentFollowListBinding? = null
    private val binding get() = _binding!!
    private val viewModel: FollowListViewModel by viewModels()

    override fun onCreateView(inflater: LayoutInflater, container: ViewGroup?, savedInstanceState: Bundle?): View {
        _binding = FragmentFollowListBinding.inflate(inflater, container, false)
        return binding.root
    }

    override fun onViewCreated(view: View, savedInstanceState: Bundle?) {
        super.onViewCreated(view, savedInstanceState)
        binding.tvTitle.text = "Followers"
        binding.btnBack.setOnClickListener { findNavController().navigateUp() }
        binding.rvUsers.layoutManager = LinearLayoutManager(requireContext())
        viewModel.loadFollowers()
        observeState()
    }

    private fun observeState() {
        viewLifecycleOwner.lifecycleScope.launch {
            viewModel.users.collect { users ->
                binding.rvUsers.adapter = com.merilive.app.ui.search.UserSearchAdapter(users) { user ->
                    val bundle = Bundle().apply { putString("userId", user.id) }
                    findNavController().navigate(com.merilive.app.R.id.userProfileFragment, bundle)
                }
            }
        }
    }

    override fun onDestroyView() { super.onDestroyView(); _binding = null }
}

@AndroidEntryPoint
class FollowingFragment : Fragment() {
    private var _binding: FragmentFollowListBinding? = null
    private val binding get() = _binding!!
    private val viewModel: FollowListViewModel by viewModels()

    override fun onCreateView(inflater: LayoutInflater, container: ViewGroup?, savedInstanceState: Bundle?): View {
        _binding = FragmentFollowListBinding.inflate(inflater, container, false)
        return binding.root
    }

    override fun onViewCreated(view: View, savedInstanceState: Bundle?) {
        super.onViewCreated(view, savedInstanceState)
        binding.tvTitle.text = "Following"
        binding.btnBack.setOnClickListener { findNavController().navigateUp() }
        binding.rvUsers.layoutManager = LinearLayoutManager(requireContext())
        viewModel.loadFollowing()
        observeState()
    }

    private fun observeState() {
        viewLifecycleOwner.lifecycleScope.launch {
            viewModel.users.collect { users ->
                binding.rvUsers.adapter = com.merilive.app.ui.search.UserSearchAdapter(users) { user ->
                    val bundle = Bundle().apply { putString("userId", user.id) }
                    findNavController().navigate(com.merilive.app.R.id.userProfileFragment, bundle)
                }
            }
        }
    }

    override fun onDestroyView() { super.onDestroyView(); _binding = null }
}

@HiltViewModel
class FollowListViewModel @Inject constructor(
    private val auth: Auth,
    private val userRepository: UserRepository,
) : ViewModel() {
    private val _users = MutableStateFlow<List<FollowUser>>(emptyList())
    val users = _users.asStateFlow()

    fun loadFollowers() {
        viewModelScope.launch {
            try {
                val userId = auth.currentSessionOrNull()?.user?.id ?: return@launch
                _users.value = userRepository.getFollowers(userId)
            } catch (_: Exception) {}
        }
    }

    fun loadFollowing() {
        viewModelScope.launch {
            try {
                val userId = auth.currentSessionOrNull()?.user?.id ?: return@launch
                _users.value = userRepository.getFollowing(userId)
            } catch (_: Exception) {}
        }
    }
}
