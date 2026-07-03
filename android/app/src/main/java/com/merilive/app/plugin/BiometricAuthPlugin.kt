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

    // Pkg-audit fix: track in-flight prompt so a second authenticate() can
    // cancel the first instead of orphaning its PluginCall forever.
    @Volatile private var activePrompt: BiometricPrompt? = null
    @Volatile private var activeCall: PluginCall? = null

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

        // Cancel any in-flight prompt and reject its (now-orphaned) call so the
        // JS promise doesn't hang forever.
        try { activePrompt?.cancelAuthentication() } catch (_: Throwable) {}
        activeCall?.let { prev ->
            try { prev.reject("cancelled_by_new_request") } catch (_: Throwable) {}
        }
        activePrompt = null
        activeCall = call

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
                if (activeCall === call) { activeCall = null; activePrompt = null }
            }

            override fun onAuthenticationError(errorCode: Int, errString: CharSequence) {
                val ret = JSObject()
                ret.put("success", false)
                ret.put("code", errorCode)
                ret.put("message", errString.toString())
                call.resolve(ret)
                if (activeCall === call) { activeCall = null; activePrompt = null }
            }

            override fun onAuthenticationFailed() {
                // Single attempt failed; biometric prompt stays open. Don't resolve yet.
            }
        }

        activity.runOnUiThread {
            // Re-check inside the UI lambda: activity may have been destroyed
            // between the outer null-check and this lambda executing.
            if (activity.isDestroyed || activity.isFinishing) {
                call.reject("activity_unavailable")
                if (activeCall === call) { activeCall = null; activePrompt = null }
                return@runOnUiThread
            }
            try {
                val prompt = BiometricPrompt(activity, executor, callback)
                activePrompt = prompt
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
                if (activeCall === call) { activeCall = null; activePrompt = null }
            }
        }
    }

    override fun handleOnDestroy() {
        try { activePrompt?.cancelAuthentication() } catch (_: Throwable) {}
        activeCall?.let { try { it.reject("activity_destroyed") } catch (_: Throwable) {} }
        activePrompt = null
        activeCall = null
        super.handleOnDestroy()
    }
}
