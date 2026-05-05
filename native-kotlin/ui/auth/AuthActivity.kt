package com.merilive.app.ui.auth

import android.content.Intent
import android.os.Bundle
import android.util.Log
import android.view.View
import android.widget.Toast
import androidx.appcompat.app.AppCompatActivity
import androidx.lifecycle.lifecycleScope
import coil.load
import com.merilive.app.MainActivity
import com.merilive.app.databinding.ActivityAuthBinding
import com.merilive.app.util.SecureStorage
import dagger.hilt.android.AndroidEntryPoint
import io.github.jan.supabase.auth.Auth
import io.github.jan.supabase.auth.providers.builtin.Email
import io.github.jan.supabase.functions.Functions
import io.github.jan.supabase.postgrest.Postgrest
import kotlinx.coroutines.launch
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.decodeFromJsonElement
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import kotlinx.serialization.json.put
import java.security.MessageDigest
import javax.inject.Inject

@AndroidEntryPoint
class AuthActivity : AppCompatActivity() {

    @Inject lateinit var auth: Auth
    @Inject lateinit var functions: Functions
    @Inject lateinit var postgrest: Postgrest

    private lateinit var binding: ActivityAuthBinding
    private val json = Json { ignoreUnknownKeys = true }
    private var pendingMethod: String = ""
    private var pendingIdentifier: String = ""
    private var isPasswordMode: Boolean = false

    companion object {
        private const val TAG = "AuthActivity"
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        binding = ActivityAuthBinding.inflate(layoutInflater)
        setContentView(binding.root)

        // Check existing session
        lifecycleScope.launch {
            val session = auth.currentSessionOrNull()
            if (session != null) {
                navigateToMain()
                return@launch
            }
        }

        loadBranding()
        setupClickListeners()
    }

    private fun loadBranding() {
        lifecycleScope.launch {
            try {
                val result = postgrest.from("branding_settings").select {
                    filter { eq("setting_key", "default") }
                    limit(1)
                }
                val items = result.decodeAs<List<BrandingSettingsRow>>()
                val branding = items.firstOrNull()?.setting_value?.let {
                    json.decodeFromJsonElement<BrandingData>(it)
                }

                if (branding != null) {
                    // Load background image
                    val bgUrl = branding.background_url
                    if (!bgUrl.isNullOrBlank()) {
                        binding.ivBackground.load(bgUrl) {
                            crossfade(true)
                            crossfade(500)
                        }
                    }

                    // Load logo image if available
                    val logoUrl = branding.logo_image_url
                    if (!logoUrl.isNullOrBlank()) {
                        binding.ivLogo.visibility = View.VISIBLE
                        binding.tvAppName.visibility = View.GONE
                        binding.ivLogo.load(logoUrl) {
                            crossfade(true)
                            crossfade(300)
                        }
                    } else {
                        // Show app name text when no logo image
                        binding.ivLogo.visibility = View.GONE
                        binding.tvAppName.visibility = View.VISIBLE

                        // Use logo_text_primary if available
                        val logoText = branding.logo_text_primary
                        if (!logoText.isNullOrBlank()) {
                            binding.tvAppName.text = logoText
                        }
                    }

                    // Show tagline if available
                    val tagline = branding.tagline
                    if (!tagline.isNullOrBlank()) {
                        binding.tvTagline.text = tagline
                        binding.tvTagline.visibility = View.VISIBLE
                    }
                }
            } catch (e: Exception) {
                Log.e(TAG, "Failed to load branding", e)
                // Use default: show app name text
                binding.ivLogo.visibility = View.GONE
                binding.tvAppName.visibility = View.VISIBLE
            }
        }
    }

    private fun setupClickListeners() {
        binding.btnGuestLogin.setOnClickListener { loginAsGuest() }
        binding.btnWhatsAppLogin.setOnClickListener { showPhoneInput("whatsapp") }
        binding.btnEmailLogin.setOnClickListener { showEmailInput() }

        binding.btnSendOtp.setOnClickListener {
            val identifier = binding.etIdentifier.text.toString().trim()
            if (identifier.isEmpty()) {
                binding.etIdentifier.error = when (pendingMethod) {
                    "whatsapp" -> "Enter WhatsApp number"
                    else -> "Enter email"
                }
                return@setOnClickListener
            }
            pendingIdentifier = identifier

            if (pendingMethod == "email" && isPasswordMode) {
                val password = binding.etPassword.text.toString().trim()
                if (password.length < 6) {
                    binding.etPassword.error = "Password must be at least 6 characters"
                    return@setOnClickListener
                }
                loginWithEmailPassword(identifier, password)
            } else {
                sendOtp(identifier, pendingMethod)
            }
        }

        binding.btnVerifyOtp.setOnClickListener {
            val otp = binding.etOtp.text.toString().trim()
            if (otp.length != 6) {
                binding.etOtp.error = "Enter 6-digit OTP"
                return@setOnClickListener
            }
            verifyOtp(pendingIdentifier, otp, pendingMethod)
        }

        binding.btnMale.setOnClickListener { selectGender("male") }
        binding.btnFemale.setOnClickListener { selectGender("female") }

        binding.tvBackToMethods.setOnClickListener {
            binding.identifierSection.visibility = View.GONE
            binding.authMethodSection.visibility = View.VISIBLE
            resetEmailMode()
        }

        binding.tvToggleEmailMode.setOnClickListener {
            toggleEmailMode()
        }

        binding.tvReferralCode.setOnClickListener {
            Toast.makeText(this, "Referral code feature coming soon", Toast.LENGTH_SHORT).show()
        }
    }

    private fun showPhoneInput(method: String) {
        pendingMethod = method
        isPasswordMode = false
        binding.authMethodSection.visibility = View.GONE
        binding.identifierSection.visibility = View.VISIBLE
        binding.etIdentifier.hint = "Enter WhatsApp number (+880...)"
        binding.etIdentifier.inputType = android.text.InputType.TYPE_CLASS_PHONE
        binding.tvInputTitle.text = "WhatsApp Login"
        binding.etPassword.visibility = View.GONE
        binding.tvToggleEmailMode.visibility = View.GONE
        binding.btnSendOtp.text = "Send OTP"
    }

    private fun showEmailInput() {
        pendingMethod = "email"
        isPasswordMode = false
        binding.authMethodSection.visibility = View.GONE
        binding.identifierSection.visibility = View.VISIBLE
        binding.etIdentifier.hint = "Enter email address"
        binding.etIdentifier.inputType = android.text.InputType.TYPE_TEXT_VARIATION_EMAIL_ADDRESS
        binding.tvInputTitle.text = "Email Login"
        binding.etPassword.visibility = View.GONE
        binding.tvToggleEmailMode.visibility = View.VISIBLE
        binding.tvToggleEmailMode.text = "Use Password instead"
        binding.btnSendOtp.text = "Send OTP"
    }

    private fun toggleEmailMode() {
        isPasswordMode = !isPasswordMode
        if (isPasswordMode) {
            binding.etPassword.visibility = View.VISIBLE
            binding.tvToggleEmailMode.text = "Use OTP instead"
            binding.btnSendOtp.text = "Sign In"
        } else {
            binding.etPassword.visibility = View.GONE
            binding.tvToggleEmailMode.text = "Use Password instead"
            binding.btnSendOtp.text = "Send OTP"
            binding.etPassword.text?.clear()
        }
    }

    private fun resetEmailMode() {
        isPasswordMode = false
        binding.etPassword.visibility = View.GONE
        binding.etPassword.text?.clear()
        binding.tvToggleEmailMode.visibility = View.GONE
    }

    private fun loginWithEmailPassword(email: String, password: String) {
        binding.progressBar.visibility = View.VISIBLE
        lifecycleScope.launch {
            try {
                // Try sign in first
                try {
                    auth.signInWith(Email) {
                        this.email = email
                        this.password = password
                    }
                    showGenderSelection()
                    return@launch
                } catch (signInError: Exception) {
                    Log.d(TAG, "Sign in failed, trying sign up: ${signInError.message}")
                }

                // If sign in fails, try sign up then sign in
                auth.signUpWith(Email) {
                    this.email = email
                    this.password = password
                }
                auth.signInWith(Email) {
                    this.email = email
                    this.password = password
                }
                showGenderSelection()
            } catch (e: Exception) {
                binding.progressBar.visibility = View.GONE
                Log.e(TAG, "Email/password login failed", e)
                Toast.makeText(
                    this@AuthActivity,
                    "Login failed: ${e.message}",
                    Toast.LENGTH_SHORT
                ).show()
            }
        }
    }

    private fun loginAsGuest() {
        binding.progressBar.visibility = View.VISIBLE
        binding.btnGuestLogin.isEnabled = false
        lifecycleScope.launch {
            try {
                val deviceId = SecureStorage.getOrCreateDeviceId(this@AuthActivity)
                val guestHash = MessageDigest.getInstance("SHA-256")
                    .digest(deviceId.toByteArray())
                    .joinToString("") { "%02x".format(it) }

                val guestEmail = "guest_${guestHash.take(16)}@merilive.guest"
                val guestPassword = guestHash.take(32)

                Log.d(TAG, "Attempting guest login with email: $guestEmail")

                // Try sign in first
                var signedIn = false
                try {
                    auth.signInWith(Email) {
                        this.email = guestEmail
                        this.password = guestPassword
                    }
                    signedIn = true
                    Log.d(TAG, "Guest sign-in successful")
                } catch (signInError: Exception) {
                    Log.d(TAG, "Guest sign-in failed: ${signInError.message}, trying sign-up")
                }

                // If sign in fails, sign up then sign in
                if (!signedIn) {
                    try {
                        auth.signUpWith(Email) {
                            this.email = guestEmail
                            this.password = guestPassword
                        }
                        Log.d(TAG, "Guest sign-up successful, now signing in")
                    } catch (signUpError: Exception) {
                        Log.e(TAG, "Guest sign-up failed: ${signUpError.message}")
                        // If signup also fails (maybe already exists but wrong pw), show error
                        throw signUpError
                    }

                    auth.signInWith(Email) {
                        this.email = guestEmail
                        this.password = guestPassword
                    }
                    Log.d(TAG, "Guest sign-in after sign-up successful")
                }

                showGenderSelection()
            } catch (e: Exception) {
                binding.progressBar.visibility = View.GONE
                binding.btnGuestLogin.isEnabled = true
                Log.e(TAG, "Guest login failed", e)
                Toast.makeText(
                    this@AuthActivity,
                    "Login failed: ${e.message}",
                    Toast.LENGTH_LONG
                ).show()
            }
        }
    }

    private fun sendOtp(identifier: String, method: String) {
        binding.progressBar.visibility = View.VISIBLE
        lifecycleScope.launch {
            try {
                val endpoint = if (method == "whatsapp") "send-whatsapp-otp" else "verify-email-otp"
                val payload = buildJsonObject {
                    if (method == "whatsapp") {
                        put("phone", identifier)
                    } else {
                        put("email", identifier)
                    }
                    put("action", "send")
                }
                functions.invoke(endpoint, body = payload)
                binding.progressBar.visibility = View.GONE
                binding.identifierSection.visibility = View.GONE
                binding.otpSection.visibility = View.VISIBLE
                Toast.makeText(this@AuthActivity, "OTP sent!", Toast.LENGTH_SHORT).show()
            } catch (e: Exception) {
                binding.progressBar.visibility = View.GONE
                Log.e(TAG, "Send OTP failed", e)
                Toast.makeText(this@AuthActivity, "Error: ${e.message}", Toast.LENGTH_SHORT).show()
            }
        }
    }

    private fun verifyOtp(identifier: String, otp: String, method: String) {
        binding.progressBar.visibility = View.VISIBLE
        lifecycleScope.launch {
            try {
                val endpoint = if (method == "whatsapp") "otp-direct-signin" else "verify-email-otp"
                val payload = buildJsonObject {
                    if (method == "whatsapp") {
                        put("phone", identifier)
                        put("otp", otp)
                    } else {
                        put("email", identifier)
                        put("otp", otp)
                    }
                }
                val response = functions.invoke(endpoint, body = payload)
                val result: OtpVerifyResponse = json.decodeFromString(response.decodeAs())

                if (result.access_token != null) {
                    auth.importAuthToken(result.access_token)
                    showGenderSelection()
                } else {
                    binding.progressBar.visibility = View.GONE
                    Toast.makeText(this@AuthActivity, "Invalid OTP", Toast.LENGTH_SHORT).show()
                }
            } catch (e: Exception) {
                binding.progressBar.visibility = View.GONE
                Log.e(TAG, "Verify OTP failed", e)
                Toast.makeText(this@AuthActivity, "Verification failed: ${e.message}", Toast.LENGTH_SHORT).show()
            }
        }
    }

    private fun showGenderSelection() {
        binding.progressBar.visibility = View.GONE
        binding.btnGuestLogin.isEnabled = true
        binding.authMethodSection.visibility = View.GONE
        binding.identifierSection.visibility = View.GONE
        binding.otpSection.visibility = View.GONE
        binding.genderSection.visibility = View.VISIBLE
    }

    private fun selectGender(gender: String) {
        binding.btnMale.alpha = if (gender == "male") 1f else 0.5f
        binding.btnFemale.alpha = if (gender == "female") 1f else 0.5f

        binding.progressBar.visibility = View.VISIBLE
        lifecycleScope.launch {
            try {
                val role = if (gender == "female") "host" else "user"
                val payload = buildJsonObject {
                    put("gender", gender)
                    put("role", role)
                }
                functions.invoke("update-profile", body = payload)
                navigateToMain()
            } catch (e: Exception) {
                binding.progressBar.visibility = View.GONE
                Log.e(TAG, "Update gender failed", e)
                navigateToMain()
            }
        }
    }

    private fun navigateToMain() {
        startActivity(Intent(this, MainActivity::class.java))
        finish()
    }

    @Deprecated("Use onBackPressedDispatcher")
    override fun onBackPressed() {
        when {
            binding.genderSection.visibility == View.VISIBLE -> { }
            binding.otpSection.visibility == View.VISIBLE -> {
                binding.otpSection.visibility = View.GONE
                binding.identifierSection.visibility = View.VISIBLE
            }
            binding.identifierSection.visibility == View.VISIBLE -> {
                binding.identifierSection.visibility = View.GONE
                binding.authMethodSection.visibility = View.VISIBLE
                resetEmailMode()
            }
            else -> super.onBackPressed()
        }
    }
}

@Serializable
data class OtpVerifyResponse(
    val access_token: String? = null,
    val refresh_token: String? = null,
    val user_id: String? = null,
    val error: String? = null,
)

@Serializable
data class BrandingSettingsRow(
    val id: String? = null,
    val setting_key: String? = null,
    val setting_value: JsonElement? = null,
)

@Serializable
data class BrandingData(
    val logo_text_primary: String? = null,
    val logo_text_secondary: String? = null,
    val tagline: String? = null,
    val logo_image_url: String? = null,
    val background_type: String? = null,
    val background_url: String? = null,
)
