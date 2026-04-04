package com.merilive.app.ui.party

import android.os.Bundle
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import android.widget.Toast
import androidx.fragment.app.Fragment
import androidx.lifecycle.lifecycleScope
import androidx.navigation.fragment.findNavController
import com.merilive.app.databinding.FragmentCreatePartyBinding
import dagger.hilt.android.AndroidEntryPoint
import io.github.jan.supabase.functions.Functions
import kotlinx.coroutines.launch
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json
import javax.inject.Inject

@AndroidEntryPoint
class CreatePartyFragment : Fragment() {

    private var _binding: FragmentCreatePartyBinding? = null
    private val binding get() = _binding!!

    @Inject lateinit var functions: Functions

    override fun onCreateView(inflater: LayoutInflater, container: ViewGroup?, savedInstanceState: Bundle?): View {
        _binding = FragmentCreatePartyBinding.inflate(inflater, container, false)
        return binding.root
    }

    override fun onViewCreated(view: View, savedInstanceState: Bundle?) {
        super.onViewCreated(view, savedInstanceState)

        binding.btnBack.setOnClickListener { findNavController().navigateUp() }
        binding.btnCreate.setOnClickListener { createParty() }
    }

    private fun createParty() {
        val name = binding.etRoomName.text.toString().trim()
        if (name.isEmpty()) {
            binding.etRoomName.error = "Enter room name"
            return
        }

        binding.progressBar.visibility = View.VISIBLE
        binding.btnCreate.isEnabled = false

        viewLifecycleOwner.lifecycleScope.launch {
            try {
                @Serializable
                data class CreatePartyBody(val name: String, val type: String, val max_seats: Int)

                val response = functions.invoke("party-room/create", body = CreatePartyBody(name, "party", 9))
                val result: PartyJoinResponse = Json { ignoreUnknownKeys = true }.decodeFromString(response.decodeAs())
                // Navigate to the created room
                val bundle = Bundle().apply { putString("roomId", result.token) }
                findNavController().navigate(com.merilive.app.R.id.partyRoomFragment, bundle)
            } catch (e: Exception) {
                binding.progressBar.visibility = View.GONE
                binding.btnCreate.isEnabled = true
                Toast.makeText(requireContext(), "Failed: ${e.message}", Toast.LENGTH_SHORT).show()
            }
        }
    }

    override fun onDestroyView() { super.onDestroyView(); _binding = null }
}
