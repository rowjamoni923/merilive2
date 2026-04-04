package com.merilive.app.ui.agency

import android.os.Bundle
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import android.widget.Toast
import androidx.fragment.app.Fragment
import androidx.fragment.app.viewModels
import androidx.lifecycle.lifecycleScope
import androidx.navigation.fragment.findNavController
import com.merilive.app.databinding.FragmentAgencyWithdrawalBinding
import dagger.hilt.android.AndroidEntryPoint
import kotlinx.coroutines.flow.collectLatest
import kotlinx.coroutines.launch

@AndroidEntryPoint
class AgencyWithdrawalFragment : Fragment() {

    private var _binding: FragmentAgencyWithdrawalBinding? = null
    private val binding get() = _binding!!
    private val viewModel: AgencyWithdrawalViewModel by viewModels()

    override fun onCreateView(inflater: LayoutInflater, container: ViewGroup?, savedInstanceState: Bundle?): View {
        _binding = FragmentAgencyWithdrawalBinding.inflate(inflater, container, false)
        return binding.root
    }

    override fun onViewCreated(view: View, savedInstanceState: Bundle?) {
        super.onViewCreated(view, savedInstanceState)
        binding.btnBack.setOnClickListener { findNavController().popBackStack() }

        binding.btnSubmitWithdrawal.setOnClickListener {
            val amount = binding.etAmount.text.toString().toIntOrNull() ?: 0
            viewModel.submitWithdrawal(amount, "local_payment")
        }

        viewLifecycleOwner.lifecycleScope.launch {
            viewModel.state.collectLatest { state ->
                binding.progressBar.visibility = if (state.loading) View.VISIBLE else View.GONE
                binding.tvBalance.text = "${state.balance} Beans"

                if (state.submitted) {
                    Toast.makeText(requireContext(), "Withdrawal submitted!", Toast.LENGTH_SHORT).show()
                    viewModel.resetSubmitted()
                }
            }
        }

        viewModel.loadData()
    }

    override fun onDestroyView() { super.onDestroyView(); _binding = null }
}
