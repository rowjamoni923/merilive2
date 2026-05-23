package com.merilive.app.plugin

import androidx.credentials.ClearCredentialStateRequest
import androidx.credentials.CredentialManager
import androidx.credentials.CustomCredential
import androidx.credentials.GetCredentialRequest
import androidx.credentials.exceptions.GetCredentialException
import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin
import com.google.android.libraries.identity.googleid.GetGoogleIdOption
import com.google.android.libraries.identity.googleid.GetSignInWithGoogleOption
import com.google.android.libraries.identity.googleid.GoogleIdTokenCredential
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

/**
 * Pkg251 — Credential Manager (modern Google Sign-In).
 *
 * Replaces deprecated GoogleSignIn / OneTap with the unified
 * androidx.credentials API. JS calls `signInWithGoogle({ serverClientId })`
 * to get a Google ID token, then exchanges it via
 *   supabase.auth.signInWithIdToken({ provider: 'google', token: idToken })
 *
 * - `autoSelect=false` first call (user must pick an account explicitly)
 * - Falls back from "authorized accounts only" → all accounts on
 *   NoCredentialException so first-time users still see the picker.
 * - signOut() clears the credential state so the next call shows the
 *   account picker again.
 *
 * Passkey support is request-shaped already (CredentialManager). When the
 * app adopts WebAuthn we can add GetPublicKeyCredentialOption to the same
 * request — same plugin surface.
 */
@CapacitorPlugin(name = "CredentialManager")
class CredentialManagerPlugin : Plugin() {

    @PluginMethod
    fun signInWithGoogle(call: PluginCall) {
        val serverClientId = call.getString("serverClientId")
        if (serverClientId.isNullOrBlank()) {
            call.reject("serverClientId required (OAuth Web Client ID)")
            return
        }
        val nonce = call.getString("nonce")
        val filterByAuthorized = call.getBoolean("filterByAuthorized", true) ?: true

        val activity = activity ?: run {
            call.reject("no activity")
            return
        }
        val cm = CredentialManager.create(activity)

        CoroutineScope(Dispatchers.Main).launch {
            val first = buildGoogleIdOption(serverClientId, nonce, filterByAuthorized)
            val res = tryGet(cm, activity, first)
                ?: if (filterByAuthorized) tryGet(cm, activity, buildGoogleIdOption(serverClientId, nonce, false)) else null

            if (res == null) {
                call.reject("USER_CANCELLED_OR_NO_CREDENTIAL")
                return@launch
            }

            try {
                val cred = res.credential
                if (cred is CustomCredential &&
                    cred.type == GoogleIdTokenCredential.TYPE_GOOGLE_ID_TOKEN_CREDENTIAL) {
                    val gid = GoogleIdTokenCredential.createFrom(cred.data)
                    val ret = JSObject().apply {
                        put("idToken", gid.idToken)
                        put("id", gid.id)
                        put("displayName", gid.displayName)
                        put("givenName", gid.givenName)
                        put("familyName", gid.familyName)
                        put("profilePictureUri", gid.profilePictureUri?.toString())
                    }
                    call.resolve(ret)
                } else {
                    call.reject("Unsupported credential type: ${cred.type}")
                }
            } catch (t: Throwable) {
                call.reject(t.message ?: "parse failed", t)
            }
        }
    }

    @PluginMethod
    fun signInWithGoogleButton(call: PluginCall) {
        // Branded "Sign in with Google" button flow — always shows picker.
        val serverClientId = call.getString("serverClientId")
        if (serverClientId.isNullOrBlank()) { call.reject("serverClientId required"); return }
        val nonce = call.getString("nonce")
        val activity = activity ?: run { call.reject("no activity"); return }
        val cm = CredentialManager.create(activity)

        val option = GetSignInWithGoogleOption.Builder(serverClientId).apply {
            if (!nonce.isNullOrBlank()) setNonce(nonce)
        }.build()
        val req = GetCredentialRequest.Builder().addCredentialOption(option).build()

        CoroutineScope(Dispatchers.Main).launch {
            try {
                val res = withContext(Dispatchers.IO) { cm.getCredential(activity, req) }
                val cred = res.credential
                if (cred is CustomCredential &&
                    cred.type == GoogleIdTokenCredential.TYPE_GOOGLE_ID_TOKEN_CREDENTIAL) {
                    val gid = GoogleIdTokenCredential.createFrom(cred.data)
                    val ret = JSObject().apply {
                        put("idToken", gid.idToken)
                        put("id", gid.id)
                        put("displayName", gid.displayName)
                        put("profilePictureUri", gid.profilePictureUri?.toString())
                    }
                    call.resolve(ret)
                } else call.reject("Unsupported credential type")
            } catch (e: GetCredentialException) {
                call.reject(e.type ?: e.message ?: "credential error", e)
            } catch (t: Throwable) {
                call.reject(t.message ?: "failed", t)
            }
        }
    }

    @PluginMethod
    fun signOut(call: PluginCall) {
        val activity = activity ?: run { call.resolve(); return }
        val cm = CredentialManager.create(activity)
        CoroutineScope(Dispatchers.Main).launch {
            try {
                withContext(Dispatchers.IO) {
                    cm.clearCredentialState(ClearCredentialStateRequest())
                }
                call.resolve()
            } catch (t: Throwable) { call.resolve() } // non-fatal
        }
    }

    private fun buildGoogleIdOption(
        serverClientId: String,
        nonce: String?,
        filterByAuthorized: Boolean
    ): GetCredentialRequest {
        val option = GetGoogleIdOption.Builder()
            .setServerClientId(serverClientId)
            .setFilterByAuthorizedAccounts(filterByAuthorized)
            .setAutoSelectEnabled(filterByAuthorized) // only auto-select returning users
            .apply { if (!nonce.isNullOrBlank()) setNonce(nonce) }
            .build()
        return GetCredentialRequest.Builder().addCredentialOption(option).build()
    }

    private suspend fun tryGet(
        cm: CredentialManager,
        activity: android.app.Activity,
        req: GetCredentialRequest
    ): androidx.credentials.GetCredentialResponse? {
        return try {
            withContext(Dispatchers.IO) { cm.getCredential(activity, req) }
        } catch (e: GetCredentialException) { null }
        catch (t: Throwable) { null }
    }
}
