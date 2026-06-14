package com.merilive.app.rtc

import android.content.Context
import io.livekit.android.room.Room

/**
 * RtcEngineManager — STUB (2026-06-14 rebuild).
 *
 * The application-scope cross-Activity Room registry was deleted. The
 * new minimal LiveKit plugin creates a fresh Room per session, so there
 * is no shared engine to track. This stub keeps the API surface used by
 * `PrivateCallActivity` and `PrivateCallViewModel` compiling — both
 * call sites already handle `currentRoom() == null` as a no-op path.
 */
object RtcEngineManager {
    @JvmStatic
    fun init(@Suppress("UNUSED_PARAMETER") context: Context) { /* no-op */ }

    @JvmStatic
    fun currentRoom(): Room? = null
}
