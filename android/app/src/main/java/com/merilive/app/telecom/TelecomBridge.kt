package com.merilive.app.telecom

import android.annotation.SuppressLint
import android.content.ComponentName
import android.content.Context
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.telecom.DisconnectCause
import android.telecom.PhoneAccount
import android.telecom.PhoneAccountHandle
import android.telecom.TelecomManager
import android.util.Log
import androidx.annotation.RequiresApi

/**
 * Pkg208 — Telecom bridge helpers.
 *
 * One-stop static helpers the Capacitor plugin + FCM service call into
 * to register the self-managed PhoneAccount and report calls to the OS.
 *
 * Why static: most callers (FCM service, BroadcastReceiver) don't have
 * access to a Plugin instance — they just need a Context.
 */
object TelecomBridge {
    private const val TAG = "TelecomBridge"

    /** Stable id used for our PhoneAccountHandle.id. */
    const val PHONE_ACCOUNT_ID = "merilive_voip"

    // Bundle extras travelling on the ConnectionRequest.
    const val EXTRA_CALL_ID = "merilive.callId"
    const val EXTRA_CALLER_ID = "merilive.callerId"
    const val EXTRA_CALLER_NAME = "merilive.callerName"
    const val EXTRA_CALL_TYPE = "merilive.callType"

    @Volatile private var registered = false
    private val registrationLock = Any()

    @JvmStatic
    fun isSupported(): Boolean = Build.VERSION.SDK_INT >= Build.VERSION_CODES.O

    @JvmStatic
    fun handle(ctx: Context): PhoneAccountHandle? {
        if (!isSupported()) return null
        return PhoneAccountHandle(
            ComponentName(ctx, MeriConnectionService::class.java),
            PHONE_ACCOUNT_ID,
        )
    }

    /**
     * Idempotent. Registers a SELF_MANAGED PhoneAccount the first time and
     * no-ops on subsequent calls. Honest-private-call fix (C-2): wrapped in
     * a synchronized block so two threads (app boot + FCM handler arriving
     * in the same ms) cannot both fall through the `registered == false`
     * check and double-register.
     */
    @SuppressLint("MissingPermission")
    @JvmStatic
    fun ensurePhoneAccount(ctx: Context): Boolean {
        if (!isSupported()) return false
        if (registered) return true
        synchronized(registrationLock) {
            if (registered) return true
            val tm = ctx.getSystemService(Context.TELECOM_SERVICE) as? TelecomManager ?: return false
            val h = handle(ctx) ?: return false
            try {
                val capabilities = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                    // Do NOT advertise video-call capabilities. Samsung/MIUI may
                    // route those through the OEM in-call UI, hiding MeriLive's
                    // React chat/gifts/controls. We keep only self-managed audio
                    // focus/account plumbing; incoming UI is our own fullscreen
                    // React activity delivered by high-priority FCM.
                    PhoneAccount.CAPABILITY_SELF_MANAGED
                } else 0
                val account = PhoneAccount.builder(h, "MeriLive")
                    .setCapabilities(capabilities)
                    .setShortDescription("MeriLive video & voice calls")
                    .build()
                tm.registerPhoneAccount(account)
                registered = true
                Log.d(TAG, "PhoneAccount registered: $PHONE_ACCOUNT_ID")
                return true
            } catch (t: Throwable) {
                Log.w(TAG, "registerPhoneAccount failed: ${t.message}")
                return false
            }
        }
    }


    /**
     * Tell Telecom about an incoming call. The framework calls back
     * into MeriConnectionService.onCreateIncomingConnection where we
     * mint the actual Connection.
     */
    @SuppressLint("MissingPermission")
    @JvmStatic
    fun reportIncoming(
        ctx: Context,
        callId: String,
        callerId: String,
        callerName: String,
        callType: String,
    ): Boolean {
        // 2026-06 audit fix: never push private calls into Android Telecom's
        // incoming-call pipeline. On Samsung/OEM builds addNewIncomingCall()
        // opens the system in-call UI above MeriLive, which hides our chat/gift
        // controls, races media adoption, leaves calls visually stuck on
        // "Connecting", and can leave a zombie OS call after hangup. Incoming
        // delivery is handled by MeriFirebaseMessagingService's high-priority
        // full-screen IncomingCallActivity + React call screen instead.
        Log.i(TAG, "reportIncoming bypassed for custom MeriLive UI: $callId")
        return false
    }

    @RequiresApi(Build.VERSION_CODES.O)
    @JvmStatic
    fun reportConnected(callId: String) {
        MeriConnectionService.getConnection(callId)?.let {
            try { it.setActive() } catch (_: Throwable) {}
        }
    }

    @RequiresApi(Build.VERSION_CODES.O)
    @JvmStatic
    fun reportEnded(callId: String, remote: Boolean = false) {
        val c = MeriConnectionService.getConnection(callId) ?: return
        try {
            val cause = if (remote) DisconnectCause.REMOTE else DisconnectCause.LOCAL
            c.setDisconnected(DisconnectCause(cause))
            c.destroy()
        } catch (_: Throwable) {}
        MeriConnectionService.remove(callId)
    }

    /**
     * Pkg211 — outgoing call path. Pushes an outgoing call into Telecom
     * via `tm.placeCall()` so BT headset End button + OS audio routing +
     * system call-log entry work for caller-side too.
     *
     * Self-managed PhoneAccount → MANAGE_OWN_CALLS (already granted) is
     * sufficient; we don't need CALL_PHONE. The framework calls
     * MeriConnectionService.onCreateOutgoingConnection with the extras
     * below where we mint the Connection.
     */
    @SuppressLint("MissingPermission")
    @JvmStatic
    fun placeOutgoing(
        ctx: Context,
        callId: String,
        calleeId: String,
        calleeName: String,
        callType: String,
    ): Boolean {
        if (!isSupported()) return false
        if (!ensurePhoneAccount(ctx)) return false
        val tm = ctx.getSystemService(Context.TELECOM_SERVICE) as? TelecomManager ?: return false
        val h = handle(ctx) ?: return false
        return try {
            val callExtras = Bundle().apply {
                putString(EXTRA_CALL_ID, callId)
                putString(EXTRA_CALLER_ID, calleeId)
                putString(EXTRA_CALLER_NAME, calleeName)
                putString(EXTRA_CALL_TYPE, callType)
            }
            val outer = Bundle().apply {
                putParcelable(TelecomManager.EXTRA_PHONE_ACCOUNT_HANDLE, h)
                putBundle(TelecomManager.EXTRA_OUTGOING_CALL_EXTRAS, callExtras)
            }
            val addr = Uri.fromParts("merilive", calleeId.ifEmpty { calleeName }, null)
            tm.placeCall(addr, outer)
            true
        } catch (t: Throwable) {
            Log.w(TAG, "placeCall failed: ${t.message}")
            false
        }
    }
}

