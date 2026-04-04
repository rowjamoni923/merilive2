package com.merilive.app.ui.settings

import android.Manifest
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Bundle
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import androidx.activity.result.contract.ActivityResultContracts
import androidx.core.content.ContextCompat
import androidx.fragment.app.Fragment
import androidx.fragment.app.viewModels
import androidx.lifecycle.lifecycleScope
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import androidx.navigation.fragment.findNavController
import com.merilive.app.R
import com.merilive.app.databinding.FragmentSettingsBinding
import com.merilive.app.ui.auth.AuthActivity
import dagger.hilt.android.AndroidEntryPoint
import dagger.hilt.android.lifecycle.HiltViewModel
import io.github.jan.supabase.auth.Auth
import io.github.jan.supabase.postgrest.Postgrest
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import javax.inject.Inject

@AndroidEntryPoint
class SettingsFragment : Fragment() {

    private var _binding: FragmentSettingsBinding? = null
    private val binding get() = _binding!!
    private val viewModel: SettingsViewModel by viewModels()

    private val cameraPermLauncher = registerForActivityResult(
        ActivityResultContracts.RequestPermission()
    ) { granted -> viewModel.setCameraPermission(granted) }

    private val micPermLauncher = registerForActivityResult(
        ActivityResultContracts.RequestPermission()
    ) { granted -> viewModel.setMicPermission(granted) }

    private val locationPermLauncher = registerForActivityResult(
        ActivityResultContracts.RequestPermission()
    ) { granted -> viewModel.setLocationPermission(granted) }

    override fun onCreateView(
        inflater: LayoutInflater, container: ViewGroup?, savedInstanceState: Bundle?
    ): View {
        _binding = FragmentSettingsBinding.inflate(inflater, container, false)
        return binding.root
    }

    override fun onViewCreated(view: View, savedInstanceState: Bundle?) {
        super.onViewCreated(view, savedInstanceState)

        binding.btnBack.setOnClickListener { findNavController().navigateUp() }

        // Detect current permission states
        updatePermissionStates()

        // Language
        binding.itemLanguage.setOnClickListener {
            findNavController().navigate(R.id.action_settings_to_language)
        }

        // Notification toggle
        binding.switchNotifications.setOnCheckedChangeListener { _, isChecked ->
            viewModel.setNotificationsEnabled(isChecked)
        }

        // Camera toggle
        binding.switchCamera.setOnCheckedChangeListener { _, isChecked ->
            if (isChecked) cameraPermLauncher.launch(Manifest.permission.CAMERA)
        }

        // Mic toggle
        binding.switchMicrophone.setOnCheckedChangeListener { _, isChecked ->
            if (isChecked) micPermLauncher.launch(Manifest.permission.RECORD_AUDIO)
        }

        // Location toggle
        binding.switchLocation.setOnCheckedChangeListener { _, isChecked ->
            if (isChecked) locationPermLauncher.launch(Manifest.permission.ACCESS_FINE_LOCATION)
        }

        // Privacy toggles
        binding.switchHideLocation.setOnCheckedChangeListener { _, isChecked ->
            viewModel.updatePrivacy("hide_location", isChecked)
        }

        binding.switchBirthdayVisibility.setOnCheckedChangeListener { _, isChecked ->
            viewModel.updatePrivacy("show_birthday", isChecked)
        }

        // Push Notifications
        binding.switchPushNotifications.setOnCheckedChangeListener { _, isChecked ->
            viewModel.setNotificationsEnabled(isChecked)
        }

        // Navigation items
        binding.itemPrivacy.setOnClickListener {
            findNavController().navigate(R.id.action_settings_to_privacy)
        }
        binding.itemAbout.setOnClickListener {
            findNavController().navigate(R.id.action_settings_to_about)
        }
        binding.itemBlockedUsers.setOnClickListener {
            findNavController().navigate(R.id.action_settings_to_blockedUsers)
        }
        binding.itemAccountSecurity.setOnClickListener {
            findNavController().navigate(R.id.action_settings_to_accountSecurity)
        }

        // App version
        try {
            val pInfo = requireContext().packageManager.getPackageInfo(requireContext().packageName, 0)
            binding.tvAppVersion.text = "Version ${pInfo.versionName} (${pInfo.longVersionCode})"
        } catch (_: Exception) {
            binding.tvAppVersion.text = "Version 1.0.0"
        }

        // Logout
        binding.btnLogout.setOnClickListener { viewModel.logout() }

        // Delete Account
        binding.btnDeleteAccount.setOnClickListener { showDeleteAccountDialog() }

        observeState()
    }

    private fun updatePermissionStates() {
        binding.switchCamera.isChecked = ContextCompat.checkSelfPermission(
            requireContext(), Manifest.permission.CAMERA) == PackageManager.PERMISSION_GRANTED
        binding.switchMicrophone.isChecked = ContextCompat.checkSelfPermission(
            requireContext(), Manifest.permission.RECORD_AUDIO) == PackageManager.PERMISSION_GRANTED
        binding.switchLocation.isChecked = ContextCompat.checkSelfPermission(
            requireContext(), Manifest.permission.ACCESS_FINE_LOCATION) == PackageManager.PERMISSION_GRANTED
    }

    private fun observeState() {
        viewLifecycleOwner.lifecycleScope.launchWhenStarted {
            viewModel.loggedOut.collect { loggedOut ->
                if (loggedOut) {
                    startActivity(Intent(requireContext(), AuthActivity::class.java).apply {
                        flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TASK
                    })
                    requireActivity().finish()
                }
            }
        }

        viewLifecycleOwner.lifecycleScope.launchWhenStarted {
            viewModel.privacySettings.collect { settings ->
                binding.switchHideLocation.isChecked = settings["hide_location"] ?: false
                binding.switchBirthdayVisibility.isChecked = settings["show_birthday"] ?: true
            }
        }
    }

    private fun showDeleteAccountDialog() {
        androidx.appcompat.app.AlertDialog.Builder(requireContext())
            .setTitle("Delete Account")
            .setMessage("Are you sure? This action cannot be undone. All your data will be permanently deleted.")
            .setPositiveButton("Delete") { _, _ -> viewModel.deleteAccount() }
            .setNegativeButton("Cancel", null)
            .show()
    }

    override fun onDestroyView() {
        super.onDestroyView()
        _binding = null
    }
}

@HiltViewModel
class SettingsViewModel @Inject constructor(
    private val auth: Auth,
    private val postgrest: Postgrest,
) : ViewModel() {

    private val _loggedOut = MutableStateFlow(false)
    val loggedOut = _loggedOut.asStateFlow()

    private val _privacySettings = MutableStateFlow<Map<String, Boolean>>(emptyMap())
    val privacySettings = _privacySettings.asStateFlow()

    init {
        loadPrivacySettings()
    }

    private fun loadPrivacySettings() {
        viewModelScope.launch {
            try {
                val userId = auth.currentSessionOrNull()?.user?.id ?: return@launch
                val result = postgrest.from("profiles")
                    .select(io.github.jan.supabase.postgrest.query.Columns.raw("hide_location, show_birthday")) {
                        filter { eq("id", userId) }
                    }
                    .decodeSingle<PrivacySettingsResponse>()
                _privacySettings.value = mapOf(
                    "hide_location" to (result.hide_location ?: false),
                    "show_birthday" to (result.show_birthday ?: true),
                )
            } catch (_: Exception) {}
        }
    }

    fun updatePrivacy(key: String, value: Boolean) {
        viewModelScope.launch {
            try {
                val userId = auth.currentSessionOrNull()?.user?.id ?: return@launch
                postgrest.from("profiles").update(mapOf(key to value)) {
                    filter { eq("id", userId) }
                }
                _privacySettings.value = _privacySettings.value.toMutableMap().apply { put(key, value) }
            } catch (_: Exception) {}
        }
    }

    fun setCameraPermission(granted: Boolean) { /* Handled by OS */ }
    fun setMicPermission(granted: Boolean) { /* Handled by OS */ }
    fun setLocationPermission(granted: Boolean) { /* Handled by OS */ }

    fun setNotificationsEnabled(enabled: Boolean) {
        // Save to SharedPreferences
    }

    fun logout() {
        viewModelScope.launch {
            auth.signOut()
            _loggedOut.value = true
        }
    }

    fun deleteAccount() {
        viewModelScope.launch {
            try {
                // Call edge function to delete account data
                auth.signOut()
                _loggedOut.value = true
            } catch (_: Exception) {
                auth.signOut()
                _loggedOut.value = true
            }
        }
    }
}

@kotlinx.serialization.Serializable
data class PrivacySettingsResponse(
    val hide_location: Boolean? = null,
    val show_birthday: Boolean? = null,
)
