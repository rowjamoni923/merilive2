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
import com.merilive.app.R
import com.merilive.app.databinding.FragmentHostApplicationBinding
import dagger.hilt.android.AndroidEntryPoint
import kotlinx.coroutines.flow.collectLatest
import kotlinx.coroutines.launch

@AndroidEntryPoint
class HostApplicationFragment : Fragment() {

    private var _binding: FragmentHostApplicationBinding? = null
    private val binding get() = _binding!!
    private val viewModel: HostApplicationViewModel by viewModels()

    override fun onCreateView(
        inflater: LayoutInflater, container: ViewGroup?, savedInstanceState: Bundle?
    ): View {
        _binding = FragmentHostApplicationBinding.inflate(inflater, container, false)
        return binding.root
    }

    override fun onViewCreated(view: View, savedInstanceState: Bundle?) {
        super.onViewCreated(view, savedInstanceState)

        binding.btnBack.setOnClickListener { findNavController().popBackStack() }

        binding.btnSearchUser.setOnClickListener {
            val uid = binding.etAppUid.text.toString().trim()
            if (uid.isNotEmpty()) {
                viewModel.searchUser(uid)
            }
        }

        binding.btnSendAppCode.setOnClickListener {
            viewModel.sendAppVerification()
        }

        binding.btnVerifyAppCode.setOnClickListener {
            val code = binding.etAppCode.text.toString().trim()
            viewModel.verifyAppCode(code)
        }

        binding.btnSendEmailCode.setOnClickListener {
            val email = binding.etEmail.text.toString().trim()
            viewModel.sendEmailVerification(email)
        }

        binding.btnVerifyEmailCode.setOnClickListener {
            val code = binding.etEmailCode.text.toString().trim()
            viewModel.verifyEmailCode(code)
        }

        binding.btnSubmit.setOnClickListener {
            viewModel.submitApplication()
        }

        viewLifecycleOwner.lifecycleScope.launch {
            viewModel.state.collectLatest { state ->
                binding.progressBar.visibility = if (state.loading) View.VISIBLE else View.GONE

                if (state.foundUser != null) {
                    binding.layoutUserFound.visibility = View.VISIBLE
                    binding.tvFoundUserName.text = state.foundUser.display_name ?: "User"
                    binding.tvFoundUserUid.text = state.foundUser.app_uid ?: ""
                } else {
                    binding.layoutUserFound.visibility = View.GONE
                }

                binding.tvUserNotFound.visibility = if (state.userNotFound) View.VISIBLE else View.GONE

                binding.layoutAppVerification.visibility = if (state.foundUser != null && !state.appVerified) View.VISIBLE else View.GONE
                binding.layoutEmailVerification.visibility = if (state.appVerified && !state.emailVerified) View.VISIBLE else View.GONE
                binding.layoutSubmit.visibility = if (state.appVerified && state.emailVerified) View.VISIBLE else View.GONE

                state.existingApplication?.let { app ->
                    binding.layoutExistingStatus.visibility = View.VISIBLE
                    binding.tvApplicationStatus.text = "Status: ${app.status}"
                    binding.layoutSearchForm.visibility = View.GONE
                } ?: run {
                    binding.layoutExistingStatus.visibility = View.GONE
                    binding.layoutSearchForm.visibility = View.VISIBLE
                }

                if (state.submitted) {
                    Toast.makeText(requireContext(), "Application submitted!", Toast.LENGTH_SHORT).show()
                    findNavController().popBackStack()
                }
            }
        }

        viewModel.checkExistingApplication()
    }

    override fun onDestroyView() {
        super.onDestroyView()
        _binding = null
    }
}
