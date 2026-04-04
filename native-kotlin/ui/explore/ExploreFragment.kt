package com.merilive.app.ui.explore

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
import androidx.recyclerview.widget.GridLayoutManager
import com.merilive.app.R
import com.merilive.app.databinding.FragmentExploreBinding
import com.merilive.app.data.repository.*
import com.merilive.app.ui.home.adapter.LiveStreamAdapter
import com.merilive.app.ui.home.adapter.PartyRoomAdapter
import dagger.hilt.android.AndroidEntryPoint
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import javax.inject.Inject

@AndroidEntryPoint
class ExploreFragment : Fragment() {

    private var _binding: FragmentExploreBinding? = null
    private val binding get() = _binding!!
    private val viewModel: ExploreViewModel by viewModels()

    override fun onCreateView(inflater: LayoutInflater, container: ViewGroup?, savedInstanceState: Bundle?): View {
        _binding = FragmentExploreBinding.inflate(inflater, container, false)
        return binding.root
    }

    override fun onViewCreated(view: View, savedInstanceState: Bundle?) {
        super.onViewCreated(view, savedInstanceState)
        binding.rvContent.layoutManager = GridLayoutManager(requireContext(), 2)
        viewModel.loadExplore()

        viewLifecycleOwner.lifecycleScope.launch {
            viewModel.rooms.collect { rooms ->
                binding.rvContent.adapter = PartyRoomAdapter(rooms) { room ->
                    val bundle = Bundle().apply { putString("roomId", room.id) }
                    findNavController().navigate(R.id.action_explore_to_partyRoom, bundle)
                }
            }
        }
    }

    override fun onDestroyView() { super.onDestroyView(); _binding = null }
}

@HiltViewModel
class ExploreViewModel @Inject constructor(
    private val liveRepository: LiveRepository,
) : ViewModel() {
    private val _rooms = MutableStateFlow<List<PartyRoomResponse>>(emptyList())
    val rooms = _rooms.asStateFlow()

    fun loadExplore() {
        viewModelScope.launch {
            try { _rooms.value = liveRepository.getPartyRooms() } catch (_: Exception) {}
        }
    }
}
