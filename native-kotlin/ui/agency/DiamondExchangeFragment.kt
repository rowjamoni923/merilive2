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
import com.merilive.app.databinding.FragmentDiamondExchangeBinding
import dagger.hilt.android.AndroidEntryPoint
import kotlinx.coroutines.flow.collectLatest
import kotlinx.coroutines.launch

@AndroidEntryPoint
class DiamondExchangeFragment : Fragment() {

    private var _binding: FragmentDiamondExchangeBinding? = null
    private val binding get() = _binding!!
    private val viewModel: DiamondExchangeViewModel by viewModels()

    override fun onCreateView(inflater: LayoutInflater, container: ViewGroup?, savedInstanceState: Bundle?): View {
        _binding = FragmentDiamondExchangeBinding.inflate(inflater, container, false)
        return binding.root
    }

    override fun onViewCreated(view: View, savedInstanceState: Bundle?) {
        super.onViewCreated(view, savedInstanceState)
        binding.btnBack.setOnClickListener { findNavController().popBackStack() }

        binding.btnExchange.setOnClickListener {
            val amount = binding.etBeansAmount.text.toString().toIntOrNull() ?: 0
            if (amount < 100000) {
                Toast.makeText(requireContext(), "Minimum 100,000 beans", Toast.LENGTH_SHORT).show()
                return@setOnClickListener
            }
            viewModel.exchange(amount)
        }

        viewLifecycleOwner.lifecycleScope.launch {
            viewModel.state.collectLatest { state ->
                binding.progressBar.visibility = if (state.loading) View.VISIBLE else View.GONE
                binding.tvMyBeans.text = "${state.beans} Beans"
                binding.tvFeeRate.text = "Fee: 25%"
                binding.tvEstimatedDiamonds.text = "≈ ${state.estimatedDiamonds} 💎"

                if (state.exchangeSuccess) {
                    Toast.makeText(requireContext(), "Exchange successful! +${state.lastDiamonds} 💎", Toast.LENGTH_SHORT).show()
                    viewModel.resetSuccess()
                }
            }
        }

        viewModel.loadData()
    }

    override fun onDestroyView() { super.onDestroyView(); _binding = null }
}
