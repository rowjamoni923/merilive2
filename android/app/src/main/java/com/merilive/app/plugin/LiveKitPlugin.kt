package com.merilive.app.plugin

import android.Manifest
import android.content.Context
import android.content.Intent
import android.media.AudioDeviceInfo
import android.media.AudioManager
import android.os.Build
import android.os.PowerManager
import com.merilive.app.service.CallForegroundService
import android.util.Log
import android.view.ViewGroup
import android.view.WindowManager
import android.widget.FrameLayout
import com.getcapacitor.JSObject
import com.getcapacitor.PermissionState
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin
import com.getcapacitor.annotation.Permission
import com.getcapacitor.annotation.PermissionCallback
import io.livekit.android.ConnectOptions
import io.livekit.android.LiveKit
import io.livekit.android.LiveKitOverrides
import io.livekit.android.RoomOptions
import io.livekit.android.events.RoomEvent
import io.livekit.android.events.collect
import io.livekit.android.renderer.TextureViewRenderer
import io.livekit.android.room.Room
import io.livekit.android.room.participant.RemoteParticipant
import io.livekit.android.room.track.CameraPosition
import io.livekit.android.room.track.LocalVideoTrackOptions
import io.livekit.android.room.track.Track
import io.livekit.android.room.track.VideoCaptureParameter
import io.livekit.android.room.track.VideoPreset169
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.launch

/**
 * LiveKitPlugin — Step 2.
 *
 * Capacitor bridge around LiveKit Android SDK 2.x. Publishes camera + mic
 * as native WebRTC tracks (replaces browser getUserMedia inside Live and
 * Private Call). Renders local + remote video into native TextureViews
 * mounted behind the Capacitor WebView so JS chat / gift overlays stay
 * on top.
 *
 * JS API (see src/plugins/NativeLiveKit.ts):
 *   isAvailable()
 *   connect({ url, token, video?, audio?, lens?, resolution? })
 *   disconnect()
 *   setMicrophoneEnabled({ enabled })
 *   setCameraEnabled({ enabled })
 *   switchCamera()
 *   attachLocal()         // mount local preview behind WebView
 *   attachRemote({ sid }) // mount remote video behind WebView
 *   detachAll()
 *
 * Events emitted to JS:
 *   "participant-connected"      { sid, identity }
 *   "participant-disconnected"   { sid, identity }
 *   "track-subscribed"           { sid, identity, kind }
 *   "track-unsubscribed"         { sid, identity, kind }
 *   "disconnected"               { reason }
 *   "connection-quality"         { sid, quality }
 */
@CapacitorPlugin(
    name = "NativeLiveKit",
    permissions = [
        Permission(strings = [Manifest.permission.CAMERA], alias = "camera"),
        Permission(strings = [Manifest.permission.RECORD_AUDIO], alias = "microphone")
    ]
)
class LiveKitPlugin : Plugin() {

    companion object { private const val TAG = "LiveKitPlugin" }

    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Main)
    private var eventJob: Job? = null
    private var room: Room? = null

    private var localRenderer: TextureViewRenderer? = null
    private val remoteRenderers = mutableMapOf<String, TextureViewRenderer>()

    // --- Audio routing state (Step 11) -----------------------------
    private var savedAudioMode: Int = AudioManager.MODE_NORMAL
    private var savedSpeakerphoneOn: Boolean = false
    private var audioModeApplied: Boolean = false
    private var proximityWakeLock: PowerManager.WakeLock? = null

    // --- Audio focus + interruption state (Step 15) ---------------
    private var audioFocusRequest: android.media.AudioFocusRequest? = null
    private var audioFocusListener: AudioManager.OnAudioFocusChangeListener? = null
    private var hasAudioFocus: Boolean = false
    /** True when we ducked/paused mic ourselves due to a transient loss; resume on regain. */
    private var micPausedByFocusLoss: Boolean = false
    /** Snapshot of user's mic intent before interruption, restored on focus regain. */
    private var micIntentBeforeLoss: Boolean = true

    // ------------------------------------------------------------
    // Public API
    // ------------------------------------------------------------

    @PluginMethod
    fun isAvailable(call: PluginCall) {
        val ret = JSObject()
        ret.put("available", true)
        ret.put("backend", "livekit-native")
        ret.put("version", "2.7.0")
        call.resolve(ret)
    }

    @PluginMethod
    fun connect(call: PluginCall) {
        if (getPermissionState("camera") != PermissionState.GRANTED ||
            getPermissionState("microphone") != PermissionState.GRANTED
        ) {
            requestPermissionForAliases(arrayOf("camera", "microphone"), call, "permsCallback")
            return
        }

        val url = call.getString("url")
        val token = call.getString("token")
        if (url.isNullOrBlank() || token.isNullOrBlank()) {
            call.reject("url and token are required")
            return
        }

        val enableVideo = call.getBoolean("video", true) ?: true
        val enableAudio = call.getBoolean("audio", true) ?: true
        val lens = call.getString("lens", "front") ?: "front"
        val resolution = call.getString("resolution", "1080p") ?: "1080p"
        val callerName = call.getString("callerName", "") ?: ""
        val callType = call.getString("callType", if (enableVideo) "Video Call" else "Voice Call")
            ?: if (enableVideo) "Video Call" else "Voice Call"

        scope.launch {
            try {
                // Tear down any previous room first.
                room?.disconnect()
                room = null

                val captureParams: VideoCaptureParameter = if (resolution == "720p") {
                    VideoPreset169.H720.capture
                } else {
                    VideoPreset169.H1080.capture
                }

                val cameraPosition =
                    if (lens == "back") CameraPosition.BACK else CameraPosition.FRONT

                val roomOptions = RoomOptions(
                    adaptiveStream = true,
                    dynacast = true,
                    videoTrackCaptureDefaults = LocalVideoTrackOptions(
                        position = cameraPosition,
                        captureParams = captureParams
                    )
                )

                val newRoom = LiveKit.create(
                    appContext = context.applicationContext,
                    options = roomOptions,
                    overrides = LiveKitOverrides()
                )
                room = newRoom

                attachEventListeners(newRoom)

                newRoom.connect(url, token, ConnectOptions(autoSubscribe = true))

                // Publish local tracks.
                newRoom.localParticipant.setMicrophoneEnabled(enableAudio)
                newRoom.localParticipant.setCameraEnabled(enableVideo)

                // Keep screen on for the duration of the live/call session.
                setKeepScreenOn(true)

                // Apply communication audio mode + default routing:
                //  - video session  → speaker ON, no proximity (Live broadcast / video call)
                //  - audio-only call → speaker OFF (earpiece), proximity ON
                applyAudioMode(true)
                setSpeakerphoneInternal(enableVideo)
                setProximityMonitoringInternal(!enableVideo)
                registerAudioDeviceListener()

                // Step 14 — promote process to a foreground service so Android
                // 14+ keeps mic/camera alive when the user backgrounds the app.
                startCallForegroundService(callerName, callType)

                val ret = JSObject()
                ret.put("connected", true)
                ret.put("sid", newRoom.localParticipant.sid.value)
                ret.put("identity", newRoom.localParticipant.identity?.value ?: "")
                call.resolve(ret)
            } catch (e: Exception) {
                Log.e(TAG, "connect failed", e)
                call.reject("LiveKit connect failed: ${e.message}")
            }
        }
    }

    @PluginMethod
    fun disconnect(call: PluginCall) {
        scope.launch {
            try {
                eventJob?.cancel()
                eventJob = null
                room?.disconnect()
                room = null
                activity?.runOnUiThread { detachAllRenderersInternal() }
                setKeepScreenOn(false)
                setProximityMonitoringInternal(false)
                applyAudioMode(false)
                unregisterAudioDeviceListener()
                stopCallForegroundService()
                call.resolve()
            } catch (e: Exception) {
                call.reject("disconnect failed: ${e.message}")
            }
        }
    }

    @PluginMethod
    fun setMicrophoneEnabled(call: PluginCall) {
        val enabled = call.getBoolean("enabled", true) ?: true
        val r = room ?: return call.reject("Not connected")
        scope.launch {
            try {
                r.localParticipant.setMicrophoneEnabled(enabled)
                call.resolve()
            } catch (e: Exception) {
                call.reject("setMicrophoneEnabled failed: ${e.message}")
            }
        }
    }

    @PluginMethod
    fun setCameraEnabled(call: PluginCall) {
        val enabled = call.getBoolean("enabled", true) ?: true
        val r = room ?: return call.reject("Not connected")
        scope.launch {
            try {
                r.localParticipant.setCameraEnabled(enabled)
                call.resolve()
            } catch (e: Exception) {
                call.reject("setCameraEnabled failed: ${e.message}")
            }
        }
    }

    @PluginMethod
    fun switchCamera(call: PluginCall) {
        val r = room ?: return call.reject("Not connected")
        scope.launch {
            try {
                val videoTrack = r.localParticipant.getTrackPublication(Track.Source.CAMERA)
                    ?.track as? io.livekit.android.room.track.LocalVideoTrack
                videoTrack?.switchCamera()
                call.resolve()
            } catch (e: Exception) {
                call.reject("switchCamera failed: ${e.message}")
            }
        }
    }

    @PluginMethod
    fun attachLocal(call: PluginCall) {
        val r = room ?: return call.reject("Not connected")
        activity?.runOnUiThread {
            try {
                val track = r.localParticipant.getTrackPublication(Track.Source.CAMERA)
                    ?.track as? io.livekit.android.room.track.VideoTrack
                if (track == null) { call.reject("No local camera track yet"); return@runOnUiThread }

                if (localRenderer == null) localRenderer = createRenderer()
                r.initVideoRenderer(localRenderer!!)
                track.addRenderer(localRenderer!!)
                mountBehindWebView(localRenderer!!)
                call.resolve()
            } catch (e: Exception) {
                call.reject("attachLocal failed: ${e.message}")
            }
        }
    }

    @PluginMethod
    fun attachRemote(call: PluginCall) {
        val sid = call.getString("sid") ?: return call.reject("sid required")
        val r = room ?: return call.reject("Not connected")
        activity?.runOnUiThread {
            try {
                val participant = r.remoteParticipants.values.firstOrNull {
                    it.sid.value == sid
                } ?: return@runOnUiThread call.reject("Participant not found")
                val track = participant.getTrackPublication(Track.Source.CAMERA)
                    ?.track as? io.livekit.android.room.track.VideoTrack
                    ?: return@runOnUiThread call.reject("No remote camera track")

                val renderer = remoteRenderers.getOrPut(sid) { createRenderer() }
                r.initVideoRenderer(renderer)
                track.addRenderer(renderer)
                mountBehindWebView(renderer)
                call.resolve()
            } catch (e: Exception) {
                call.reject("attachRemote failed: ${e.message}")
            }
        }
    }

    @PluginMethod
    fun detachAll(call: PluginCall) {
        activity?.runOnUiThread {
            detachAllRenderersInternal()
            call.resolve()
        }
    }

    // --- Audio routing API (Step 11) -------------------------------

    @PluginMethod
    fun setSpeakerphoneEnabled(call: PluginCall) {
        val enabled = call.getBoolean("enabled", true) ?: true
        try {
            setSpeakerphoneInternal(enabled)
            val ret = JSObject(); ret.put("speakerphone", enabled); call.resolve(ret)
        } catch (e: Exception) {
            call.reject("setSpeakerphoneEnabled failed: ${e.message}")
        }
    }

    @PluginMethod
    fun setProximityMonitoring(call: PluginCall) {
        val enabled = call.getBoolean("enabled", false) ?: false
        try {
            setProximityMonitoringInternal(enabled)
            val ret = JSObject(); ret.put("proximity", enabled); call.resolve(ret)
        } catch (e: Exception) {
            call.reject("setProximityMonitoring failed: ${e.message}")
        }
    }

    @PluginMethod
    fun setAudioMode(call: PluginCall) {
        // mode: "voice" → earpiece + proximity ON; "video" → speaker ON, proximity OFF; "none" → restore
        val mode = call.getString("mode", "video") ?: "video"
        try {
            when (mode) {
                "voice" -> {
                    applyAudioMode(true)
                    setSpeakerphoneInternal(false)
                    setProximityMonitoringInternal(true)
                }
                "video" -> {
                    applyAudioMode(true)
                    setSpeakerphoneInternal(true)
                    setProximityMonitoringInternal(false)
                }
                "none", "off", "restore" -> {
                    setProximityMonitoringInternal(false)
                    applyAudioMode(false)
                }
                else -> { call.reject("Unknown mode: $mode"); return }
            }
            val ret = JSObject(); ret.put("mode", mode); call.resolve(ret)
        } catch (e: Exception) {
            call.reject("setAudioMode failed: ${e.message}")
        }
    }

    // --- Audio device routing (Step 13) ----------------------------

    /**
     * Returns currently available communication audio devices and the
     * type that is actively routed. Lets the JS UI render a "speaker /
     * earpiece / Bluetooth / wired headset" picker like real phone apps.
     */
    @PluginMethod
    fun getAudioDevices(call: PluginCall) {
        try {
            val ret = JSObject()
            val list = org.json.JSONArray()
            val am = audioManager()
            if (am != null && Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                am.availableCommunicationDevices.forEach { d ->
                    val o = JSObject()
                    o.put("id", d.id)
                    o.put("type", audioDeviceTypeName(d.type))
                    o.put("name", d.productName?.toString() ?: audioDeviceTypeName(d.type))
                    list.put(o)
                }
                ret.put("active", audioDeviceTypeName(am.communicationDevice?.type ?: -1))
            } else {
                // Legacy fallback: only earpiece/speaker known.
                listOf("earpiece", "speaker").forEach { name ->
                    val o = JSObject(); o.put("id", -1); o.put("type", name); o.put("name", name); list.put(o)
                }
                @Suppress("DEPRECATION")
                ret.put("active", if (am?.isSpeakerphoneOn == true) "speaker" else "earpiece")
            }
            ret.put("devices", list)
            call.resolve(ret)
        } catch (e: Exception) {
            call.reject("getAudioDevices failed: ${e.message}")
        }
    }

    /**
     * Route audio to a specific device class. Accepted values:
     *   "bluetooth" | "wired" | "speaker" | "earpiece"
     */
    @PluginMethod
    fun setAudioDevice(call: PluginCall) {
        val type = call.getString("type") ?: return call.reject("type required")
        try {
            val ok = setAudioDeviceInternal(type)
            val ret = JSObject(); ret.put("type", type); ret.put("applied", ok)
            call.resolve(ret)
        } catch (e: Exception) {
            call.reject("setAudioDevice failed: ${e.message}")
        }
    }

    // ------------------------------------------------------------
    // Internals
    // ------------------------------------------------------------

    @PermissionCallback
    private fun permsCallback(call: PluginCall) {
        if (getPermissionState("camera") == PermissionState.GRANTED &&
            getPermissionState("microphone") == PermissionState.GRANTED
        ) connect(call) else call.reject("Camera/Microphone permission denied")
    }

    private fun attachEventListeners(r: Room) {
        eventJob?.cancel()
        eventJob = scope.launch {
            r.events.collect { event ->
                when (event) {
                    is RoomEvent.ParticipantConnected ->
                        emit("participant-connected", event.participant)
                    is RoomEvent.ParticipantDisconnected ->
                        emit("participant-disconnected", event.participant)
                    is RoomEvent.TrackSubscribed -> {
                        val data = JSObject()
                        data.put("sid", event.participant.sid.value)
                        data.put("identity", event.participant.identity?.value ?: "")
                        data.put("kind", event.track.kind.name.lowercase())
                        notifyListeners("track-subscribed", data)
                    }
                    is RoomEvent.TrackUnsubscribed -> {
                        val data = JSObject()
                        data.put("sid", event.participant.sid.value)
                        data.put("identity", event.participant.identity?.value ?: "")
                        data.put("kind", event.track.kind.name.lowercase())
                        notifyListeners("track-unsubscribed", data)
                    }
                    is RoomEvent.Disconnected -> {
                        val data = JSObject()
                        data.put("reason", event.reason.name)
                        event.error?.let { data.put("error", it.message ?: it.javaClass.simpleName) }
                        notifyListeners("disconnected", data)
                        // Server-initiated / network drop — release the screen-on flag too.
                        setKeepScreenOn(false)
                    }
                    is RoomEvent.ConnectionQualityChanged -> {
                        val data = JSObject()
                        data.put("sid", event.participant.sid.value)
                        data.put("quality", event.quality.name.lowercase())
                        notifyListeners("connection-quality", data)
                    }
                    else -> { /* ignore */ }
                }
            }
        }
    }

    private fun emit(name: String, p: io.livekit.android.room.participant.Participant) {
        val data = JSObject()
        data.put("sid", p.sid.value)
        data.put("identity", p.identity?.value ?: "")
        data.put("isRemote", p is RemoteParticipant)
        notifyListeners(name, data)
    }

    private fun createRenderer(): TextureViewRenderer {
        val renderer = TextureViewRenderer(context)
        renderer.setEnableHardwareScaler(true)
        return renderer
    }

    private fun mountBehindWebView(renderer: TextureViewRenderer) {
        val webView = bridge?.webView ?: return
        val root = webView.parent as? ViewGroup ?: return
        if (renderer.parent == null) {
            val lp = FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.MATCH_PARENT
            )
            root.addView(renderer, 0, lp)
            webView.setBackgroundColor(0x00000000)
        }
    }

    private fun detachAllRenderersInternal() {
        val webView = bridge?.webView
        localRenderer?.let { (it.parent as? ViewGroup)?.removeView(it); it.release() }
        localRenderer = null
        remoteRenderers.values.forEach {
            (it.parent as? ViewGroup)?.removeView(it); it.release()
        }
        remoteRenderers.clear()
        webView?.setBackgroundColor(0xFF000000.toInt())
    }

    override fun handleOnDestroy() {
        super.handleOnDestroy()
        try {
            eventJob?.cancel()
            scope.launch { room?.disconnect() }
            setKeepScreenOn(false)
            setProximityMonitoringInternal(false)
            applyAudioMode(false)
            unregisterAudioDeviceListener()
            stopCallForegroundService()
        } catch (_: Exception) {}
    }

    // ------------------------------------------------------------
    // Foreground Service lifecycle (Step 14)
    //
    // Android 14+ kills mic / camera the moment the app is backgrounded
    // unless a foreground service of type microphone|camera|phoneCall is
    // running. We start CallForegroundService on connect() and stop it on
    // disconnect()/destroy so Live + Private Call survive backgrounding,
    // exactly like WhatsApp / Messenger.
    // ------------------------------------------------------------

    private fun startCallForegroundService(callerName: String, callType: String) {
        val ctx = context ?: return
        try {
            val intent = Intent(ctx, CallForegroundService::class.java).apply {
                action = CallForegroundService.ACTION_START
                putExtra("caller_name", callerName.ifBlank { "Live session" })
                putExtra("call_type", callType.ifBlank { "Call" })
            }
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                ctx.startForegroundService(intent)
            } else {
                ctx.startService(intent)
            }
        } catch (e: Exception) {
            Log.w(TAG, "startCallForegroundService failed: ${e.message}")
        }
    }

    private fun stopCallForegroundService() {
        val ctx = context ?: return
        try {
            val intent = Intent(ctx, CallForegroundService::class.java).apply {
                action = CallForegroundService.ACTION_STOP
            }
            ctx.startService(intent)
        } catch (e: Exception) {
            Log.w(TAG, "stopCallForegroundService failed: ${e.message}")
        }
    }

    /**
     * Toggles FLAG_KEEP_SCREEN_ON on the host Activity window so Android
     * does not dim or lock the screen while a live broadcast / private
     * call session is active. Always dispatched to the UI thread.
     */
    private fun setKeepScreenOn(on: Boolean) {
        val act = activity ?: return
        act.runOnUiThread {
            try {
                if (on) {
                    act.window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
                } else {
                    act.window.clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)
                }
            } catch (e: Exception) {
                Log.w(TAG, "setKeepScreenOn($on) failed: ${e.message}")
            }
        }
    }

    // ------------------------------------------------------------
    // Audio routing internals (Step 11)
    // ------------------------------------------------------------

    private fun audioManager(): AudioManager? =
        context.getSystemService(Context.AUDIO_SERVICE) as? AudioManager

    /**
     * Switch the system into MODE_IN_COMMUNICATION while a session is
     * active so volume keys control the call/voip stream and routing
     * priorities behave like a real phone call. Saves and restores the
     * pre-session mode + speaker state on tear-down.
     */
    private fun applyAudioMode(active: Boolean) {
        val am = audioManager() ?: return
        try {
            if (active) {
                if (!audioModeApplied) {
                    savedAudioMode = am.mode
                    @Suppress("DEPRECATION")
                    savedSpeakerphoneOn = am.isSpeakerphoneOn
                    audioModeApplied = true
                }
                am.mode = AudioManager.MODE_IN_COMMUNICATION
            } else if (audioModeApplied) {
                try { am.mode = savedAudioMode } catch (_: Exception) {}
                @Suppress("DEPRECATION")
                try { am.isSpeakerphoneOn = savedSpeakerphoneOn } catch (_: Exception) {}
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                    try { am.clearCommunicationDevice() } catch (_: Exception) {}
                }
                audioModeApplied = false
            }
        } catch (e: Exception) {
            Log.w(TAG, "applyAudioMode($active) failed: ${e.message}")
        }
    }

    /**
     * Route audio to speakerphone (true) or earpiece/Bluetooth (false).
     * Uses the modern setCommunicationDevice API on Android 12+ and falls
     * back to the legacy isSpeakerphoneOn flag on older devices.
     */
    private fun setSpeakerphoneInternal(on: Boolean) {
        val am = audioManager() ?: return
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                val targetType = if (on) AudioDeviceInfo.TYPE_BUILTIN_SPEAKER
                                 else AudioDeviceInfo.TYPE_BUILTIN_EARPIECE
                val device = am.availableCommunicationDevices.firstOrNull { it.type == targetType }
                if (device != null) {
                    am.setCommunicationDevice(device)
                    return
                }
                // Fall through to legacy flag if device unavailable.
            }
            @Suppress("DEPRECATION")
            am.isSpeakerphoneOn = on
        } catch (e: Exception) {
            Log.w(TAG, "setSpeakerphoneInternal($on) failed: ${e.message}")
        }
    }

    /**
     * Acquire/release a PROXIMITY_SCREEN_OFF_WAKE_LOCK so the screen
     * blanks when the user holds the phone to their ear during a voice
     * call (mirrors the behaviour of the system Phone app). Idempotent.
     */
    private fun setProximityMonitoringInternal(on: Boolean) {
        try {
            if (on) {
                if (proximityWakeLock?.isHeld == true) return
                val pm = context.getSystemService(Context.POWER_SERVICE) as? PowerManager ?: return
                if (!pm.isWakeLockLevelSupported(PowerManager.PROXIMITY_SCREEN_OFF_WAKE_LOCK)) return
                val wl = pm.newWakeLock(
                    PowerManager.PROXIMITY_SCREEN_OFF_WAKE_LOCK,
                    "$TAG:proximity"
                )
                wl.setReferenceCounted(false)
                wl.acquire(60L * 60L * 1000L) // 1h safety cap
                proximityWakeLock = wl
            } else {
                proximityWakeLock?.let { if (it.isHeld) it.release() }
                proximityWakeLock = null
            }
        } catch (e: Exception) {
            Log.w(TAG, "setProximityMonitoringInternal($on) failed: ${e.message}")
        }
    }

    // ------------------------------------------------------------
    // Audio device routing internals (Step 13)
    // ------------------------------------------------------------

    private var commDeviceListener: AudioManager.OnCommunicationDeviceChangedListener? = null

    private fun audioDeviceTypeName(type: Int): String = when (type) {
        AudioDeviceInfo.TYPE_BUILTIN_SPEAKER -> "speaker"
        AudioDeviceInfo.TYPE_BUILTIN_EARPIECE -> "earpiece"
        AudioDeviceInfo.TYPE_WIRED_HEADSET,
        AudioDeviceInfo.TYPE_WIRED_HEADPHONES,
        AudioDeviceInfo.TYPE_USB_HEADSET -> "wired"
        AudioDeviceInfo.TYPE_BLUETOOTH_SCO,
        AudioDeviceInfo.TYPE_BLE_HEADSET -> "bluetooth"
        else -> "unknown"
    }

    private fun matchesType(deviceType: Int, target: String): Boolean = when (target) {
        "speaker" -> deviceType == AudioDeviceInfo.TYPE_BUILTIN_SPEAKER
        "earpiece" -> deviceType == AudioDeviceInfo.TYPE_BUILTIN_EARPIECE
        "wired" -> deviceType == AudioDeviceInfo.TYPE_WIRED_HEADSET ||
                   deviceType == AudioDeviceInfo.TYPE_WIRED_HEADPHONES ||
                   deviceType == AudioDeviceInfo.TYPE_USB_HEADSET
        "bluetooth" -> deviceType == AudioDeviceInfo.TYPE_BLUETOOTH_SCO ||
                       deviceType == AudioDeviceInfo.TYPE_BLE_HEADSET
        else -> false
    }

    private fun setAudioDeviceInternal(type: String): Boolean {
        val am = audioManager() ?: return false
        return try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                val device = am.availableCommunicationDevices.firstOrNull { matchesType(it.type, type) }
                if (device != null) {
                    am.setCommunicationDevice(device); true
                } else false
            } else {
                @Suppress("DEPRECATION")
                when (type) {
                    "speaker" -> { am.isSpeakerphoneOn = true; true }
                    "earpiece" -> { am.isSpeakerphoneOn = false; true }
                    "bluetooth" -> {
                        @Suppress("DEPRECATION")
                        try { am.startBluetoothSco(); am.isBluetoothScoOn = true; true } catch (_: Exception) { false }
                    }
                    "wired" -> { am.isSpeakerphoneOn = false; true }
                    else -> false
                }
            }
        } catch (e: Exception) {
            Log.w(TAG, "setAudioDeviceInternal($type) failed: ${e.message}")
            false
        }
    }

    /**
     * Subscribe to system communication-device changes (BT headset
     * connect/disconnect, wired plug/unplug) and emit "audio-device-changed"
     * to JS so call UIs can re-render the active route. API 31+ only;
     * older devices receive the initial state once on connect.
     */
    private fun registerAudioDeviceListener() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.S) {
            emitAudioDeviceState(); return
        }
        val am = audioManager() ?: return
        if (commDeviceListener != null) return
        try {
            val listener = AudioManager.OnCommunicationDeviceChangedListener { _ -> emitAudioDeviceState() }
            am.addOnCommunicationDeviceChangedListener(
                { r -> activity?.runOnUiThread(r) ?: r.run() },
                listener
            )
            commDeviceListener = listener
            emitAudioDeviceState()
        } catch (e: Exception) {
            Log.w(TAG, "registerAudioDeviceListener failed: ${e.message}")
        }
    }

    private fun unregisterAudioDeviceListener() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.S) return
        val am = audioManager() ?: return
        try {
            commDeviceListener?.let { am.removeOnCommunicationDeviceChangedListener(it) }
        } catch (_: Exception) {}
        commDeviceListener = null
    }

    private fun emitAudioDeviceState() {
        try {
            val am = audioManager() ?: return
            val list = org.json.JSONArray()
            var active = "unknown"
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                am.availableCommunicationDevices.forEach { d ->
                    val o = JSObject()
                    o.put("id", d.id)
                    o.put("type", audioDeviceTypeName(d.type))
                    o.put("name", d.productName?.toString() ?: audioDeviceTypeName(d.type))
                    list.put(o)
                }
                active = audioDeviceTypeName(am.communicationDevice?.type ?: -1)
            } else {
                @Suppress("DEPRECATION")
                active = if (am.isSpeakerphoneOn) "speaker" else "earpiece"
            }
            val data = JSObject()
            data.put("active", active)
            data.put("devices", list)
            notifyListeners("audio-device-changed", data)
        } catch (e: Exception) {
            Log.w(TAG, "emitAudioDeviceState failed: ${e.message}")
        }
    }
}
