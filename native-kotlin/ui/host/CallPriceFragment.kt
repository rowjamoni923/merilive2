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
import com.merilive.app.databinding.FragmentCallPriceBinding
import dagger.hilt.android.AndroidEntryPoint
import kotlinx.coroutines.flow.collectLatest
import kotlinx.coroutines.launch

@AndroidEntryPoint
class CallPriceFragment : Fragment() {

    private var _binding: FragmentCallPriceBinding? = null
    private val binding get() = _binding!!
    private val viewModel: CallPriceViewModel by viewModels()

    override fun onCreateView(
        inflater: LayoutInflater, container: ViewGroup?, savedInstanceState: Bundle?
    ): View {
        _binding = FragmentCallPriceBinding.inflate(inflater, container, false)
        return binding.root
    }

    override fun onViewCreated(view: View, savedInstanceState: Bundle?) {
        super.onViewCreated(view, savedInstanceState)

        binding.btnBack.setOnClickListener { findNavController().popBackStack() }

        binding.btnSavePrice.setOnClickListener {
            val videoPrice = binding.etVideoPrice.text.toString().toIntOrNull() ?: 0
            val audioPrice = binding.etAudioPrice.text.toString().toIntOrNull() ?: 0
            viewModel.updateCallPrices(videoPrice, audioPrice)
        }

        viewLifecycleOwner.lifecycleScope.launch {
            viewModel.state.collectLatest { state ->
                binding.progressBar.visibility = if (state.loading) View.VISIBLE else View.GONE

                if (!state.loading && state.videoPrice > 0) {
                    binding.etVideoPrice.setText(state.videoPrice.toString())
                    binding.etAudioPrice.setText(state.audioPrice.toString())
                }

                if (state.saved) {
                    Toast.makeText(requireContext(), "Prices updated!", Toast.LENGTH_SHORT).show()
                    viewModel.resetSaved()
                }
            }
        }

        viewModel.loadCallPrices()
    }

    override fun onDestroyView() {
        super.onDestroyView()
        _binding = null
    }
}
