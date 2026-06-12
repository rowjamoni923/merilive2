package com.merilive.app.service

import android.content.Context
import dagger.hilt.android.qualifiers.ApplicationContext
import io.livekit.android.LiveKit
import io.livekit.android.room.Room
import io.livekit.android.room.RoomException
import io.livekit.android.room.participant.LocalParticipant
import io.livekit.android.room.participant.RemoteParticipant
import io.livekit.android.room.track.CameraPosition
import io.livekit.android.room.track.LocalVideoTrack
import io.livekit.android.room.track.Track
import io.livekit.android.room.track.VideoTrack
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.withContext
import com.merilive.app.util.CameraOwnership
import javax.inject.Inject
import javax.inject.Singleton

@Singleton
class LiveKitManager @Inject constructor(
    @ApplicationContext private val context: Context,
) {
    private var room: Room? = null

    private val _connectionState = MutableStateFlow(ConnectionState.DISCONNECTED)
    val connectionState = _connectionState.asStateFlow()

    private val _remoteParticipants = MutableStateFlow<List<RemoteParticipant>>(emptyList())
    val remoteParticipants = _remoteParticipants.asStateFlow()

    private val _localVideoTrack = MutableStateFlow<LocalVideoTrack?>(null)
    val localVideoTrack = _localVideoTrack.asStateFlow()

    enum class ConnectionState { DISCONNECTED, CONNECTING, CONNECTED, RECONNECTING }

    suspend fun connect(url: String, token: String) {
        _connectionState.value = ConnectionState.CONNECTING
        try {
            if (!CameraOwnership.acquire(CameraOwnership.OWNER_LIVEKIT)) {
                throw IllegalStateException("Camera busy: held by ${CameraOwnership.owner()}")
            }
            val graceMs = CameraOwnership.releaseGraceRemainingMs()
            if (graceMs > 0L) delay(graceMs)

            room = withContext(Dispatchers.IO) { LiveKit.create(context).apply {
                connect(url, token)
            } }
            _connectionState.value = ConnectionState.CONNECTED
            observeParticipants()
        } catch (e: RoomException) {
            CameraOwnership.release(CameraOwnership.OWNER_LIVEKIT)
            _connectionState.value = ConnectionState.DISCONNECTED
            throw e
        } catch (e: Exception) {
            CameraOwnership.release(CameraOwnership.OWNER_LIVEKIT)
            _connectionState.value = ConnectionState.DISCONNECTED
            throw e
        }
    }

    suspend fun enableCamera(enabled: Boolean) {
        room?.localParticipant?.setCameraEnabled(enabled)
        if (enabled) {
            delay(250L)
            _localVideoTrack.value = room?.localParticipant?.getTrackPublication(Track.Source.CAMERA)?.track as? LocalVideoTrack
        }
    }

    suspend fun enableMicrophone(enabled: Boolean) {
        room?.localParticipant?.setMicrophoneEnabled(enabled)
    }

    suspend fun switchCamera() = withContext(Dispatchers.IO) {
        val currentTrack = _localVideoTrack.value ?: return@withContext
        val newPosition = if (currentTrack.options.position == CameraPosition.FRONT) {
            CameraPosition.BACK
        } else {
            CameraPosition.FRONT
        }
        currentTrack.switchCamera(newPosition)
        delay(1_200L)
    }

    fun disconnect() {
        try { _localVideoTrack.value?.stop() } catch (_: Exception) {}
        room?.disconnect()
        room = null
        _connectionState.value = ConnectionState.DISCONNECTED
        _remoteParticipants.value = emptyList()
        _localVideoTrack.value = null
        CameraOwnership.release(CameraOwnership.OWNER_LIVEKIT)
    }

    fun getRoom(): Room? = room

    private fun observeParticipants() {
        room?.let { r ->
            _remoteParticipants.value = r.remoteParticipants.values.toList()
        }
    }
}