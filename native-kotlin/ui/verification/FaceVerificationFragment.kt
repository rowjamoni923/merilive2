package com.merilive.app.ui.verification

import android.Manifest
import android.content.pm.PackageManager
import android.graphics.Bitmap
import android.os.Bundle
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import android.widget.Toast
import androidx.activity.result.contract.ActivityResultContracts
import androidx.camera.core.CameraSelector
import androidx.camera.core.ImageCapture
import androidx.camera.core.ImageCaptureException
import androidx.camera.core.ImageProxy
import androidx.camera.core.Preview
import androidx.camera.lifecycle.ProcessCameraProvider
import androidx.core.content.ContextCompat
import androidx.fragment.app.Fragment
import androidx.fragment.app.viewModels
import androidx.lifecycle.ViewModel
import androidx.lifecycle.lifecycleScope
import androidx.lifecycle.viewModelScope
import androidx.navigation.fragment.findNavController
import com.merilive.app.databinding.FragmentFaceVerificationBinding
import dagger.hilt.android.AndroidEntryPoint
import dagger.hilt.android.lifecycle.HiltViewModel
import io.github.jan.supabase.auth.Auth
import io.github.jan.supabase.functions.Functions
import io.github.jan.supabase.storage.Storage
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import java.io.ByteArrayOutputStream
import javax.inject.Inject

@AndroidEntryPoint
class FaceVerificationFragment : Fragment() {

    private var _binding: FragmentFaceVerificationBinding? = null
    private val binding get() = _binding!!
    private val viewModel: FaceVerificationViewModel by viewModels()

    private var imageCapture: ImageCapture? = null

    private val cameraPermission = registerForActivityResult(
        ActivityResultContracts.RequestPermission()
    ) { granted ->
        if (granted) startCamera()
        else Toast.makeText(requireContext(), "Camera permission required", Toast.LENGTH_SHORT).show()
    }

    override fun onCreateView(inflater: LayoutInflater, container: ViewGroup?, savedInstanceState: Bundle?): View {
        _binding = FragmentFaceVerificationBinding.inflate(inflater, container, false)
        return binding.root
    }

    override fun onViewCreated(view: View, savedInstanceState: Bundle?) {
        super.onViewCreated(view, savedInstanceState)

        binding.btnBack.setOnClickListener { findNavController().navigateUp() }
        binding.btnCapture.setOnClickListener { captureAndVerify() }

        // Check camera permission
        if (ContextCompat.checkSelfPermission(requireContext(), Manifest.permission.CAMERA)
            == PackageManager.PERMISSION_GRANTED) {
            startCamera()
        } else {
            cameraPermission.launch(Manifest.permission.CAMERA)
        }

        observeState()
    }

    private fun startCamera() {
        val cameraProviderFuture = ProcessCameraProvider.getInstance(requireContext())
        cameraProviderFuture.addListener({
            try {
                val cameraProvider = cameraProviderFuture.get()
                val preview = Preview.Builder().build().also {
                    it.surfaceProvider = binding.cameraPreview.surfaceProvider
                }

                imageCapture = ImageCapture.Builder()
                    .setCaptureMode(ImageCapture.CAPTURE_MODE_MINIMIZE_LATENCY)
                    .build()

                val cameraSelector = CameraSelector.Builder()
                    .requireLensFacing(CameraSelector.LENS_FACING_FRONT)
                    .build()

                cameraProvider.unbindAll()
                cameraProvider.bindToLifecycle(viewLifecycleOwner, cameraSelector, preview, imageCapture)

                binding.tvInstructions.text = "Position your face in the circle\nand tap Capture"
            } catch (e: Exception) {
                binding.tvInstructions.text = "Camera initialization failed"
            }
        }, ContextCompat.getMainExecutor(requireContext()))
    }

    private fun captureAndVerify() {
        val capture = imageCapture ?: run {
            Toast.makeText(requireContext(), "Camera not ready", Toast.LENGTH_SHORT).show()
            return
        }

        binding.progressBar.visibility = View.VISIBLE
        binding.btnCapture.isEnabled = false
        binding.tvInstructions.text = "Capturing..."

        capture.takePicture(
            ContextCompat.getMainExecutor(requireContext()),
            object : ImageCapture.OnImageCapturedCallback() {
                override fun onCaptureSuccess(image: ImageProxy) {
                    val bitmap = image.toBitmap()
                    image.close()

                    // Convert to JPEG bytes
                    val baos = ByteArrayOutputStream()
                    bitmap.compress(Bitmap.CompressFormat.JPEG, 85, baos)
                    val bytes = baos.toByteArray()

                    binding.tvInstructions.text = "Uploading & verifying..."
                    viewModel.uploadAndVerify(bytes)
                }

                override fun onError(exception: ImageCaptureException) {
                    binding.progressBar.visibility = View.GONE
                    binding.btnCapture.isEnabled = true
                    binding.tvInstructions.text = "Capture failed. Try again."
                    Toast.makeText(requireContext(), "Capture failed: ${exception.message}", Toast.LENGTH_SHORT).show()
                }
            }
        )
    }

    private fun observeState() {
        viewLifecycleOwner.lifecycleScope.launchWhenStarted {
            viewModel.verificationState.collect { state ->
                when (state) {
                    is VerificationState.Idle -> {}
                    is VerificationState.Uploading -> {
                        binding.progressBar.visibility = View.VISIBLE
                        binding.btnCapture.isEnabled = false
                        binding.tvInstructions.text = "Uploading..."
                    }
                    is VerificationState.Verifying -> {
                        binding.tvInstructions.text = "Verifying face..."
                    }
                    is VerificationState.Success -> {
                        binding.progressBar.visibility = View.GONE
                        Toast.makeText(requireContext(), "✅ Verification successful!", Toast.LENGTH_LONG).show()
                        findNavController().navigateUp()
                    }
                    is VerificationState.Failed -> {
                        binding.progressBar.visibility = View.GONE
                        binding.btnCapture.isEnabled = true
                        binding.tvInstructions.text = state.reason
                        Toast.makeText(requireContext(), state.reason, Toast.LENGTH_LONG).show()
                    }
                }
            }
        }
    }

    override fun onDestroyView() {
        super.onDestroyView()
        _binding = null
    }
}

sealed class VerificationState {
    object Idle : VerificationState()
    object Uploading : VerificationState()
    object Verifying : VerificationState()
    object Success : VerificationState()
    data class Failed(val reason: String) : VerificationState()
}

@HiltViewModel
class FaceVerificationViewModel @Inject constructor(
    private val auth: Auth,
    private val storage: Storage,
    private val functions: Functions,
) : ViewModel() {

    private val _verificationState = MutableStateFlow<VerificationState>(VerificationState.Idle)
    val verificationState = _verificationState.asStateFlow()

    fun uploadAndVerify(imageBytes: ByteArray) {
        viewModelScope.launch {
            try {
                val userId = auth.currentSessionOrNull()?.user?.id
                    ?: throw Exception("Not authenticated")

                // Step 1: Upload to storage
                _verificationState.value = VerificationState.Uploading
                val path = "face-verification/$userId/${System.currentTimeMillis()}.jpg"
                storage.from("verification").upload(path, imageBytes, upsert = true)
                val publicUrl = storage.from("verification").publicUrl(path)

                // Step 2: Call edge function for verification
                _verificationState.value = VerificationState.Verifying
                val response = functions.invoke("face-verification") {
                    body = kotlinx.serialization.json.buildJsonObject {
                        put("user_id", kotlinx.serialization.json.JsonPrimitive(userId))
                        put("image_url", kotlinx.serialization.json.JsonPrimitive(publicUrl))
                    }
                }

                val responseBody = response.body?.let { String(it) } ?: ""
                if (response.status.value in 200..299) {
                    _verificationState.value = VerificationState.Success
                } else {
                    _verificationState.value = VerificationState.Failed(
                        "Verification failed. Please try again with better lighting."
                    )
                }
            } catch (e: Exception) {
                _verificationState.value = VerificationState.Failed(
                    e.message ?: "Verification failed. Please retry."
                )
            }
        }
    }
}
