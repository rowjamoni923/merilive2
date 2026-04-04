package com.merilive.app.ui.call

import androidx.lifecycle.LiveData
import androidx.lifecycle.MutableLiveData
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.merilive.app.data.repository.CallHistoryItem
import com.merilive.app.data.repository.CallRepository
import com.merilive.app.data.repository.CallResponse
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import javax.inject.Inject

@HiltViewModel
class CallViewModel @Inject constructor(
    private val callRepository: CallRepository,
) : ViewModel() {

    private val _callResponse = MutableLiveData<CallResponse?>()
    val callResponse: LiveData<CallResponse?> = _callResponse

    private val _callState = MutableLiveData("idle")
    val callState: LiveData<String> = _callState

    private val _duration = MutableLiveData(0)
    val duration: LiveData<Int> = _duration

    private val _callHistory = MutableStateFlow<List<CallHistoryItem>>(emptyList())
    val callHistory = _callHistory.asStateFlow()

    fun initiateCall(calleeId: String, callType: String = "video") {
        viewModelScope.launch {
            _callState.value = "ringing"
            try {
                val result = callRepository.initiateCall(calleeId, callType)
                _callResponse.value = result
            } catch (e: Exception) {
                _callState.value = "ended"
            }
        }
    }

    fun acceptCall(callId: String) {
        viewModelScope.launch {
            try {
                callRepository.acceptCall(callId)
                _callState.value = "connected"
            } catch (_: Exception) {
                _callState.value = "ended"
            }
        }
    }

    fun endCall(callId: String) {
        viewModelScope.launch {
            try {
                callRepository.endCall(callId)
            } catch (_: Exception) {
            } finally {
                _callState.value = "ended"
            }
        }
    }

    fun loadCallHistory() {
        viewModelScope.launch {
            try {
                _callHistory.value = callRepository.getCallHistory()
            } catch (_: Exception) {}
        }
    }
}