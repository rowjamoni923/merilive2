package com.merilive.app.ui.live

import android.os.Bundle
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import com.google.android.material.bottomsheet.BottomSheetDialogFragment
import com.merilive.app.databinding.BottomSheetMusicPlayerBinding
import dagger.hilt.android.AndroidEntryPoint
import androidx.fragment.app.viewModels
import androidx.lifecycle.ViewModel
import androidx.lifecycle.lifecycleScope
import androidx.lifecycle.viewModelScope
import androidx.recyclerview.widget.LinearLayoutManager
import io.github.jan.supabase.postgrest.Postgrest
import io.github.jan.supabase.postgrest.from
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.collectLatest
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import kotlinx.serialization.Serializable
import javax.inject.Inject
import dagger.hilt.android.lifecycle.HiltViewModel

@AndroidEntryPoint
class MusicBottomSheet : BottomSheetDialogFragment() {

    private var _binding: BottomSheetMusicPlayerBinding? = null
    private val binding get() = _binding!!
    private val viewModel: MusicViewModel by viewModels()

    companion object {
        fun newInstance(streamId: String) = MusicBottomSheet().apply {
            arguments = Bundle().apply { putString("streamId", streamId) }
        }
    }

    override fun onCreateView(inflater: LayoutInflater, container: ViewGroup?, savedInstanceState: Bundle?): View {
        _binding = BottomSheetMusicPlayerBinding.inflate(inflater, container, false)
        return binding.root
    }

    override fun onViewCreated(view: View, savedInstanceState: Bundle?) {
        super.onViewCreated(view, savedInstanceState)

        val adapter = MusicTrackAdapter { track ->
            viewModel.playTrack(track)
        }

        binding.rvTracks.layoutManager = LinearLayoutManager(requireContext())
        binding.rvTracks.adapter = adapter

        binding.btnStop.setOnClickListener { viewModel.stopMusic() }

        viewLifecycleOwner.lifecycleScope.launch {
            viewModel.state.collectLatest { state ->
                binding.progressBar.visibility = if (state.loading) View.VISIBLE else View.GONE
                adapter.submitList(state.tracks)
                adapter.currentPlayingId = state.currentTrackId

                binding.nowPlayingSection.visibility =
                    if (state.currentTrackId != null) View.VISIBLE else View.GONE
                binding.tvNowPlaying.text = state.currentTrackName ?: ""
            }
        }

        viewModel.loadTracks()
    }

    override fun onDestroyView() { super.onDestroyView(); _binding = null }
}

@Serializable
data class MusicTrack(
    val id: String = "",
    val title: String = "",
    val artist: String = "",
    val audio_url: String = "",
    val cover_image_url: String? = null,
    val duration_seconds: Int? = null,
    val category: String? = null,
    val is_active: Boolean = true
)

data class MusicState(
    val loading: Boolean = false,
    val tracks: List<MusicTrack> = emptyList(),
    val currentTrackId: String? = null,
    val currentTrackName: String? = null,
    val error: String? = null
)

@HiltViewModel
class MusicViewModel @Inject constructor(
    private val postgrest: Postgrest
) : ViewModel() {

    private val _state = MutableStateFlow(MusicState())
    val state = _state.asStateFlow()

    fun loadTracks() {
        viewModelScope.launch {
            _state.update { it.copy(loading = true) }
            try {
                val tracks = postgrest.from("admin_music_library")
                    .select { filter { eq("is_active", true) } }
                    .decodeList<MusicTrack>()
                _state.update { it.copy(loading = false, tracks = tracks) }
            } catch (e: Exception) {
                _state.update { it.copy(loading = false, error = e.message) }
            }
        }
    }

    fun playTrack(track: MusicTrack) {
        _state.update { it.copy(currentTrackId = track.id, currentTrackName = "${track.title} - ${track.artist}") }
        // Actual playback handled by MusicPlayerManager in fragment
    }

    fun stopMusic() {
        _state.update { it.copy(currentTrackId = null, currentTrackName = null) }
    }
}
