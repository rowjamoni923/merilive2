package com.merilive.app.ui.host

import android.os.Bundle
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import android.widget.Toast
import androidx.fragment.app.Fragment
import androidx.fragment.app.viewModels
import androidx.lifecycle.lifecycleScope
import androidx.navigation.fragment.findNavController
import com.merilive.app.databinding.FragmentHostVerificationBinding
import dagger.hilt.android.AndroidEntryPoint
import kotlinx.coroutines.flow.collectLatest
import kotlinx.coroutines.launch

@AndroidEntryPoint
class HostVerificationFragment : Fragment() {

    private var _binding: FragmentHostVerificationBinding? = null
    private val binding get() = _binding!!
    private val viewModel: HostVerificationViewModel by viewModels()

    override fun onCreateView(
        inflater: LayoutInflater, container: ViewGroup?, savedInstanceState: Bundle?
    ): View {
        _binding = FragmentHostVerificationBinding.inflate(inflater, container, false)
        return binding.root
    }

    override fun onViewCreated(view: View, savedInstanceState: Bundle?) {
        super.onViewCreated(view, savedInstanceState)

        binding.btnBack.setOnClickListener { findNavController().popBackStack() }

        // Step 1: Basic info
        binding.btnNext1.setOnClickListener {
            val name = binding.etFullName.text.toString().trim()
            val age = binding.etAge.text.toString().trim()
            if (name.isEmpty() || age.isEmpty()) {
                Toast.makeText(requireContext(), "Fill all fields", Toast.LENGTH_SHORT).show()
                return@setOnClickListener
            }
            viewModel.setBasicInfo(name, age.toIntOrNull() ?: 18, "en")
            viewModel.nextStep()
        }

        // Step 2: Photo/Video
        binding.btnUploadPhoto.setOnClickListener {
            // Launch camera/gallery picker
            Toast.makeText(requireContext(), "Photo upload coming soon", Toast.LENGTH_SHORT).show()
        }

        binding.btnUploadVideo.setOnClickListener {
            Toast.makeText(requireContext(), "Video upload coming soon", Toast.LENGTH_SHORT).show()
        }

        binding.btnNext2.setOnClickListener {
            viewModel.nextStep()
        }

        // Step 3: Agency code
        binding.btnSearchAgency.setOnClickListener {
            val code = binding.etAgencyCode.text.toString().trim()
            viewModel.searchAgency(code)
        }

        binding.btnSubmitVerification.setOnClickListener {
            viewModel.submitVerification()
        }

        viewLifecycleOwner.lifecycleScope.launch {
            viewModel.state.collectLatest { state ->
                binding.progressBar.visibility = if (state.loading) View.VISIBLE else View.GONE

                binding.layoutStep1.visibility = if (state.currentStep == 1) View.VISIBLE else View.GONE
                binding.layoutStep2.visibility = if (state.currentStep == 2) View.VISIBLE else View.GONE
                binding.layoutStep3.visibility = if (state.currentStep == 3) View.VISIBLE else View.GONE

                // Step indicators
                binding.tvStep1.alpha = if (state.currentStep >= 1) 1f else 0.5f
                binding.tvStep2.alpha = if (state.currentStep >= 2) 1f else 0.5f
                binding.tvStep3.alpha = if (state.currentStep >= 3) 1f else 0.5f

                if (state.agencyVerified) {
                    binding.tvAgencyInfo.text = "✓ Agency verified"
                    binding.tvAgencyInfo.visibility = View.VISIBLE
                }

                if (state.submitted) {
                    Toast.makeText(requireContext(), "Verification submitted!", Toast.LENGTH_SHORT).show()
                    findNavController().popBackStack()
                }
            }
        }
    }

    override fun onDestroyView() {
        super.onDestroyView()
        _binding = null
    }
}
