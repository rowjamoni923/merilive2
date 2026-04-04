package com.merilive.app.ui.level

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
import com.merilive.app.databinding.FragmentLevelBinding
import dagger.hilt.android.AndroidEntryPoint
import dagger.hilt.android.lifecycle.HiltViewModel
import io.github.jan.supabase.auth.Auth
import io.github.jan.supabase.postgrest.Postgrest
import io.github.jan.supabase.postgrest.query.Order
import kotlinx.coroutines.async
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import kotlinx.serialization.Serializable
import javax.inject.Inject

@AndroidEntryPoint
class LevelFragment : Fragment() {

    private var _binding: FragmentLevelBinding? = null
    private val binding get() = _binding!!
    private val viewModel: LevelViewModel by viewModels()

    override fun onCreateView(
        inflater: LayoutInflater, container: ViewGroup?, savedInstanceState: Bundle?
    ): View {
        _binding = FragmentLevelBinding.inflate(inflater, container, false)
        return binding.root
    }

    override fun onViewCreated(view: View, savedInstanceState: Bundle?) {
        super.onViewCreated(view, savedInstanceState)
        binding.btnBack.setOnClickListener { findNavController().navigateUp() }
        binding.rvPrivileges.layoutManager = LinearLayoutManager(requireContext())
        viewModel.loadLevelData()

        viewLifecycleOwner.lifecycleScope.launchWhenStarted {
            viewModel.state.collect { state ->
                when (state) {
                    is LevelState.Success -> {
                        binding.tvCurrentLevel.text = "Level ${state.currentLevel}"
                        binding.tvExp.text = "${state.currentExp} / ${state.nextLevelExp} XP"
                        binding.progressBar.max = state.nextLevelExp
                        binding.progressBar.progress = state.currentExp
                        binding.rvPrivileges.adapter = LevelPrivilegeAdapter(state.privileges)
                    }
                    else -> {}
                }
            }
        }
    }

    override fun onDestroyView() {
        super.onDestroyView()
        _binding = null
    }
}

sealed class LevelState {
    object Loading : LevelState()
    data class Success(
        val currentLevel: Int, val currentExp: Int, val nextLevelExp: Int,
        val privileges: List<LevelPrivilege>,
    ) : LevelState()
}

data class LevelPrivilege(val level: Int, val name: String, val description: String, val iconUrl: String?)

@HiltViewModel
class LevelViewModel @Inject constructor(
    private val auth: Auth,
    private val postgrest: Postgrest,
) : ViewModel() {

    private val _state = MutableStateFlow<LevelState>(LevelState.Loading)
    val state = _state.asStateFlow()

    fun loadLevelData() {
        viewModelScope.launch {
            try {
                val userId = auth.currentSessionOrNull()?.user?.id ?: return@launch
                val profileDeferred = async {
                    postgrest.from("profiles")
                        .select(io.github.jan.supabase.postgrest.query.Columns.raw("user_level, total_consumption")) {
                            filter { eq("id", userId) }
                        }
                        .decodeSingle<LevelProfileResponse>()
                }
                val privilegesDeferred = async {
                    postgrest.from("level_privileges")
                        .select {
                            filter { eq("is_active", true) }
                            order("required_level", Order.ASCENDING)
                        }
                        .decodeList<LevelPrivilegeResponse>()
                }

                val profile = profileDeferred.await()
                val privileges = privilegesDeferred.await()

                _state.value = LevelState.Success(
                    currentLevel = profile.user_level ?: 1,
                    currentExp = profile.total_consumption ?: 0,
                    nextLevelExp = (profile.user_level ?: 1) * 1000, // Simplified
                    privileges = privileges.map {
                        LevelPrivilege(it.required_level, it.name, it.description ?: "", it.icon_url)
                    }
                )
            } catch (_: Exception) {}
        }
    }
}

@Serializable data class LevelProfileResponse(val user_level: Int? = null, val total_consumption: Int? = null)
@Serializable
data class LevelPrivilegeResponse(
    val required_level: Int, val name: String,
    val description: String? = null, val icon_url: String? = null,
)
