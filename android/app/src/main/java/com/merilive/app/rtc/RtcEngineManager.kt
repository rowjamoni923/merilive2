package com.merilive.app.rtc

import android.content.Context
import android.util.Log
import io.livekit.android.room.Room
import java.util.concurrent.atomic.AtomicReference

/**
 * Phase 1A — Application-scope RTC engine observer.
 *
 * Goal (Bigo / Chamet professional pattern): the LiveKit [Room] must
 * survive Activity recreation (config change, process trim, transient
 * BridgeActivity restart) so re-entry to a Live / Call screen never
 * pays the cold-reconnect cost (camera blank, ICE renegotiation,
 * audio-focus flap).
 *
 * **Current scope (Phase 1A foundation):**
 *   This singleton is an *observer / handle*, not the owner. The
 *   active Room is still allocated inside [com.merilive.app.plugin.LiveKitPlugin],
 *   which calls [bind] on successful connect and [unbind] on
 *   disconnect / destroy. Nothing else queries the manager yet —
 *   wiring readers across the codebase happens in Phase 1A.2.
 *
 * **Why observer first (not big-bang rewrite):**
 *   `LiveKitPlugin.kt` is 4 400+ lines of battle-tested code shipping
 *   to 10 K+ users. Moving Room ownership in one commit is Russian
 *   roulette. We introduce the singleton, point at the existing Room,
 *   and migrate readers one feature at a time without touching the
 *   shipping flow. Same pattern Bigo/Chamet use for native-engine
 *   refactors.
 *
 * Thread-safety: the [room] reference is atomic. Callers must not
 * assume the same Room across reads — the plugin may swap it on
 * reconnect.
 */
object RtcEngineManager {
    private const val TAG = "RtcEngineManager"

    private var appContext: Context? = null

    /** Last-known active Room. Null when no session is bound. */
    private val roomRef = AtomicReference<Room?>(null)

    /** Snapshot of the most recent successful connect args (URL + room context). */
    @Volatile private var lastConnectSummary: ConnectSummary? = null

    /** Wall-clock when the current Room was bound. */
    @Volatile private var boundAtMs: Long = 0L

    /** Initialise from [com.merilive.app.MeriLiveApplication.onCreate]. Safe to call again. */
    @JvmStatic
    fun init(context: Context) {
        appContext = context.applicationContext
        Log.d(TAG, "init() — Application-scope engine manager ready")
    }

    /** Application context (may be null only before [init]). */
    @JvmStatic
    fun appContext(): Context? = appContext

    /**
     * Called by LiveKitPlugin immediately after `room.connect()` returns
     * successfully. Idempotent.
     */
    @JvmStatic
    fun bind(room: Room, summary: ConnectSummary) {
        roomRef.set(room)
        lastConnectSummary = summary
        boundAtMs = System.currentTimeMillis()
        Log.d(TAG, "bound room=${System.identityHashCode(room)} url=${summary.url} type=${summary.callType}")
    }

    /**
     * Called by LiveKitPlugin when the room is being torn down (user
     * disconnect, fatal error, Activity destroy). Idempotent.
     */
    @JvmStatic
    @JvmOverloads
    fun unbind(reason: String, room: Room? = null) {
        val current = roomRef.get()
        // Only clear if the caller's Room matches (avoid clobbering a
        // newer Room that a parallel reconnect already bound).
        if (room == null || room === current) {
            roomRef.set(null)
            lastConnectSummary = null
            boundAtMs = 0L
            Log.d(TAG, "unbound reason=$reason")
        } else {
            Log.d(TAG, "unbind reason=$reason ignored — bound Room differs (stale caller)")
        }
    }

    /** Current Room, or null if no session is active. */
    @JvmStatic
    fun currentRoom(): Room? = roomRef.get()

    @JvmStatic
    fun isConnected(): Boolean = roomRef.get() != null

    @JvmStatic
    fun lastConnect(): ConnectSummary? = lastConnectSummary

    @JvmStatic
    fun boundAtMs(): Long = boundAtMs

    /**
     * Lightweight summary of the active session — kept intentionally
     * narrow (no token, no E2EE key) so this object is safe to log.
     */
    data class ConnectSummary(
        val url: String,
        val callType: String?,
        val audioProfile: String?,
        val e2eeEnabled: Boolean,
    )
}
