package com.merilive.app.ui.trader

import android.os.Bundle
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import androidx.fragment.app.Fragment
import androidx.fragment.app.viewModels
import androidx.lifecycle.lifecycleScope
import androidx.navigation.fragment.findNavController
import com.merilive.app.R
import com.merilive.app.databinding.FragmentTraderWalletBinding
import dagger.hilt.android.AndroidEntryPoint
import kotlinx.coroutines.flow.collectLatest
import kotlinx.coroutines.launch

@AndroidEntryPoint
class TraderWalletFragment : Fragment() {

    private var _binding: FragmentTraderWalletBinding? = null
    private val binding get() = _binding!!
    private val viewModel: TraderWalletViewModel by viewModels()

    override fun onCreateView(inflater: LayoutInflater, container: ViewGroup?, savedInstanceState: Bundle?): View {
        _binding = FragmentTraderWalletBinding.inflate(inflater, container, false)
        return binding.root
    }

    override fun onViewCreated(view: View, savedInstanceState: Bundle?) {
        super.onViewCreated(view, savedInstanceState)

        binding.btnBack.setOnClickListener { findNavController().popBackStack() }
        binding.btnTransferToUser.setOnClickListener {
            findNavController().navigate(R.id.action_trader_to_transferToUser)
        }
        binding.btnTransferToAgency.setOnClickListener {
            findNavController().navigate(R.id.action_trader_to_transferToAgency)
        }
        binding.btnHistory.setOnClickListener {
            findNavController().navigate(R.id.action_trader_to_history)
        }

        viewLifecycleOwner.lifecycleScope.launch {
            viewModel.state.collectLatest { state ->
                binding.progressBar.visibility = if (state.loading) View.VISIBLE else View.GONE
                binding.tvDiamondBalance.text = String.format("%,d", state.wallet.diamond_balance)
                binding.tvTotalTransferred.text = String.format("%,d", state.wallet.total_transferred)
                binding.tvTotalReceived.text = String.format("%,d", state.wallet.total_received)
            }
        }

        viewModel.loadWallet()
    }

    override fun onDestroyView() { super.onDestroyView(); _binding = null }
}
