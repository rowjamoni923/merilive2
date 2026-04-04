package com.merilive.app.ui.agency

import androidx.lifecycle.LiveData
import androidx.lifecycle.MutableLiveData
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.merilive.app.data.model.Agency
import com.merilive.app.data.model.AgencyHost
import com.merilive.app.data.repository.UserRepository
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.launch
import javax.inject.Inject

@HiltViewModel
class AgencyViewModel @Inject constructor(
    private val userRepository: UserRepository,
) : ViewModel() {

    private val _agency = MutableLiveData<Agency?>()
    val agency: LiveData<Agency?> = _agency

    private val _hosts = MutableLiveData<List<AgencyHost>>()
    val hosts: LiveData<List<AgencyHost>> = _hosts

    private val _isLoading = MutableLiveData(false)
    val isLoading: LiveData<Boolean> = _isLoading

    fun loadAgency() {
        viewModelScope.launch {
            _isLoading.value = true
            try {
                _agency.value = userRepository.getMyAgency()
                _hosts.value = userRepository.getAgencyHosts()
            } catch (_: Exception) {
            } finally {
                _isLoading.value = false
            }
        }
    }
}
