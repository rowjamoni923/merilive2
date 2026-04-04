package com.merilive.app.ui.call

import android.os.Bundle
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import androidx.fragment.app.Fragment
import androidx.fragment.app.viewModels
import androidx.lifecycle.ViewModel
import androidx.lifecycle.lifecycleScope
import androidx.lifecycle.viewModelScope
import androidx.navigation.fragment.findNavController
import com.merilive.app.databinding.FragmentPrivateCallBinding
import com.merilive.app.service.LiveKitManager
import com.merilive.app.data.repository.*
import dagger.hilt.android.AndroidEntryPoint
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import javax.inject.Inject

@AndroidEntryPoint
class PrivateCallFragment : Fragment() {

    private var _binding: FragmentPrivateCallBinding? = null
    private val binding get() = _binding!!
    private val viewModel: PrivateCallViewModel by viewModels()

    @Inject lateinit var liveKitManager: LiveKitManager

    override fun onCreateView(inflater: LayoutInflater, container: ViewGroup?, savedInstanceState: Bundle?): View {
        _binding = FragmentPrivateCallBinding.inflate(inflater, container, false)
        return binding.root
    }

    override fun onViewCreated(view: View, savedInstanceState: Bundle?) {
        super.onViewCreated(view, savedInstanceState)

        binding.btnEndCall.setOnClickListener {
            viewModel.endCall()
            liveKitManager.disconnect()
            findNavController().navigateUp()
        }

        binding.btnMute.setOnClickListener { viewModel.toggleMute() }
        binding.btnFlipCamera.setOnClickListener { liveKitManager.switchCamera() }
        binding.btnSpeaker.setOnClickListener { viewModel.toggleSpeaker() }

        observeState()
    }

    private fun observeState() {
        viewLifecycleOwner.lifecycleScope.launch {
            viewModel.callState.collect { state ->
                when (state) {
                    is CallState.Connecting -> {
                        binding.tvStatus.text = "Connecting..."
                    }
                    is CallState.Connected -> {
                        binding.tvStatus.text = "Connected"
                        binding.tvDuration.visibility = View.VISIBLE
                    }
                    is CallState.Ended -> {
                        binding.tvStatus.text = "Call Ended"
                        binding.tvTotalCost.text = "💎 ${state.totalCost}"
                        binding.tvTotalCost.visibility = View.VISIBLE
                    }
                }
            }
        }

        // Duration timer
        viewLifecycleOwner.lifecycleScope.launch {
            viewModel.duration.collect { seconds ->
                val min = seconds / 60
                val sec = seconds % 60
                binding.tvDuration.text = String.format("%02d:%02d", min, sec)
            }
        }
    }

    override fun onDestroyView() {
        liveKitManager.disconnect()
        super.onDestroyView()
        _binding = null
    }
}

sealed class CallState {
    object Connecting : CallState()
    data class Connected(val callId: String) : CallState()
    data class Ended(val totalCost: Int) : CallState()
}

@HiltViewModel
class PrivateCallViewModel @Inject constructor(
    private val callRepository: CallRepository,
) : ViewModel() {

    private val _callState = MutableStateFlow<CallState>(CallState.Connecting)
    val callState = _callState.asStateFlow()

    private val _duration = MutableStateFlow(0)
    val duration = _duration.asStateFlow()

    private var callId: String? = null
    private var isMuted = false
    private var isSpeakerOn = false

    fun startCall(calleeId: String, callType: String) {
        viewModelScope.launch {
            try {
                val response = callRepository.initiateCall(calleeId, callType)
                callId = response.call_id
                _callState.value = CallState.Connected(response.call_id)
                startTimer()
            } catch (e: Exception) {
                _callState.value = CallState.Ended(0)
            }
        }
    }

    fun endCall() {
        viewModelScope.launch {
            callId?.let { callRepository.endCall(it) }
            _callState.value = CallState.Ended(_duration.value * 1) // Simplified cost
        }
    }

    fun toggleMute() { isMuted = !isMuted }
    fun toggleSpeaker() { isSpeakerOn = !isSpeakerOn }

    private fun startTimer() {
        viewModelScope.launch {
            while (true) {
                delay(1000)
                _duration.value += 1
            }
        }
    }
}
