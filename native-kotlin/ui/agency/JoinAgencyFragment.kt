package com.merilive.app.ui.agency

import android.os.Bundle
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import android.widget.Toast
import androidx.fragment.app.Fragment
import androidx.fragment.app.viewModels
import androidx.lifecycle.ViewModel
import androidx.lifecycle.lifecycleScope
import androidx.lifecycle.viewModelScope
import androidx.navigation.fragment.findNavController
import com.merilive.app.R
import com.merilive.app.databinding.FragmentJoinAgencyBinding
import dagger.hilt.android.AndroidEntryPoint
import dagger.hilt.android.lifecycle.HiltViewModel
import io.github.jan.supabase.auth.Auth
import io.github.jan.supabase.postgrest.Postgrest
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import kotlinx.serialization.Serializable
import javax.inject.Inject

@AndroidEntryPoint
class JoinAgencyFragment : Fragment() {

    private var _binding: FragmentJoinAgencyBinding? = null
    private val binding get() = _binding!!
    private val viewModel: JoinAgencyViewModel by viewModels()

    override fun onCreateView(
        inflater: LayoutInflater, container: ViewGroup?, savedInstanceState: Bundle?
    ): View {
        _binding = FragmentJoinAgencyBinding.inflate(inflater, container, false)
        return binding.root
    }

    override fun onViewCreated(view: View, savedInstanceState: Bundle?) {
        super.onViewCreated(view, savedInstanceState)

        binding.btnBack.setOnClickListener { findNavController().navigateUp() }

        binding.btnSearch.setOnClickListener {
            val code = binding.etAgencyCode.text.toString().trim()
            if (code.isEmpty()) {
                binding.etAgencyCode.error = "Enter agency code"
                return@setOnClickListener
            }
            viewModel.searchAgency(code)
        }

        binding.btnJoin.setOnClickListener {
            viewModel.joinAgency()
        }

        viewLifecycleOwner.lifecycleScope.launchWhenStarted {
            viewModel.state.collect { state ->
                when (state) {
                    is JoinAgencyState.Idle -> {
                        binding.agencyCard.visibility = View.GONE
                        binding.btnJoin.visibility = View.GONE
                        binding.progressBar.visibility = View.GONE
                    }
                    is JoinAgencyState.Loading -> {
                        binding.progressBar.visibility = View.VISIBLE
                    }
                    is JoinAgencyState.Found -> {
                        binding.progressBar.visibility = View.GONE
                        binding.agencyCard.visibility = View.VISIBLE
                        binding.btnJoin.visibility = View.VISIBLE
                        binding.tvAgencyName.text = state.agency.name
                        binding.tvAgencyCode.text = "Code: ${state.agency.agency_code}"
                        binding.tvHostCount.text = "${state.agency.total_hosts ?: 0} Hosts"
                    }
                    is JoinAgencyState.Joined -> {
                        Toast.makeText(requireContext(), "Join request sent!", Toast.LENGTH_SHORT).show()
                        findNavController().navigateUp()
                    }
                    is JoinAgencyState.Error -> {
                        binding.progressBar.visibility = View.GONE
                        Toast.makeText(requireContext(), state.message, Toast.LENGTH_LONG).show()
                    }
                }
            }
        }
    }

    override fun onDestroyView() {
        super.onDestroyView()
        _binding = null
    }
}

sealed class JoinAgencyState {
    object Idle : JoinAgencyState()
    object Loading : JoinAgencyState()
    data class Found(val agency: JoinAgencyInfo) : JoinAgencyState()
    data class Joined(val agencyName: String) : JoinAgencyState()
    data class Error(val message: String) : JoinAgencyState()
}

@Serializable
data class JoinAgencyInfo(
    val id: String,
    val name: String,
    val agency_code: String,
    val logo_url: String? = null,
    val total_hosts: Int? = null,
    val level: String? = null,
)

@HiltViewModel
class JoinAgencyViewModel @Inject constructor(
    private val auth: Auth,
    private val postgrest: Postgrest,
) : ViewModel() {

    private val _state = MutableStateFlow<JoinAgencyState>(JoinAgencyState.Idle)
    val state = _state.asStateFlow()

    private var foundAgency: JoinAgencyInfo? = null
    private val currentUserId: String
        get() = auth.currentSessionOrNull()?.user?.id ?: ""

    fun searchAgency(code: String) {
        _state.value = JoinAgencyState.Loading
        viewModelScope.launch {
            try {
                val results = postgrest.from("agencies")
                    .select {
                        filter { eq("agency_code", code) }
                        limit(1)
                    }
                    .decodeList<JoinAgencyInfo>()

                if (results.isNotEmpty()) {
                    foundAgency = results.first()
                    _state.value = JoinAgencyState.Found(results.first())
                } else {
                    _state.value = JoinAgencyState.Error("Agency not found with code: $code")
                }
            } catch (e: Exception) {
                _state.value = JoinAgencyState.Error(e.message ?: "Search failed")
            }
        }
    }

    fun joinAgency() {
        val agency = foundAgency ?: return
        _state.value = JoinAgencyState.Loading
        viewModelScope.launch {
            try {
                postgrest.from("agency_hosts").insert(
                    mapOf(
                        "agency_id" to agency.id,
                        "host_id" to currentUserId,
                        "status" to "pending",
                        "joined_via" to "app_search",
                    )
                )
                _state.value = JoinAgencyState.Joined(agency.name)
            } catch (e: Exception) {
                _state.value = JoinAgencyState.Error(e.message ?: "Failed to join")
            }
        }
    }
}
