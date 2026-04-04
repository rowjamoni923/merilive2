package com.merilive.app.ui.trader

import android.os.Bundle
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import androidx.fragment.app.Fragment
import androidx.fragment.app.viewModels
import androidx.lifecycle.lifecycleScope
import androidx.navigation.fragment.findNavController
import com.merilive.app.databinding.FragmentTraderAgencyTransferBinding
import dagger.hilt.android.AndroidEntryPoint
import kotlinx.coroutines.flow.collectLatest
import kotlinx.coroutines.launch

@AndroidEntryPoint
class TraderAgencyTransferFragment : Fragment() {

    private var _binding: FragmentTraderAgencyTransferBinding? = null
    private val binding get() = _binding!!
    private val viewModel: TraderAgencyTransferViewModel by viewModels()

    override fun onCreateView(inflater: LayoutInflater, container: ViewGroup?, savedInstanceState: Bundle?): View {
        _binding = FragmentTraderAgencyTransferBinding.inflate(inflater, container, false)
        return binding.root
    }

    override fun onViewCreated(view: View, savedInstanceState: Bundle?) {
        super.onViewCreated(view, savedInstanceState)
        binding.btnBack.setOnClickListener { findNavController().popBackStack() }

        binding.btnSearch.setOnClickListener {
            val code = binding.etAgencyCode.text.toString().trim()
            if (code.isNotEmpty()) viewModel.searchAgency(code)
        }

        binding.btnTransfer.setOnClickListener {
            val amount = binding.etAmount.text.toString().toLongOrNull()
            val notes = binding.etNotes.text.toString().takeIf { it.isNotBlank() }
            if (amount != null && amount > 0) viewModel.transfer(amount, notes)
        }

        viewLifecycleOwner.lifecycleScope.launch {
            viewModel.state.collectLatest { state ->
                binding.progressBar.visibility = if (state.loading) View.VISIBLE else View.GONE
                binding.cardAgencyInfo.visibility = if (state.foundAgency != null) View.VISIBLE else View.GONE
                binding.btnTransfer.isEnabled = state.foundAgency != null && !state.loading

                state.foundAgency?.let { agency ->
                    binding.tvAgencyName.text = agency.name
                    binding.tvAgencyCode.text = "Code: ${agency.agency_code}"
                }

                if (state.success) {
                    com.google.android.material.snackbar.Snackbar.make(
                        binding.root, "Transfer successful!", com.google.android.material.snackbar.Snackbar.LENGTH_SHORT
                    ).show()
                    findNavController().popBackStack()
                }

                state.error?.let {
                    com.google.android.material.snackbar.Snackbar.make(binding.root, it, com.google.android.material.snackbar.Snackbar.LENGTH_SHORT).show()
                    viewModel.clearError()
                }
            }
        }
    }

    override fun onDestroyView() { super.onDestroyView(); _binding = null }
}
