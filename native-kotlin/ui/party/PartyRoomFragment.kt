package com.merilive.app.ui.party

import android.os.Bundle
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import android.widget.FrameLayout
import androidx.fragment.app.Fragment
import androidx.fragment.app.viewModels
import androidx.lifecycle.ViewModel
import androidx.lifecycle.lifecycleScope
import androidx.lifecycle.viewModelScope
import androidx.navigation.fragment.findNavController
import androidx.recyclerview.widget.GridLayoutManager
import com.merilive.app.databinding.FragmentPartyRoomBinding
import com.merilive.app.service.LiveKitManager
import com.merilive.app.util.AppConstants
import dagger.hilt.android.AndroidEntryPoint
import dagger.hilt.android.lifecycle.HiltViewModel
import io.github.jan.supabase.auth.Auth
import io.github.jan.supabase.functions.Functions
import io.github.jan.supabase.postgrest.Postgrest
import io.github.jan.supabase.postgrest.rpc
import io.github.jan.supabase.realtime.Realtime
import io.github.jan.supabase.realtime.channel
import io.github.jan.supabase.realtime.broadcastFlow

import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.jsonPrimitive
import kotlinx.serialization.json.put
import javax.inject.Inject

@AndroidEntryPoint
class PartyRoomFragment : Fragment() {

    private var _binding: FragmentPartyRoomBinding? = null
    private val binding get() = _binding!!
    private val viewModel: PartyRoomViewModel by viewModels()

    @Inject lateinit var liveKitManager: LiveKitManager

    private lateinit var seatAdapter: PartySeatAdapter

    override fun onCreateView(inflater: LayoutInflater, container: ViewGroup?, savedInstanceState: Bundle?): View {
        _binding = FragmentPartyRoomBinding.inflate(inflater, container, false)
        return binding.root
    }

    override fun onViewCreated(view: View, savedInstanceState: Bundle?) {
        super.onViewCreated(view, savedInstanceState)
        val roomId = arguments?.getString("roomId") ?: return

        // Seat grid (2x4 = 8 seats typical)
        seatAdapter = PartySeatAdapter(
            onSeatClick = { seat -> viewModel.handleSeatAction(seat) },
            onKick = { seat -> viewModel.kickFromSeat(seat.seatIndex) },
            onMute = { seat -> viewModel.muteSeat(seat.seatIndex) }
        )
        binding.rvSeats.layoutManager = GridLayoutManager(requireContext(), 4)
        binding.rvSeats.adapter = seatAdapter

        binding.btnBack.setOnClickListener {
            liveKitManager.disconnect()
            findNavController().navigateUp()
        }
        binding.btnMic.setOnClickListener { viewModel.toggleMic(liveKitManager) }
        binding.btnCamera.setOnClickListener { viewModel.toggleCamera(liveKitManager) }
        binding.btnGift.setOnClickListener {
            com.merilive.app.ui.live.GiftBottomSheet.newInstance(roomId, viewModel.hostId)
                .show(childFragmentManager, "gifts")
        }
        binding.btnSettings.setOnClickListener { showRoomSettings() }

        // Game button
        binding.btnGame.setOnClickListener { showGameSelector(roomId) }

        viewModel.joinRoom(roomId)
        observeState()
    }

    private fun observeState() {
        viewLifecycleOwner.lifecycleScope.launch {
            viewModel.roomState.collect { state ->
                when (state) {
                    is PartyState.Loading -> binding.progressBar.visibility = View.VISIBLE
                    is PartyState.Connected -> {
                        binding.progressBar.visibility = View.GONE
                        binding.tvRoomName.text = state.roomName
                        binding.tvViewerCount.text = "${state.viewerCount}"

                        // Show host controls
                        binding.btnSettings.visibility = if (state.isHost) View.VISIBLE else View.GONE

                        liveKitManager.connect(AppConstants.LIVEKIT_URL, state.token)
                    }
                    is PartyState.Error -> {
                        binding.progressBar.visibility = View.GONE
                        findNavController().navigateUp()
                    }
                }
            }
        }

        viewLifecycleOwner.lifecycleScope.launch {
            viewModel.seats.collect { seats ->
                seatAdapter.submitList(seats)
            }
        }

        viewLifecycleOwner.lifecycleScope.launch {
            viewModel.micState.collect { isOn ->
                binding.btnMic.alpha = if (isOn) 1f else 0.5f
            }
        }

        viewLifecycleOwner.lifecycleScope.launch {
            viewModel.cameraState.collect { isOn ->
                binding.btnCamera.alpha = if (isOn) 1f else 0.5f
            }
        }
    }

    private fun showRoomSettings() {
        val roomId = arguments?.getString("roomId") ?: return
        PartySettingsBottomSheet.newInstance(roomId).show(childFragmentManager, "settings")
    }

    private fun showGameSelector(roomId: String) {
        com.merilive.app.ui.game.GameSelectorBottomSheet.newInstance(roomId) { gameType ->
            val fragment = when (gameType) {
                com.merilive.app.data.model.GameType.FERRIS_WHEEL ->
                    com.merilive.app.ui.game.FerrisWheelFragment.newInstance(roomId)
                com.merilive.app.data.model.GameType.TEEN_PATTI ->
                    com.merilive.app.ui.game.TeenPattiFragment.newInstance(roomId)
                com.merilive.app.data.model.GameType.ROULETTE ->
                    com.merilive.app.ui.game.RouletteFragment.newInstance(roomId)
            }
            childFragmentManager.beginTransaction()
                .replace(android.R.id.content, fragment, "game")
                .addToBackStack("game")
                .commit()
        }.show(childFragmentManager, "games")
    }

    override fun onDestroyView() {
        liveKitManager.disconnect()
        super.onDestroyView()
        _binding = null
    }
}

// ─── Models ───
@Serializable
data class PartySeat(
    val seatIndex: Int = 0,
    val userId: String? = null,
    val displayName: String? = null,
    val avatarUrl: String? = null,
    val isMuted: Boolean = false,
    val isLocked: Boolean = false,
    val isSpeaking: Boolean = false
)

sealed class PartyState {
    object Loading : PartyState()
    data class Connected(
        val roomName: String, val viewerCount: Int, val token: String,
        val isHost: Boolean = false, val seatCount: Int = 8
    ) : PartyState()
    data class Error(val message: String) : PartyState()
}

@Serializable
data class PartyJoinResponse(
    val token: String, val room_name: String? = null, val host_id: String? = null,
    val seat_count: Int = 8, val seats: List<PartySeat> = emptyList()
)

// ─── ViewModel ───
@HiltViewModel
class PartyRoomViewModel @Inject constructor(
    private val functions: Functions,
    private val postgrest: Postgrest,
    private val realtime: Realtime,
    private val auth: Auth,
) : ViewModel() {

    private val _roomState = MutableStateFlow<PartyState>(PartyState.Loading)
    val roomState = _roomState.asStateFlow()

    private val _seats = MutableStateFlow<List<PartySeat>>(emptyList())
    val seats = _seats.asStateFlow()

    private val _micState = MutableStateFlow(false)
    val micState = _micState.asStateFlow()

    private val _cameraState = MutableStateFlow(false)
    val cameraState = _cameraState.asStateFlow()

    var hostId: String = ""
    private var currentRoomId: String = ""

    fun joinRoom(roomId: String) {
        currentRoomId = roomId
        viewModelScope.launch {
            try {
                val response = functions.invoke("party-room/join")
                val result: PartyJoinResponse = Json { ignoreUnknownKeys = true }.decodeFromString(response.decodeAs())
                hostId = result.host_id ?: ""

                val isHost = auth.currentUserOrNull()?.id == hostId
                _roomState.value = PartyState.Connected(
                    result.room_name ?: "Party", 0, result.token,
                    isHost = isHost, seatCount = result.seat_count
                )

                // Initialize seats
                if (result.seats.isNotEmpty()) {
                    _seats.value = result.seats
                } else {
                    _seats.value = (0 until result.seat_count).map { PartySeat(seatIndex = it) }
                }

                // Subscribe to seat updates
                subscribeSeatUpdates(roomId)
            } catch (e: Exception) {
                _roomState.value = PartyState.Error(e.message ?: "Failed")
            }
        }
    }

    private fun subscribeSeatUpdates(roomId: String) {
        viewModelScope.launch {
            try {
                val channel = realtime.channel("party-seats-$roomId")
                val flow = channel.broadcastFlow<JsonObject>(event = "seat_update")
                channel.subscribe()
                flow.collect { data ->
                    val seatIndex = data["seat_index"]?.jsonPrimitive?.content?.toIntOrNull() ?: return@collect
                    val userId = data["user_id"]?.jsonPrimitive?.content
                    val name = data["display_name"]?.jsonPrimitive?.content
                    val avatar = data["avatar_url"]?.jsonPrimitive?.content
                    val isMuted = data["is_muted"]?.jsonPrimitive?.content?.toBooleanStrictOrNull() ?: false

                    _seats.update { seats ->
                        seats.map { seat ->
                            if (seat.seatIndex == seatIndex) seat.copy(
                                userId = userId, displayName = name,
                                avatarUrl = avatar, isMuted = isMuted
                            ) else seat
                        }
                    }
                }
            } catch (_: Exception) {}
        }
    }

    fun handleSeatAction(seat: PartySeat) {
        viewModelScope.launch {
            try {
                if (seat.userId == null) {
                    // Take seat
                    postgrest.rpc("party_take_seat", buildJsonObject {
                        put("p_room_id", currentRoomId)
                        put("p_seat_index", seat.seatIndex)
                    })
                } else if (seat.userId == auth.currentUserOrNull()?.id) {
                    // Leave seat
                    postgrest.rpc("party_leave_seat", buildJsonObject {
                        put("p_room_id", currentRoomId)
                        put("p_seat_index", seat.seatIndex)
                    })
                }
            } catch (_: Exception) {}
        }
    }

    fun kickFromSeat(seatIndex: Int) {
        viewModelScope.launch {
            try {
                postgrest.rpc("party_kick_seat", buildJsonObject {
                    put("p_room_id", currentRoomId)
                    put("p_seat_index", seatIndex)
                })
            } catch (_: Exception) {}
        }
    }

    fun muteSeat(seatIndex: Int) {
        viewModelScope.launch {
            try {
                postgrest.rpc("party_mute_seat", buildJsonObject {
                    put("p_room_id", currentRoomId)
                    put("p_seat_index", seatIndex)
                })
            } catch (_: Exception) {}
        }
    }

    fun toggleMic(liveKitManager: LiveKitManager) {
        _micState.update { !it }
        // LiveKit mic toggle handled by manager
    }

    fun toggleCamera(liveKitManager: LiveKitManager) {
        _cameraState.update { !it }
    }
}
