package com.merilive.app.ui.helper

import android.os.Bundle
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import androidx.fragment.app.Fragment
import androidx.fragment.app.viewModels
import androidx.lifecycle.lifecycleScope
import androidx.navigation.fragment.findNavController
import com.merilive.app.databinding.FragmentHelperSelfRechargeBinding
import dagger.hilt.android.AndroidEntryPoint
import kotlinx.coroutines.flow.collectLatest
import kotlinx.coroutines.launch

@AndroidEntryPoint
class HelperSelfRechargeFragment : Fragment() {

    private var _binding: FragmentHelperSelfRechargeBinding? = null
    private val binding get() = _binding!!
    private val viewModel: HelperSelfRechargeViewModel by viewModels()

    override fun onCreateView(inflater: LayoutInflater, container: ViewGroup?, savedInstanceState: Bundle?): View {
        _binding = FragmentHelperSelfRechargeBinding.inflate(inflater, container, false)
        return binding.root
    }

    override fun onViewCreated(view: View, savedInstanceState: Bundle?) {
        super.onViewCreated(view, savedInstanceState)
        binding.btnBack.setOnClickListener { findNavController().popBackStack() }

        binding.btnRecharge.setOnClickListener {
            val amount = binding.etAmount.text.toString().toLongOrNull()
            if (amount != null && amount > 0) {
                viewModel.selfRecharge(amount)
            }
        }

        viewLifecycleOwner.lifecycleScope.launch {
            viewModel.state.collectLatest { state ->
                binding.progressBar.visibility = if (state.loading) View.VISIBLE else View.GONE
                binding.tvCurrentBalance.text = String.format("%,d", state.currentBalance)

                if (state.success) {
                    com.google.android.material.snackbar.Snackbar.make(
                        binding.root, "Self recharge successful!", com.google.android.material.snackbar.Snackbar.LENGTH_SHORT
                    ).show()
                    findNavController().popBackStack()
                }

                state.error?.let {
                    com.google.android.material.snackbar.Snackbar.make(binding.root, it, com.google.android.material.snackbar.Snackbar.LENGTH_SHORT).show()
                    viewModel.clearError()
                }
            }
        }

        viewModel.loadBalance()
    }

    override fun onDestroyView() { super.onDestroyView(); _binding = null }
}
