package com.merilive.app.rtc

import android.content.Context
import android.util.Log
import io.livekit.android.room.Room
import java.util.concurrent.atomic.AtomicReference

/**
 * Phase 1A / 1A.2 — Application-scope RTC engine observer + adoption point.
 *
 * Goal (Bigo / Chamet professional pattern): the LiveKit [Room] must
 * survive Activity recreation (config change, process trim, transient
 * BridgeActivity restart) so re-entry to a Live / Call screen never
 * pays the cold-reconnect cost (camera blank, ICE renegotiation,
 * audio-focus flap).
 *
 * **Lifecycle so far:**
 *   - Phase 1A (shipped): observer hooks publish bind/unbind events
 *     from [com.merilive.app.plugin.LiveKitPlugin]. Manager is read-only
 *     to everyone else.
 *   - Phase 1A.2 step 1 (this turn): expose [setSurviveActivityDestroy]
 *     + adoption helpers so a freshly-loaded plugin instance can
 *     reattach to a Room that survived an Activity rebuild.
 *   - Phase 1A.2 step 2 (next turn): plugin's `handleOnDestroy` will
 *     consult the survival flag and skip Room teardown when true.
 *
 * Thread-safety: [roomRef] is atomic. Callers must not assume the same
 * Room across reads — the plugin may swap it on reconnect.
 */
object RtcEngineManager {
    private const val TAG = "RtcEngineManager"

    private var appContext: Context? = null

    private val roomRef = AtomicReference<Room?>(null)
    @Volatile private var lastConnectSummary: ConnectSummary? = null
    @Volatile private var boundAtMs: Long = 0L

    /**
     * Phase 1A.2 — when `true`, the LiveKit plugin's `handleOnDestroy`
     * is asked to keep the Room alive (skip `disconnect` + `release`).
     * Default `false` so current behavior is unchanged until the JS
     * layer or the plugin itself explicitly opts in for a screen-swap.
     *
     * Set this BEFORE the Activity dies — the plugin reads it inside
     * `handleOnDestroy`.
     */
    @Volatile private var surviveActivityDestroy: Boolean = false

    /** Initialise from [com.merilive.app.MeriLiveApplication.onCreate]. Safe to call again. */
    @JvmStatic
    fun init(context: Context) {
        appContext = context.applicationContext
        Log.d(TAG, "init() — Application-scope engine manager ready")
    }

    @JvmStatic
    fun appContext(): Context? = appContext

    // -----------------------------------------------------------------
    // Bind / unbind (called by LiveKitPlugin)
    // -----------------------------------------------------------------

    @JvmStatic
    fun bind(room: Room, summary: ConnectSummary) {
        roomRef.set(room)
        lastConnectSummary = summary
        boundAtMs = System.currentTimeMillis()
        Log.d(TAG, "bound room=${System.identityHashCode(room)} url=${summary.url} type=${summary.callType}")
    }

    @JvmStatic
    @JvmOverloads
    fun unbind(reason: String, room: Room? = null) {
        val current = roomRef.get()
        if (room == null || room === current) {
            roomRef.set(null)
            lastConnectSummary = null
            boundAtMs = 0L
            // Survival flag is one-shot — clear it after any unbind so a
            // subsequent disconnect / fresh connect starts from default.
            surviveActivityDestroy = false
            Log.d(TAG, "unbound reason=$reason (survival flag cleared)")
        } else {
            Log.d(TAG, "unbind reason=$reason ignored — bound Room differs (stale caller)")
        }
    }

    @JvmStatic
    fun currentRoom(): Room? = roomRef.get()

    @JvmStatic
    fun isConnected(): Boolean = roomRef.get() != null

    @JvmStatic
    fun lastConnect(): ConnectSummary? = lastConnectSummary

    @JvmStatic
    fun boundAtMs(): Long = boundAtMs

    // -----------------------------------------------------------------
    // Phase 1A.2 — survival flag + adoption
    // -----------------------------------------------------------------

    /**
     * Opt the current Room into surviving the next Activity destroy.
     * The plugin's `handleOnDestroy` checks this and, when `true`,
     * skips `room.disconnect()` + `room.release()` so a freshly-loaded
     * plugin instance can adopt it via [adoptCurrentRoom].
     *
     * One-shot semantics: cleared on any [unbind] or after the next
     * adoption — caller must re-arm before each screen-swap.
     */
    @JvmStatic
    fun setSurviveActivityDestroy(enabled: Boolean) {
        if (surviveActivityDestroy != enabled) {
            surviveActivityDestroy = enabled
            Log.d(TAG, "surviveActivityDestroy=$enabled")
        }
    }

    @JvmStatic
    fun shouldSurviveActivityDestroy(): Boolean = surviveActivityDestroy

    /**
     * Phase 1A.2 step 1 — called by a freshly-loaded LiveKitPlugin to
     * inspect whether a Room survived Activity destroy and is ready to
     * be re-attached. Returns the Room + summary, or `null` if none.
     *
     * Clears the survival flag on successful read so we don't double-
     * adopt across a subsequent legitimate destroy.
     */
    @JvmStatic
    fun adoptCurrentRoom(): AdoptionHandle? {
        val r = roomRef.get() ?: return null
        val s = lastConnectSummary ?: return null
        val handle = AdoptionHandle(r, s, boundAtMs)
        surviveActivityDestroy = false
        Log.d(TAG, "adopted room=${System.identityHashCode(r)} url=${s.url} age=${System.currentTimeMillis() - boundAtMs}ms")
        return handle
    }

    /**
     * Lightweight summary of the active session — kept intentionally
     * narrow (no token, no E2EE key) so this object is safe to log
     * AND safe to forward to the JS layer for UI decisions.
     */
    data class ConnectSummary(
        val url: String,
        val callType: String?,
        val audioProfile: String?,
        val e2eeEnabled: Boolean,
    )

    /** Handle returned from [adoptCurrentRoom]. */
    data class AdoptionHandle(
        val room: Room,
        val summary: ConnectSummary,
        val boundAtMs: Long,
    )
}
