package com.merilive.app.ui.live

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
import androidx.recyclerview.widget.LinearLayoutManager
import com.merilive.app.R
import com.merilive.app.databinding.FragmentLiveStreamBinding
import com.merilive.app.service.DeepARManager
import com.merilive.app.service.LiveKitManager
import com.merilive.app.service.UniversalAnimationPlayer
import com.merilive.app.data.repository.*
import com.merilive.app.util.AppConstants
import dagger.hilt.android.AndroidEntryPoint
import dagger.hilt.android.lifecycle.HiltViewModel
import io.github.jan.supabase.auth.Auth
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
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.jsonPrimitive
import kotlinx.serialization.json.put
import javax.inject.Inject

@AndroidEntryPoint
class LiveStreamFragment : Fragment() {

    private var _binding: FragmentLiveStreamBinding? = null
    private val binding get() = _binding!!
    private val viewModel: LiveStreamViewModel by viewModels()

    @Inject lateinit var liveKitManager: LiveKitManager
    @Inject lateinit var deepARManager: DeepARManager

    private var giftAnimationQueue: GiftAnimationQueue? = null
    private var musicPlayer: MusicPlayerManager? = null

    override fun onCreateView(inflater: LayoutInflater, container: ViewGroup?, savedInstanceState: Bundle?): View {
        _binding = FragmentLiveStreamBinding.inflate(inflater, container, false)
        return binding.root
    }

    override fun onViewCreated(view: View, savedInstanceState: Bundle?) {
        super.onViewCreated(view, savedInstanceState)

        val streamId = arguments?.getString("streamId") ?: return

        // Initialize gift animation queue
        giftAnimationQueue = GiftAnimationQueue(
            svgaView = binding.svgaGiftView,
            lottieView = binding.lottieGiftView,
            bannerContainer = binding.root as? FrameLayout,
        )

        // Initialize music player
        musicPlayer = MusicPlayerManager()

        setupUI()
        viewModel.joinStream(streamId)
        observeState()
        observeGiftBroadcast(streamId)
        observePKBroadcast(streamId)
        observeHostBusy(streamId)
    }

    private fun setupUI() {
        binding.btnBack.setOnClickListener {
            liveKitManager.disconnect()
            findNavController().navigateUp()
        }
        binding.btnGift.setOnClickListener { showGiftPanel() }
        binding.btnChat.setOnClickListener { toggleChat() }
        binding.btnShare.setOnClickListener { shareStream() }
        binding.btnMusic.setOnClickListener { showMusicPanel() }
        binding.btnPK.setOnClickListener { viewModel.requestPK() }
        binding.rvChat.layoutManager = LinearLayoutManager(requireContext())

        // Swipe gesture: left/right to hide/show UI, up/down to switch streams
        binding.root.setOnTouchListener(SwipeGestureListener(
            onSwipeLeft = { toggleOverlay(true) },
            onSwipeRight = { toggleOverlay(false) },
            onSwipeUp = { viewModel.loadNextStream() },
            onSwipeDown = { viewModel.loadPreviousStream() }
        ))

        // Game button
        binding.root.findViewWithTag<View>("btnGame")?.setOnClickListener {
            showGameSelector()
        }
    }

    private fun toggleOverlay(show: Boolean) {
        val alpha = if (show) 1f else 0f
        listOf(binding.chatSection, binding.btnBack, binding.btnGift,
            binding.btnChat, binding.btnShare, binding.btnMusic, binding.btnPK
        ).forEach { it.animate().alpha(alpha).setDuration(200).start() }
    }

    private fun observeState() {
        viewLifecycleOwner.lifecycleScope.launch {
            viewModel.streamState.collect { state ->
                when (state) {
                    is StreamState.Loading -> binding.progressBar.visibility = View.VISIBLE
                    is StreamState.Connected -> {
                        binding.progressBar.visibility = View.GONE
                        binding.tvHostName.text = state.hostName
                        binding.tvViewerCount.text = "${state.viewerCount}"

                        // Show host-only controls
                        val isHost = state.isHost
                        binding.btnMusic.visibility = if (isHost) View.VISIBLE else View.GONE
                        binding.btnPK.visibility = if (isHost) View.VISIBLE else View.GONE

                        // Connect LiveKit
                        liveKitManager.connect(AppConstants.LIVEKIT_URL, state.token)
                    }
                    is StreamState.HostBusy -> {
                        binding.hostBusyOverlay.visibility = View.VISIBLE
                        binding.tvBusyMessage.text = "Host is on a Private Call 📞"
                    }
                    is StreamState.PKActive -> {
                        binding.pkContainer.visibility = View.VISIBLE
                        binding.tvPKOpponent.text = state.opponentName
                        binding.pkProgressBar.max = 100
                        binding.pkProgressBar.progress = state.myScore
                    }
                    is StreamState.Ended -> {
                        showEndSummary(state.summary)
                    }
                    is StreamState.Error -> {
                        binding.progressBar.visibility = View.GONE
                        findNavController().navigateUp()
                    }
                }
            }
        }

        viewLifecycleOwner.lifecycleScope.launch {
            liveKitManager.remoteParticipants.collect { participants ->
                participants.firstOrNull()?.let { host ->
                    val videoTrack = host.getTrackPublication(
                        io.livekit.android.room.track.Track.Source.CAMERA
                    )?.track as? io.livekit.android.room.track.VideoTrack
                    videoTrack?.addRenderer(binding.hostVideoView)
                }
            }
        }
    }

    private fun observeGiftBroadcast(streamId: String) {
        viewLifecycleOwner.lifecycleScope.launch {
            try {
                viewModel.subscribeToGifts(streamId) { giftEvent ->
                    giftAnimationQueue?.enqueue(giftEvent)
                }
            } catch (_: Exception) {}
        }
    }

    private fun observePKBroadcast(streamId: String) {
        viewLifecycleOwner.lifecycleScope.launch {
            try {
                viewModel.subscribeToPK(streamId) { pkUpdate ->
                    binding.pkProgressBar.progress = pkUpdate.myScore
                    binding.tvPKMyScore.text = pkUpdate.myScore.toString()
                    binding.tvPKOpponentScore.text = pkUpdate.opponentScore.toString()
                    binding.tvPKTimer.text = "${pkUpdate.remainingSeconds}s"
                }
            } catch (_: Exception) {}
        }
    }

    private fun observeHostBusy(streamId: String) {
        viewLifecycleOwner.lifecycleScope.launch {
            viewModel.hostBusyState.collect { isBusy ->
                binding.hostBusyOverlay.visibility = if (isBusy) View.VISIBLE else View.GONE
            }
        }
    }

    private fun showGiftPanel() {
        GiftBottomSheet.newInstance(
            arguments?.getString("streamId") ?: "",
            viewModel.hostId
        ).show(childFragmentManager, "gifts")
    }

    private fun showMusicPanel() {
        MusicBottomSheet.newInstance(
            arguments?.getString("streamId") ?: ""
        ).show(childFragmentManager, "music")
    }

    private fun toggleChat() {
        binding.chatSection.visibility =
            if (binding.chatSection.visibility == View.VISIBLE) View.GONE else View.VISIBLE
    }

    private fun shareStream() {
        val intent = android.content.Intent(android.content.Intent.ACTION_SEND).apply {
            type = "text/plain"
            putExtra(android.content.Intent.EXTRA_TEXT, "Watch live on MeriLive! https://merilive.app/live/${arguments?.getString("streamId")}")
        }
        startActivity(android.content.Intent.createChooser(intent, "Share"))
    }

    private fun showEndSummary(summary: StreamEndSummary) {
        LiveEndSummaryBottomSheet.newInstance(summary)
            .show(childFragmentManager, "endSummary")
    }

    private fun showGameSelector() {
        val streamId = arguments?.getString("streamId") ?: return
        com.merilive.app.ui.game.GameSelectorBottomSheet.newInstance(streamId) { gameType ->
            val fragment = when (gameType) {
                com.merilive.app.data.model.GameType.FERRIS_WHEEL ->
                    com.merilive.app.ui.game.FerrisWheelFragment.newInstance(streamId)
                com.merilive.app.data.model.GameType.TEEN_PATTI ->
                    com.merilive.app.ui.game.TeenPattiFragment.newInstance(streamId)
                com.merilive.app.data.model.GameType.ROULETTE ->
                    com.merilive.app.ui.game.RouletteFragment.newInstance(streamId)
            }
            childFragmentManager.beginTransaction()
                .replace(android.R.id.content, fragment, "game")
                .addToBackStack("game")
                .commit()
        }.show(childFragmentManager, "games")
    }

    override fun onDestroyView() {
        giftAnimationQueue?.release()
        giftAnimationQueue = null
        musicPlayer?.release()
        musicPlayer = null
        liveKitManager.disconnect()
        super.onDestroyView()
        _binding = null
    }
}

// ─── Swipe Gesture Listener ───
class SwipeGestureListener(
    private val onSwipeLeft: () -> Unit = {},
    private val onSwipeRight: () -> Unit = {},
    private val onSwipeUp: () -> Unit = {},
    private val onSwipeDown: () -> Unit = {}
) : View.OnTouchListener {
    private var startX = 0f
    private var startY = 0f
    private val THRESHOLD = 100

    override fun onTouch(v: View, event: android.view.MotionEvent): Boolean {
        when (event.action) {
            android.view.MotionEvent.ACTION_DOWN -> {
                startX = event.x; startY = event.y
            }
            android.view.MotionEvent.ACTION_UP -> {
                val dx = event.x - startX
                val dy = event.y - startY
                if (Math.abs(dx) > Math.abs(dy) && Math.abs(dx) > THRESHOLD) {
                    if (dx < 0) onSwipeLeft() else onSwipeRight()
                    return true
                } else if (Math.abs(dy) > THRESHOLD) {
                    if (dy < 0) onSwipeUp() else onSwipeDown()
                    return true
                }
            }
        }
        return false
    }
}

// ─── Stream States ───
sealed class StreamState {
    object Loading : StreamState()
    data class Connected(
        val hostName: String, val viewerCount: Int, val token: String,
        val isHost: Boolean = false, val hostAvatar: String? = null
    ) : StreamState()
    data class HostBusy(val hostPhotos: List<String> = emptyList()) : StreamState()
    data class PKActive(
        val opponentName: String, val myScore: Int, val opponentScore: Int,
        val remainingSeconds: Int = 300
    ) : StreamState()
    data class Ended(val summary: StreamEndSummary) : StreamState()
    data class Error(val message: String) : StreamState()
}

@Serializable
data class StreamEndSummary(
    val duration: Long = 0,
    val totalViewers: Int = 0,
    val totalGifts: Int = 0,
    val totalBeans: Long = 0,
    val topGifters: List<TopGifter> = emptyList(),
    val newFollowers: Int = 0
)

@Serializable
data class TopGifter(
    val userId: String = "",
    val displayName: String = "",
    val avatarUrl: String? = null,
    val totalSpent: Long = 0
)

@Serializable
data class PKUpdate(
    val myScore: Int = 0,
    val opponentScore: Int = 0,
    val remainingSeconds: Int = 300
)

// ─── ViewModel ───
@HiltViewModel
class LiveStreamViewModel @Inject constructor(
    private val liveRepository: LiveRepository,
    private val postgrest: Postgrest,
    private val realtime: Realtime,
    private val auth: Auth,
) : ViewModel() {

    private val _streamState = MutableStateFlow<StreamState>(StreamState.Loading)
    val streamState = _streamState.asStateFlow()

    private val _hostBusyState = MutableStateFlow(false)
    val hostBusyState = _hostBusyState.asStateFlow()

    var hostId: String = ""
    private var currentStreamId: String = ""
    private var streamList: List<String> = emptyList()
    private var currentIndex: Int = 0

    fun joinStream(streamId: String) {
        currentStreamId = streamId
        viewModelScope.launch {
            try {
                val token = liveRepository.getStreamToken(streamId)
                val isHost = auth.currentUserOrNull()?.id == hostId
                _streamState.value = StreamState.Connected(
                    hostName = "Host",
                    viewerCount = 0,
                    token = token,
                    isHost = isHost
                )
            } catch (e: Exception) {
                _streamState.value = StreamState.Error(e.message ?: "Failed to join")
            }
        }
    }

    fun loadNextStream() {
        if (streamList.isEmpty()) return
        currentIndex = (currentIndex + 1) % streamList.size
        joinStream(streamList[currentIndex])
    }

    fun loadPreviousStream() {
        if (streamList.isEmpty()) return
        currentIndex = if (currentIndex > 0) currentIndex - 1 else streamList.size - 1
        joinStream(streamList[currentIndex])
    }

    fun requestPK() {
        viewModelScope.launch {
            try {
                postgrest.rpc("request_pk_battle", buildJsonObject {
                    put("p_stream_id", currentStreamId)
                })
            } catch (_: Exception) {}
        }
    }

    fun endStream() {
        viewModelScope.launch {
            try {
                val summary = postgrest.rpc("end_live_stream", buildJsonObject {
                    put("p_stream_id", currentStreamId)
                }).decodeSingle<StreamEndSummary>()
                _streamState.value = StreamState.Ended(summary)
            } catch (_: Exception) {}
        }
    }

    suspend fun subscribeToGifts(streamId: String, onGift: (GiftAnimationQueue.GiftAnimationItem) -> Unit) {
        val channel = realtime.channel("stream-gifts-$streamId")
        val flow = channel.broadcastFlow<JsonObject>(event = "gift")
        channel.subscribe()
        flow.collect { data ->
            val item = GiftAnimationQueue.GiftAnimationItem(
                giftId = data["gift_id"]?.jsonPrimitive?.content ?: "",
                giftName = data["gift_name"]?.jsonPrimitive?.content ?: "Gift",
                senderName = data["sender_name"]?.jsonPrimitive?.content ?: "User",
                animationUrl = data["animation_url"]?.jsonPrimitive?.content,
                animationType = data["animation_type"]?.jsonPrimitive?.content,
                iconUrl = data["icon_url"]?.jsonPrimitive?.content,
                quantity = data["quantity"]?.jsonPrimitive?.content?.toIntOrNull() ?: 1,
            )
            onGift(item)
        }
    }

    suspend fun subscribeToPK(streamId: String, onUpdate: (PKUpdate) -> Unit) {
        val channel = realtime.channel("stream-pk-$streamId")
        val flow = channel.broadcastFlow<JsonObject>(event = "pk_update")
        channel.subscribe()
        flow.collect { data ->
            onUpdate(PKUpdate(
                myScore = data["my_score"]?.jsonPrimitive?.content?.toIntOrNull() ?: 0,
                opponentScore = data["opponent_score"]?.jsonPrimitive?.content?.toIntOrNull() ?: 0,
                remainingSeconds = data["remaining_seconds"]?.jsonPrimitive?.content?.toIntOrNull() ?: 300
            ))
        }
    }
}
