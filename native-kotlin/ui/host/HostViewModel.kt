package com.merilive.app.ui.host

import androidx.lifecycle.LiveData
import androidx.lifecycle.MutableLiveData
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.merilive.app.data.model.EarningsTransfer
import com.merilive.app.data.repository.UserRepository
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.launch
import javax.inject.Inject

@HiltViewModel
class HostViewModel @Inject constructor(
    private val userRepository: UserRepository,
) : ViewModel() {

    private val _totalEarnings = MutableLiveData(0L)
    val totalEarnings: LiveData<Long> = _totalEarnings

    private val _transfers = MutableLiveData<List<EarningsTransfer>>()
    val transfers: LiveData<List<EarningsTransfer>> = _transfers

    private val _streamHours = MutableLiveData(0.0)
    val streamHours: LiveData<Double> = _streamHours

    private val _isLoading = MutableLiveData(false)
    val isLoading: LiveData<Boolean> = _isLoading

    fun loadDashboard() {
        viewModelScope.launch {
            _isLoading.value = true
            try {
                _totalEarnings.value = userRepository.getHostTotalEarnings()
                _transfers.value = userRepository.getTransferHistory()
                _streamHours.value = userRepository.getStreamHours()
            } catch (_: Exception) {
            } finally {
                _isLoading.value = false
            }
        }
    }
}
