package com.merilive.app.ui.withdrawal

import android.os.Bundle
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import android.widget.Toast
import androidx.fragment.app.Fragment
import androidx.fragment.app.viewModels
import androidx.lifecycle.lifecycleScope
import androidx.navigation.fragment.findNavController
import androidx.recyclerview.widget.LinearLayoutManager
import com.merilive.app.databinding.FragmentWithdrawalBinding
import dagger.hilt.android.AndroidEntryPoint
import kotlinx.coroutines.flow.collectLatest
import kotlinx.coroutines.launch

@AndroidEntryPoint
class WithdrawalFragment : Fragment() {

    private var _binding: FragmentWithdrawalBinding? = null
    private val binding get() = _binding!!
    private val viewModel: WithdrawalViewModel by viewModels()

    override fun onCreateView(
        inflater: LayoutInflater, container: ViewGroup?, savedInstanceState: Bundle?
    ): View {
        _binding = FragmentWithdrawalBinding.inflate(inflater, container, false)
        return binding.root
    }

    override fun onViewCreated(view: View, savedInstanceState: Bundle?) {
        super.onViewCreated(view, savedInstanceState)

        binding.btnBack.setOnClickListener { findNavController().popBackStack() }

        binding.btnWithdraw.setOnClickListener {
            val amount = binding.etAmount.text.toString().toIntOrNull() ?: 0
            val accountNum = binding.etAccountNumber.text.toString().trim()
            val accountName = binding.etAccountName.text.toString().trim()

            if (amount < 1000) {
                Toast.makeText(requireContext(), "Minimum 1000 beans", Toast.LENGTH_SHORT).show()
                return@setOnClickListener
            }
            if (accountNum.isEmpty() || accountName.isEmpty()) {
                Toast.makeText(requireContext(), "Fill all fields", Toast.LENGTH_SHORT).show()
                return@setOnClickListener
            }
            viewModel.submitWithdrawal(amount, "local_payment", accountNum, accountName)
        }

        viewLifecycleOwner.lifecycleScope.launch {
            viewModel.state.collectLatest { state ->
                binding.progressBar.visibility = if (state.loading) View.VISIBLE else View.GONE
                binding.tvBalance.text = "${state.beans} Beans"
                binding.tvBalanceBdt.text = "≈ ৳${state.beans / 100}"

                if (state.submitted) {
                    Toast.makeText(requireContext(), "Withdrawal submitted!", Toast.LENGTH_SHORT).show()
                    viewModel.resetSubmitted()
                }
            }
        }

        viewModel.loadData()
    }

    override fun onDestroyView() {
        super.onDestroyView()
        _binding = null
    }
}
