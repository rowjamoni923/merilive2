package com.merilive.app.plugin

import androidx.biometric.BiometricManager
import androidx.biometric.BiometricPrompt
import androidx.core.content.ContextCompat
import androidx.fragment.app.FragmentActivity
import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin

/**
 * Pkg210 — Biometric App Lock.
 * Wraps androidx.biometric so JS can:
 *   - isAvailable() → { available, biometricOnly, deviceCredential, reason }
 *   - authenticate({ title, subtitle, reason, allowDeviceCredential })
 * Returns success/error; never leaks raw biometric data.
 */
@CapacitorPlugin(name = "BiometricAuth")
class BiometricAuthPlugin : Plugin() {

    @PluginMethod
    fun isAvailable(call: PluginCall) {
        val ctx = context
        val mgr = BiometricManager.from(ctx)
        val authBiometric = BiometricManager.Authenticators.BIOMETRIC_STRONG or
                BiometricManager.Authenticators.BIOMETRIC_WEAK
        val authCombined = authBiometric or BiometricManager.Authenticators.DEVICE_CREDENTIAL

        val bioStatus = mgr.canAuthenticate(authBiometric)
        val combinedStatus = mgr.canAuthenticate(authCombined)

        val ret = JSObject()
        ret.put("biometricOnly", bioStatus == BiometricManager.BIOMETRIC_SUCCESS)
        ret.put("deviceCredential", combinedStatus == BiometricManager.BIOMETRIC_SUCCESS)
        ret.put("available", combinedStatus == BiometricManager.BIOMETRIC_SUCCESS)
        ret.put("reason", reasonFor(bioStatus))
        call.resolve(ret)
    }

    private fun reasonFor(status: Int): String = when (status) {
        BiometricManager.BIOMETRIC_SUCCESS -> "ok"
        BiometricManager.BIOMETRIC_ERROR_NO_HARDWARE -> "no_hardware"
        BiometricManager.BIOMETRIC_ERROR_HW_UNAVAILABLE -> "hw_unavailable"
        BiometricManager.BIOMETRIC_ERROR_NONE_ENROLLED -> "none_enrolled"
        BiometricManager.BIOMETRIC_ERROR_SECURITY_UPDATE_REQUIRED -> "security_update_required"
        BiometricManager.BIOMETRIC_STATUS_UNKNOWN -> "unknown"
        else -> "unsupported"
    }

    @PluginMethod
    fun authenticate(call: PluginCall) {
        val activity = activity as? FragmentActivity
        if (activity == null) {
            call.reject("activity_unavailable")
            return
        }

        val title = call.getString("title") ?: "Unlock MeriLive"
        val subtitle = call.getString("subtitle") ?: ""
        val reason = call.getString("reason") ?: "Confirm your identity to continue"
        val allowDeviceCredential = call.getBoolean("allowDeviceCredential", true) == true

        val executor = ContextCompat.getMainExecutor(context)
        val callback = object : BiometricPrompt.AuthenticationCallback() {
            override fun onAuthenticationSucceeded(result: BiometricPrompt.AuthenticationResult) {
                val ret = JSObject()
                ret.put("success", true)
                call.resolve(ret)
            }

            override fun onAuthenticationError(errorCode: Int, errString: CharSequence) {
                val ret = JSObject()
                ret.put("success", false)
                ret.put("code", errorCode)
                ret.put("message", errString.toString())
                call.resolve(ret)
            }

            override fun onAuthenticationFailed() {
                // Single attempt failed; biometric prompt stays open. Don't resolve yet.
            }
        }

        activity.runOnUiThread {
            try {
                val prompt = BiometricPrompt(activity, executor, callback)
                val builder = BiometricPrompt.PromptInfo.Builder()
                    .setTitle(title)
                    .setDescription(reason)
                if (subtitle.isNotEmpty()) builder.setSubtitle(subtitle)

                val authenticators = if (allowDeviceCredential) {
                    BiometricManager.Authenticators.BIOMETRIC_WEAK or
                            BiometricManager.Authenticators.DEVICE_CREDENTIAL
                } else {
                    BiometricManager.Authenticators.BIOMETRIC_STRONG or
                            BiometricManager.Authenticators.BIOMETRIC_WEAK
                }

                if (allowDeviceCredential) {
                    builder.setAllowedAuthenticators(authenticators)
                } else {
                    builder.setAllowedAuthenticators(authenticators)
                    builder.setNegativeButtonText("Cancel")
                }

                prompt.authenticate(builder.build())
            } catch (e: Exception) {
                call.reject("prompt_failed", e)
            }
        }
    }
}
