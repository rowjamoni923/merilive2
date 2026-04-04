package com.merilive.app.ui.explore

import androidx.lifecycle.LiveData
import androidx.lifecycle.MutableLiveData
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.merilive.app.data.model.LiveStream
import com.merilive.app.data.model.PartyRoom
import com.merilive.app.data.repository.LiveRepository
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.launch
import javax.inject.Inject

@HiltViewModel
class ExploreViewModel @Inject constructor(
    private val liveRepository: LiveRepository,
) : ViewModel() {

    private val _streams = MutableLiveData<List<LiveStream>>()
    val streams: LiveData<List<LiveStream>> = _streams

    private val _partyRooms = MutableLiveData<List<PartyRoom>>()
    val partyRooms: LiveData<List<PartyRoom>> = _partyRooms

    private val _isLoading = MutableLiveData(false)
    val isLoading: LiveData<Boolean> = _isLoading

    fun loadExplore() {
        viewModelScope.launch {
            _isLoading.value = true
            try {
                _streams.value = liveRepository.getActiveStreams()
                _partyRooms.value = liveRepository.getActivePartyRooms()
            } catch (_: Exception) {
            } finally {
                _isLoading.value = false
            }
        }
    }
}
