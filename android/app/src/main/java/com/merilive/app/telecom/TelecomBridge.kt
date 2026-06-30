package com.merilive.app.telecom

import android.content.ComponentName
import android.content.Context
import android.os.Build
import android.telecom.PhoneAccountHandle
import android.util.Log
import androidx.annotation.RequiresApi

/**
 * 2026-06-30 — TELECOM BRIDGE FULLY NEUTERED.
 *
 * Background: Samsung / MIUI / Xiaomi / Vivo / Oppo OEM dialers were
 * intercepting our self-managed Telecom calls and showing a third-class
 * system "Phone" UI with a stray video icon on top of MeriLive, hiding our
 * React chat/gifts/controls and leaving zombie calls after hangup.
 *
 * Fix: do NOT register a PhoneAccount, do NOT call addNewIncomingCall(),
 * do NOT call placeCall(). All entrypoints below are no-ops. Incoming
 * calls are delivered exclusively via high-priority FCM →
 * IncomingCallActivity → React ActiveCallScreen. Outgoing calls open the
 * React active call screen directly. The OS Telecom framework never sees
 * a MeriLive call, so the OEM in-call UI is structurally impossible.
 *
 * Public API kept identical so existing Java/Kotlin call sites compile.
 * MeriConnectionService.kt remains on disk (manifest <service> removed)
 * for git history only and is unreachable code.
 */
object TelecomBridge {
    private const val TAG = "TelecomBridge"

    const val PHONE_ACCOUNT_ID = "merilive_voip"
    const val EXTRA_CALL_ID = "merilive.callId"
    const val EXTRA_CALLER_ID = "merilive.callerId"
    const val EXTRA_CALLER_NAME = "merilive.callerName"
    const val EXTRA_CALL_TYPE = "merilive.callType"

    @JvmStatic
    fun isSupported(): Boolean = Build.VERSION.SDK_INT >= Build.VERSION_CODES.O

    /** Kept for source compat — never used by neutered bridge. */
    @JvmStatic
    fun handle(ctx: Context): PhoneAccountHandle? {
        if (!isSupported()) return null
        return PhoneAccountHandle(
            ComponentName(ctx, MeriConnectionService::class.java),
            PHONE_ACCOUNT_ID,
        )
    }

    /** NO-OP. We never register a PhoneAccount so OEM dialer cannot hijack us. */
    @JvmStatic
    fun ensurePhoneAccount(ctx: Context): Boolean {
        Log.i(TAG, "ensurePhoneAccount disabled (OEM-dialer hijack prevention)")
        return false
    }

    /** NO-OP. Incoming delivered via FCM → IncomingCallActivity. */
    @JvmStatic
    fun reportIncoming(
        ctx: Context,
        callId: String,
        callerId: String,
        callerName: String,
        callType: String,
    ): Boolean {
        Log.i(TAG, "reportIncoming disabled (custom MeriLive UI only): $callId")
        return false
    }

    /** NO-OP. No native Connection exists to mark active. */
    @RequiresApi(Build.VERSION_CODES.O)
    @JvmStatic
    fun reportConnected(callId: String) {
        // intentionally empty
    }

    /** NO-OP. No native Connection exists to disconnect. */
    @RequiresApi(Build.VERSION_CODES.O)
    @JvmStatic
    fun reportEnded(callId: String, remote: Boolean = false) {
        // intentionally empty
    }

    /** NO-OP. Outgoing calls open the React ActiveCallScreen directly. */
    @JvmStatic
    fun placeOutgoing(
        ctx: Context,
        callId: String,
        calleeId: String,
        calleeName: String,
        callType: String,
    ): Boolean {
        Log.i(TAG, "placeOutgoing disabled (OEM-dialer hijack prevention): $callId")
        return false
    }
}
