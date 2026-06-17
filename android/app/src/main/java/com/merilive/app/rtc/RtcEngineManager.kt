package com.merilive.app.rtc

import android.content.Context
import io.livekit.android.room.Room

/**
 * RtcEngineManager — process-local Room registry.
 *
 * PrivateCallActivity is a separate native Activity. The LiveKit Room is
 * created/connected by LiveKitPlugin before that Activity opens, then the
 * Activity adopts this exact Room to render native video. Returning null here
 * makes the accepted call surface finish immediately / appear dark.
 */
object RtcEngineManager {
    @Volatile private var room: Room? = null

    @JvmStatic
    fun init(@Suppress("UNUSED_PARAMETER") context: Context) { /* no-op */ }

    @JvmStatic
    fun bindRoom(next: Room?) { room = next }

    @JvmStatic
    fun clearRoom(expected: Room? = null) {
        if (expected == null || room === expected) room = null
    }

    @JvmStatic
    fun currentRoom(): Room? = room
}
