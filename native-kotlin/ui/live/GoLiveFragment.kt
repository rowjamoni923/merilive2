package com.merilive.app.ui.live

import android.Manifest
import android.content.Context
import android.os.Bundle
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import android.widget.Toast
import androidx.activity.result.contract.ActivityResultContracts
import androidx.camera.core.CameraSelector
import androidx.camera.core.Preview
import androidx.camera.lifecycle.ProcessCameraProvider
import androidx.core.content.ContextCompat
import androidx.fragment.app.Fragment
import androidx.fragment.app.viewModels
import androidx.lifecycle.ViewModel
import androidx.lifecycle.lifecycleScope
import androidx.lifecycle.viewModelScope
import com.merilive.app.databinding.FragmentGoLiveBinding
import com.merilive.app.util.PermissionHelper
import com.merilive.app.service.DeepARManager
import com.merilive.app.service.LiveKitManager
import com.merilive.app.data.repository.*
import dagger.hilt.android.AndroidEntryPoint
import dagger.hilt.android.lifecycle.HiltViewModel
import io.github.jan.supabase.auth.Auth
import io.github.jan.supabase.functions.Functions

import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json
import javax.inject.Inject

@AndroidEntryPoint
class GoLiveFragment : Fragment() {

    companion object {
        private const val PERMISSION_PREFS = "live_permissions"
        private const val KEY_GO_LIVE_REQUESTED = "go_live_requested"
    }

    private var _binding: FragmentGoLiveBinding? = null
    private val binding get() = _binding!!
    private val viewModel: GoLiveViewModel by viewModels()

    @Inject lateinit var deepARManager: DeepARManager
    @Inject lateinit var liveKitManager: LiveKitManager

    private var cameraProvider: ProcessCameraProvider? = null
    private var currentLensFacing = CameraSelector.LENS_FACING_FRONT

    private val livePermissionsLauncher = registerForActivityResult(
        ActivityResultContracts.RequestMultiplePermissions()
    ) { permissions ->
        val cameraGranted = permissions[Manifest.permission.CAMERA] == true
        val micGranted = permissions[Manifest.permission.RECORD_AUDIO] == true

        if (cameraGranted && micGranted) {
            initializeLiveCamera()
            binding.btnStartLive.isEnabled = true
        } else {
            showPermissionBlockedMessage()
        }
    }

    override fun onCreateView(inflater: LayoutInflater, container: ViewGroup?, savedInstanceState: Bundle?): View {
        _binding = FragmentGoLiveBinding.inflate(inflater, container, false)
        return binding.root
    }

    override fun onViewCreated(view: View, savedInstanceState: Bundle?) {
        super.onViewCreated(view, savedInstanceState)

        if (hasLivePermissions()) {
            initializeLiveCamera()
        } else if (shouldAutoRequestPermissions()) {
            markPermissionsRequested()
            requestLivePermissions()
        } else {
            showPermissionBlockedMessage()
        }

        binding.btnStartLive.setOnClickListener {
            if (!hasLivePermissions()) {
                requestLivePermissions()
                return@setOnClickListener
            }
            val title = binding.etStreamTitle.text.toString().ifBlank { "Live Stream" }
            viewModel.startStream(title)
        }

        binding.btnBeauty.setOnClickListener { showBeautyPanel() }
        binding.btnSticker.setOnClickListener { showStickerPanel() }
        binding.btnFlipCamera.setOnClickListener { flipCamera() }

        observeState()
    }

    private fun initializeLiveCamera() {
        startCameraPreview()
        deepARManager.initialize()
    }

    private fun startCameraPreview() {
        val cameraProviderFuture = ProcessCameraProvider.getInstance(requireContext())
        cameraProviderFuture.addListener({
            try {
                val provider = cameraProviderFuture.get()
                cameraProvider = provider

                val preview = Preview.Builder().build().also {
                    it.surfaceProvider = binding.cameraPreview.surfaceProvider
                }

                val cameraSelector = CameraSelector.Builder()
                    .requireLensFacing(currentLensFacing)
                    .build()

                provider.unbindAll()
                provider.bindToLifecycle(viewLifecycleOwner, cameraSelector, preview)
            } catch (_: Exception) {
                binding.btnStartLive.isEnabled = false
                Toast.makeText(requireContext(), "Camera failed to initialize", Toast.LENGTH_SHORT).show()
            }
        }, ContextCompat.getMainExecutor(requireContext()))
    }

    private fun flipCamera() {
        currentLensFacing = if (currentLensFacing == CameraSelector.LENS_FACING_FRONT) {
            CameraSelector.LENS_FACING_BACK
        } else {
            CameraSelector.LENS_FACING_FRONT
        }

        if (hasLivePermissions()) {
            startCameraPreview()
            liveKitManager.switchCamera()
        }
    }

    private fun hasLivePermissions(): Boolean {
        return PermissionHelper.hasCameraPermission(requireContext()) &&
            PermissionHelper.hasMicrophonePermission(requireContext())
    }

    private fun requestLivePermissions() {
        livePermissionsLauncher.launch(
            arrayOf(
                Manifest.permission.CAMERA,
                Manifest.permission.RECORD_AUDIO,
            )
        )
    }

    private fun shouldAutoRequestPermissions(): Boolean {
        return !permissionPrefs().getBoolean(KEY_GO_LIVE_REQUESTED, false)
    }

    private fun markPermissionsRequested() {
        permissionPrefs().edit().putBoolean(KEY_GO_LIVE_REQUESTED, true).apply()
    }

    private fun permissionPrefs() = requireContext().getSharedPreferences(PERMISSION_PREFS, Context.MODE_PRIVATE)

    private fun showPermissionBlockedMessage() {
        binding.btnStartLive.isEnabled = false
        Toast.makeText(requireContext(), "Enable camera and microphone permission to go live", Toast.LENGTH_LONG).show()
    }

    private fun showBeautyPanel() {
        ensureDeepArReady()
        BeautyBottomSheet().show(childFragmentManager, "beauty")
    }

    private fun showStickerPanel() {
        ensureDeepArReady()
        StickerBottomSheet().show(childFragmentManager, "stickers")
    }

    private fun ensureDeepArReady() {
        if (!PermissionHelper.hasCameraPermission(requireContext())) {
            showPermissionBlockedMessage()
            return
        }
        deepARManager.initialize()
    }

    private fun observeState() {
        viewLifecycleOwner.lifecycleScope.launch {
            viewModel.goLiveState.collect { state ->
                when (state) {
                    is GoLiveState.Ready -> {
                        binding.btnStartLive.isEnabled = hasLivePermissions()
                        binding.progressBar.visibility = View.GONE
                    }
                    is GoLiveState.Starting -> {
                        binding.btnStartLive.isEnabled = false
                        binding.progressBar.visibility = View.VISIBLE
                    }
                    is GoLiveState.Live -> {
                        binding.progressBar.visibility = View.GONE
                        binding.liveIndicator.visibility = View.VISIBLE
                        binding.setupSection.visibility = View.GONE
                        binding.liveControlsSection.visibility = View.VISIBLE
                    }
                    is GoLiveState.Error -> {
                        binding.progressBar.visibility = View.GONE
                        binding.btnStartLive.isEnabled = hasLivePermissions()
                        Toast.makeText(requireContext(), state.message, Toast.LENGTH_SHORT).show()
                    }
                }
            }
        }
    }

    override fun onDestroyView() {
        cameraProvider?.unbindAll()
        cameraProvider = null
        deepARManager.release()
        liveKitManager.disconnect()
        super.onDestroyView()
        _binding = null
    }
}

sealed class GoLiveState {
    object Ready : GoLiveState()
    object Starting : GoLiveState()
    data class Live(val streamId: String, val token: String) : GoLiveState()
    data class Error(val message: String) : GoLiveState()
}

@HiltViewModel
class GoLiveViewModel @Inject constructor(
    private val auth: Auth,
    private val functions: Functions,
) : ViewModel() {

    private val _goLiveState = MutableStateFlow<GoLiveState>(GoLiveState.Ready)
    val goLiveState = _goLiveState.asStateFlow()
    private val json = Json { ignoreUnknownKeys = true }

    fun startStream(title: String) {
        viewModelScope.launch {
            _goLiveState.value = GoLiveState.Starting
            try {
                val response = functions.invoke("live-stream/start")
                val result: StartStreamResponse = json.decodeFromString(response.decodeAs())
                _goLiveState.value = GoLiveState.Live(result.stream_id, result.token)
            } catch (e: Exception) {
                _goLiveState.value = GoLiveState.Error(e.message ?: "Failed to start")
            }
        }
    }

    fun endStream() {
        viewModelScope.launch {
            try { functions.invoke("live-stream/end") } catch (_: Exception) {}
            _goLiveState.value = GoLiveState.Ready
        }
    }
}

@Serializable
data class StartStreamResponse(val stream_id: String, val token: String, val room_id: String? = null)
