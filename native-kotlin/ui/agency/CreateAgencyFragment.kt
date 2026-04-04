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
import com.merilive.app.databinding.FragmentCreateAgencyBinding
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
class CreateAgencyFragment : Fragment() {

    private var _binding: FragmentCreateAgencyBinding? = null
    private val binding get() = _binding!!
    private val viewModel: CreateAgencyViewModel by viewModels()

    override fun onCreateView(
        inflater: LayoutInflater, container: ViewGroup?, savedInstanceState: Bundle?
    ): View {
        _binding = FragmentCreateAgencyBinding.inflate(inflater, container, false)
        return binding.root
    }

    override fun onViewCreated(view: View, savedInstanceState: Bundle?) {
        super.onViewCreated(view, savedInstanceState)

        binding.btnBack.setOnClickListener { findNavController().navigateUp() }

        binding.btnCreate.setOnClickListener {
            val name = binding.etAgencyName.text.toString().trim()
            val whatsapp = binding.etWhatsapp.text.toString().trim()
            val email = binding.etEmail.text.toString().trim()

            if (name.isEmpty()) {
                binding.etAgencyName.error = "Agency name required"
                return@setOnClickListener
            }
            if (whatsapp.isEmpty()) {
                binding.etWhatsapp.error = "WhatsApp number required"
                return@setOnClickListener
            }

            viewModel.createAgency(name, whatsapp, email)
        }

        viewLifecycleOwner.lifecycleScope.launchWhenStarted {
            viewModel.state.collect { state ->
                when (state) {
                    is CreateAgencyState.Idle -> {
                        binding.btnCreate.isEnabled = true
                        binding.progressBar.visibility = View.GONE
                    }
                    is CreateAgencyState.Loading -> {
                        binding.btnCreate.isEnabled = false
                        binding.progressBar.visibility = View.VISIBLE
                    }
                    is CreateAgencyState.Success -> {
                        Toast.makeText(requireContext(), "Agency created successfully!", Toast.LENGTH_SHORT).show()
                        findNavController().navigateUp()
                    }
                    is CreateAgencyState.Error -> {
                        binding.btnCreate.isEnabled = true
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

sealed class CreateAgencyState {
    object Idle : CreateAgencyState()
    object Loading : CreateAgencyState()
    data class Success(val agencyId: String) : CreateAgencyState()
    data class Error(val message: String) : CreateAgencyState()
}

@HiltViewModel
class CreateAgencyViewModel @Inject constructor(
    private val auth: Auth,
    private val postgrest: Postgrest,
) : ViewModel() {

    private val _state = MutableStateFlow<CreateAgencyState>(CreateAgencyState.Idle)
    val state = _state.asStateFlow()

    private val currentUserId: String
        get() = auth.currentSessionOrNull()?.user?.id ?: ""

    fun createAgency(name: String, whatsapp: String, email: String) {
        _state.value = CreateAgencyState.Loading
        viewModelScope.launch {
            try {
                val code = "AG${System.currentTimeMillis().toString().takeLast(8)}"
                val result = postgrest.from("agencies").insert(
                    mapOf(
                        "name" to name,
                        "agency_code" to code,
                        "owner_id" to currentUserId,
                        "whatsapp_number" to whatsapp,
                        "email" to email,
                        "is_active" to true,
                    )
                ) { select() }.decodeSingle<AgencyIdResponse>()

                _state.value = CreateAgencyState.Success(result.id)
            } catch (e: Exception) {
                _state.value = CreateAgencyState.Error(e.message ?: "Failed to create agency")
            }
        }
    }
}

@Serializable
data class AgencyIdResponse(val id: String)
