package com.merilive.app.ui.profile

import android.net.Uri
import android.os.Bundle
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import android.widget.Toast
import androidx.activity.result.contract.ActivityResultContracts
import androidx.fragment.app.Fragment
import androidx.fragment.app.viewModels
import androidx.lifecycle.lifecycleScope
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import androidx.navigation.fragment.findNavController
import coil.load
import coil.transform.CircleCropTransformation
import com.merilive.app.R
import com.merilive.app.databinding.FragmentEditProfileBinding
import dagger.hilt.android.AndroidEntryPoint
import dagger.hilt.android.lifecycle.HiltViewModel
import io.github.jan.supabase.auth.Auth
import io.github.jan.supabase.postgrest.Postgrest
import io.github.jan.supabase.storage.Storage
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import kotlinx.serialization.Serializable
import javax.inject.Inject

@AndroidEntryPoint
class EditProfileFragment : Fragment() {

    private var _binding: FragmentEditProfileBinding? = null
    private val binding get() = _binding!!
    private val viewModel: EditProfileViewModel by viewModels()

    private val pickImage = registerForActivityResult(
        ActivityResultContracts.GetContent()
    ) { uri: Uri? ->
        uri?.let { viewModel.uploadAvatar(requireContext(), it) }
    }

    override fun onCreateView(
        inflater: LayoutInflater, container: ViewGroup?, savedInstanceState: Bundle?
    ): View {
        _binding = FragmentEditProfileBinding.inflate(inflater, container, false)
        return binding.root
    }

    override fun onViewCreated(view: View, savedInstanceState: Bundle?) {
        super.onViewCreated(view, savedInstanceState)

        binding.btnBack.setOnClickListener { findNavController().navigateUp() }

        binding.ivAvatar.setOnClickListener {
            pickImage.launch("image/*")
        }

        binding.btnSave.setOnClickListener {
            viewModel.saveProfile(
                displayName = binding.etDisplayName.text.toString().trim(),
                bio = binding.etBio.text.toString().trim(),
            )
        }

        viewModel.loadCurrentProfile()
        observeState()
    }

    private fun observeState() {
        viewLifecycleOwner.lifecycleScope.launchWhenStarted {
            viewModel.state.collect { state ->
                when (state) {
                    is EditProfileState.Loading -> {
                        binding.progressBar.visibility = View.VISIBLE
                        binding.btnSave.isEnabled = false
                    }
                    is EditProfileState.Loaded -> {
                        binding.progressBar.visibility = View.GONE
                        binding.btnSave.isEnabled = true
                        binding.etDisplayName.setText(state.displayName)
                        binding.etBio.setText(state.bio)
                        binding.ivAvatar.load(state.avatarUrl) {
                            transformations(CircleCropTransformation())
                            placeholder(R.drawable.ic_avatar_placeholder)
                        }
                    }
                    is EditProfileState.Saved -> {
                        Toast.makeText(requireContext(), "Profile updated!", Toast.LENGTH_SHORT).show()
                        findNavController().navigateUp()
                    }
                    is EditProfileState.Error -> {
                        binding.progressBar.visibility = View.GONE
                        binding.btnSave.isEnabled = true
                        Toast.makeText(requireContext(), state.message, Toast.LENGTH_LONG).show()
                    }
                    is EditProfileState.AvatarUploaded -> {
                        binding.ivAvatar.load(state.url) {
                            transformations(CircleCropTransformation())
                        }
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

sealed class EditProfileState {
    object Loading : EditProfileState()
    data class Loaded(val displayName: String?, val bio: String?, val avatarUrl: String?) : EditProfileState()
    data class AvatarUploaded(val url: String) : EditProfileState()
    object Saved : EditProfileState()
    data class Error(val message: String) : EditProfileState()
}

@HiltViewModel
class EditProfileViewModel @Inject constructor(
    private val auth: Auth,
    private val postgrest: Postgrest,
    private val storage: Storage,
) : ViewModel() {

    private val _state = MutableStateFlow<EditProfileState>(EditProfileState.Loading)
    val state = _state.asStateFlow()

    private var currentAvatarUrl: String? = null

    fun loadCurrentProfile() {
        viewModelScope.launch {
            try {
                val userId = auth.currentSessionOrNull()?.user?.id ?: return@launch
                val profile = postgrest.from("profiles")
                    .select {
                        filter { eq("id", userId) }
                    }
                    .decodeSingle<EditProfileResponse>()
                currentAvatarUrl = profile.avatar_url
                _state.value = EditProfileState.Loaded(
                    displayName = profile.display_name,
                    bio = profile.bio,
                    avatarUrl = profile.avatar_url
                )
            } catch (e: Exception) {
                _state.value = EditProfileState.Error(e.message ?: "Failed to load")
            }
        }
    }

    fun uploadAvatar(context: android.content.Context, uri: Uri) {
        viewModelScope.launch {
            try {
                _state.value = EditProfileState.Loading
                val userId = auth.currentSessionOrNull()?.user?.id ?: return@launch
                val inputStream = context.contentResolver.openInputStream(uri) ?: return@launch
                val bytes = inputStream.readBytes()
                inputStream.close()

                val fileName = "$userId/${System.currentTimeMillis()}.jpg"
                val bucket = storage.from("avatars")
                bucket.upload(fileName, bytes, upsert = true)
                val publicUrl = bucket.publicUrl(fileName)

                // Update profile
                postgrest.from("profiles")
                    .update(mapOf("avatar_url" to publicUrl)) {
                        filter { eq("id", userId) }
                    }

                currentAvatarUrl = publicUrl
                _state.value = EditProfileState.AvatarUploaded(publicUrl)
            } catch (e: Exception) {
                _state.value = EditProfileState.Error(e.message ?: "Upload failed")
            }
        }
    }

    fun saveProfile(displayName: String, bio: String) {
        viewModelScope.launch {
            try {
                _state.value = EditProfileState.Loading
                val userId = auth.currentSessionOrNull()?.user?.id ?: return@launch
                postgrest.from("profiles")
                    .update(mapOf(
                        "display_name" to displayName,
                        "bio" to bio,
                    )) {
                        filter { eq("id", userId) }
                    }
                _state.value = EditProfileState.Saved
            } catch (e: Exception) {
                _state.value = EditProfileState.Error(e.message ?: "Save failed")
            }
        }
    }
}

@Serializable
data class EditProfileResponse(
    val display_name: String? = null,
    val bio: String? = null,
    val avatar_url: String? = null,
)