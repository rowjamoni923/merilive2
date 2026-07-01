/**
 * LiveKitNativePlugin.kt — Production-Ready v2.2 (SDK-Compatible)
 *
 * Capacitor Plugin: Native LiveKit video rendering behind transparent WebView.
 * Uses SurfaceViewRenderer (GPU-accelerated) instead of WebView's <video> element.
 *
 * CRITICAL: This file must be placed at:
 *   android/app/src/main/java/com/merilive/app/plugins/LiveKitNativePlugin.kt
 *
 * SETUP CHECKLIST:
 * 1. build.gradle: implementation "io.livekit:livekit-android:2.23.5"
 * 2. settings.gradle: maven { url 'https://jitpack.io' }
 * 3. MainActivity.java: registerPlugin(LiveKitNativePlugin.class) — BEFORE super.onCreate()
 * 4. ProGuard: -keep class io.livekit.** { *; }
 */
package com.merilive.app.plugins

import android.graphics.Color
import android.util.Log
import android.view.View
import android.view.ViewGroup
import android.widget.FrameLayout
import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin
import io.livekit.android.LiveKit
import io.livekit.android.events.RoomEvent
import io.livekit.android.events.collect
import io.livekit.android.renderer.SurfaceViewRenderer
import io.livekit.android.room.Room
import io.livekit.android.room.track.VideoTrack
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import livekit.org.webrtc.RendererCommon

@CapacitorPlugin(name = "LiveKitNative")
class LiveKitNativePlugin : Plugin() {

    companion object {
        private const val TAG = "MeriLive_LiveKit"
    }

    private var room: Room? = null
    private var videoRenderer: SurfaceViewRenderer? = null
    private var videoContainer: FrameLayout? = null
    private var isConnected = false
    private var pluginScope = CoroutineScope(Dispatchers.Main + SupervisorJob())
    private var eventCollectionJob: Job? = null

    override fun load() {
        super.load()
        Log.i(TAG, "LiveKitNativePlugin v2.2 loaded")
    }

    /**
     * Step 1: Initialize native video surface behind WebView
     */
    @PluginMethod
    fun initialize(call: PluginCall) {
        activity.runOnUiThread {
            try {
                if (videoContainer != null) {
                    call.resolve(JSObject().apply {
                        put("success", true)
                        put("message", "Already initialized")
                    })
                    return@runOnUiThread
                }

                videoContainer = FrameLayout(context).apply {
                    layoutParams = FrameLayout.LayoutParams(
                        ViewGroup.LayoutParams.MATCH_PARENT,
                        ViewGroup.LayoutParams.MATCH_PARENT
                    )
                    setBackgroundColor(Color.BLACK)
                    visibility = View.GONE
                }

                videoRenderer = SurfaceViewRenderer(context).apply {
                    layoutParams = FrameLayout.LayoutParams(
                        ViewGroup.LayoutParams.MATCH_PARENT,
                        ViewGroup.LayoutParams.MATCH_PARENT
                    )
                    setEnableHardwareScaler(true)
                    setMirror(false)
                }

                videoContainer!!.addView(videoRenderer)

                val rootView = activity.findViewById<ViewGroup>(android.R.id.content)
                rootView.addView(videoContainer, 0)

                bridge?.webView?.apply {
                    setBackgroundColor(Color.TRANSPARENT)
                    (parent as? View)?.setBackgroundColor(Color.TRANSPARENT)
                }

                room = LiveKit.create(appContext = context.applicationContext)

                Log.i(TAG, "Native video surface initialized")
                call.resolve(JSObject().apply {
                    put("success", true)
                    put("message", "Native video surface initialized with GPU renderer")
                })
            } catch (e: Exception) {
                Log.e(TAG, "Failed to initialize: ${e.message}", e)
                call.reject("Failed to initialize native video: ${e.message}", e)
            }
        }
    }

    /**
     * Step 2: Connect to LiveKit room and subscribe to remote video
     */
    @PluginMethod
    fun connect(call: PluginCall) {
        val wsUrl = call.getString("wsUrl")
        val token = call.getString("token")

        if (wsUrl.isNullOrEmpty() || token.isNullOrEmpty()) {
            call.reject("wsUrl and token are required")
            return
        }

        val currentRoom = room
        if (currentRoom == null) {
            call.reject("Plugin not initialized. Call initialize() first.")
            return
        }

        pluginScope.launch {
            try {
                currentRoom.connect(wsUrl, token)
                isConnected = true
                Log.i(TAG, "Connected to LiveKit room: ${currentRoom.name}")

                withContext(Dispatchers.Main) {
                    videoContainer?.visibility = View.VISIBLE
                }

                startEventCollection(currentRoom)

                // Attach any already-existing remote video tracks
                // videoTrackPublications returns List<Pair<TrackPublication, Track?>>
                currentRoom.remoteParticipants.values.forEach { participant ->
                    participant.videoTrackPublications.forEach { (publication, track) ->
                        val videoTrack = track as? VideoTrack ?: return@forEach
                        withContext(Dispatchers.Main) {
                            videoRenderer?.let { renderer ->
                                videoTrack.addRenderer(renderer)
                                Log.i(TAG, "Existing track attached: ${publication.sid}")
                            }
                        }
                    }
                }

                call.resolve(JSObject().apply {
                    put("connected", true)
                    put("roomName", currentRoom.name ?: "")
                    put("participantCount", currentRoom.remoteParticipants.size)
                })
            } catch (e: Exception) {
                isConnected = false
                Log.e(TAG, "Connection failed: ${e.message}", e)
                call.reject("Connection failed: ${e.message}", e)
            }
        }
    }

    /**
     * Collect room events and auto-attach video tracks
     */
    private fun startEventCollection(room: Room) {
        eventCollectionJob?.cancel()
        eventCollectionJob = pluginScope.launch {
            room.events.collect { event ->
                when (event) {
                    is RoomEvent.TrackSubscribed -> {
                        val track = event.track
                        if (track is VideoTrack) {
                            Log.i(TAG, "Remote video track subscribed, attaching to renderer")
                            withContext(Dispatchers.Main) {
                                videoRenderer?.let { renderer ->
                                    track.addRenderer(renderer)
                                    Log.i(TAG, "Video track attached to native SurfaceViewRenderer")
                                }
                            }
                            notifyListeners("nativeVideoAttached", JSObject().apply {
                                put("trackSid", track.sid)
                                put("participantId", event.participant.identity.toString())
                            })
                        }
                    }

                    is RoomEvent.TrackUnsubscribed -> {
                        val track = event.track
                        if (track is VideoTrack) {
                            Log.i(TAG, "Remote video track unsubscribed")
                            withContext(Dispatchers.Main) {
                                videoRenderer?.let { renderer ->
                                    track.removeRenderer(renderer)
                                }
                            }
                            notifyListeners("nativeVideoDetached", JSObject().apply {
                                put("trackSid", track.sid)
                            })
                        }
                    }

                    is RoomEvent.Disconnected -> {
                        Log.i(TAG, "Disconnected from room")
                        isConnected = false
                        withContext(Dispatchers.Main) {
                            videoContainer?.visibility = View.GONE
                        }
                        notifyListeners("nativeDisconnected", JSObject())
                    }

                    is RoomEvent.Reconnecting -> {
                        Log.w(TAG, "Reconnecting...")
                        notifyListeners("nativeReconnecting", JSObject())
                    }

                    is RoomEvent.Reconnected -> {
                        Log.i(TAG, "Reconnected")
                        isConnected = true
                        notifyListeners("nativeReconnected", JSObject())
                    }

                    else -> {}
                }
            }
        }
    }

    /**
     * Show/hide native video surface
     */
    @PluginMethod
    fun setVideoVisible(call: PluginCall) {
        val visible = call.getBoolean("visible", true) ?: true

        activity.runOnUiThread {
            videoContainer?.visibility = if (visible) View.VISIBLE else View.GONE

            if (!visible) {
                bridge?.webView?.setBackgroundColor(Color.parseColor("#0a0a0f"))
            } else {
                bridge?.webView?.setBackgroundColor(Color.TRANSPARENT)
            }
        }

        call.resolve()
    }

    /**
     * Set mirror mode (for host's own camera view)
     */
    @PluginMethod
    fun setMirror(call: PluginCall) {
        val mirror = call.getBoolean("mirror", false) ?: false
        activity.runOnUiThread {
            videoRenderer?.setMirror(mirror)
        }
        call.resolve()
    }

    /**
     * Set video scaling type
     */
    @PluginMethod
    fun setScalingType(call: PluginCall) {
        val type = call.getString("type", "FIT") ?: "FIT"
        activity.runOnUiThread {
            videoRenderer?.let { renderer ->
                val scalingType = when (type.uppercase()) {
                    "FIT" -> RendererCommon.ScalingType.SCALE_ASPECT_FIT
                    "BALANCED" -> RendererCommon.ScalingType.SCALE_ASPECT_BALANCED
                    else -> RendererCommon.ScalingType.SCALE_ASPECT_FIT
                }
                renderer.setScalingType(scalingType)
            }
        }
        call.resolve()
    }

    /**
     * Disconnect and cleanup resources
     */
    @PluginMethod
    fun disconnect(call: PluginCall) {
        pluginScope.launch {
            try {
                eventCollectionJob?.cancel()
                eventCollectionJob = null

                room?.disconnect()
                isConnected = false

                withContext(Dispatchers.Main) {
                    videoContainer?.visibility = View.GONE
                    bridge?.webView?.setBackgroundColor(Color.parseColor("#0a0a0f"))
                }

                Log.i(TAG, "Disconnected and cleaned up")
                call.resolve()
            } catch (e: Exception) {
                Log.e(TAG, "Disconnect error: ${e.message}", e)
                call.reject("Disconnect failed: ${e.message}", e)
            }
        }
    }

    /**
     * Get current connection status
     */
    @PluginMethod
    fun getStatus(call: PluginCall) {
        call.resolve(JSObject().apply {
            put("connected", isConnected)
            put("hasRenderer", videoRenderer != null)
            put("isVideoVisible", videoContainer?.visibility == View.VISIBLE)
            put("roomName", room?.name ?: "")
            put("remoteParticipants", room?.remoteParticipants?.size ?: 0)
        })
    }

    override fun handleOnDestroy() {
        pluginScope.launch {
            eventCollectionJob?.cancel()
            room?.disconnect()
        }
        activity.runOnUiThread {
            videoRenderer?.release()
            videoContainer?.let { container ->
                (container.parent as? ViewGroup)?.removeView(container)
            }
        }
        pluginScope.cancel()
        super.handleOnDestroy()
    }
}
