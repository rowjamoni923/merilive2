package com.merilive.app.activity

import android.app.AlertDialog
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.graphics.Bitmap
import android.net.Uri
import android.os.Build
import android.provider.Settings
import android.util.Log
import android.view.View
import android.view.ViewGroup
import android.widget.Button
import android.widget.ImageView
import android.widget.LinearLayout
import android.widget.TextView
import androidx.core.content.ContextCompat
import com.merilive.app.R
import com.merilive.app.plugin.LiveKitPlugin
import com.merilive.app.plugin.ThermalBatteryPlugin
import com.merilive.app.rtc.RtcEngineManager
import io.livekit.android.renderer.TextureViewRenderer
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

/**
 * Pkg500 Phase H — Camera Resilience Controller
 *
 * Coordinator that lives inside PrivateCallActivity. Subscribes to:
 *   • LiveKitPlugin.ACTION_VIDEO_STALL  ("video-stall" / "video-stall-failed")
 *   • ThermalBatteryPlugin.ACTION_THERMAL_CHANGE (none → shutdown)
 *
 * Drives a small state machine over three overlay views:
 *   • freezeOverlay     — full-screen ImageView showing last good local frame
 *                         while in AUDIO_ONLY (Chamet/Bigo "last frame hold")
 *   • resilienceBanner  — persistent non-dismissible banner with icon + text
 *                         + optional Retry chip
 *   • remotePoorOverlay — small spinner on the remote tile when remote stalls
 *
 * State machine
 *   HEALTHY     → DEGRADED   on first video-stall (local or remote, "stalled")
 *   DEGRADED    → HEALTHY    on recovery (frame count resumes)
 *   DEGRADED    → AUDIO_ONLY on "video-stall-failed" for LOCAL track
 *               → AUDIO_ONLY on thermal SEVERE / CRITICAL
 *   AUDIO_ONLY  → RECOVERING when user taps Retry (3-attempt budget)
 *   RECOVERING  → HEALTHY    on success
 *               → AUDIO_ONLY on failure (banner re-shown)
 *
 * Permission-revoke handling:
 *   On Retry, if camera enable throws SecurityException OR
 *   ContextCompat.checkSelfPermission(CAMERA) == DENIED, show a
 *   MaterialAlertDialog with a deep-link to Application Details settings.
 *
 * All paths are best-effort + try/catch — controller never crashes the call.
 * Safe to instantiate on devices without LiveKit / ThermalBattery (no-op).
 */
class CameraResilienceController(
    private val activity: PrivateCallActivity,
    private val remoteVideoContainer: ViewGroup,
    private val localPreviewContainer: ViewGroup,
    private val freezeOverlay: ImageView,
    private val resilienceBanner: LinearLayout,
    private val resilienceText: TextView,
    private val resilienceRetry: Button,
    private val remotePoorOverlay: View,
    private val localRendererProvider: () -> TextureViewRenderer?,
) {

    companion object {
        private const val TAG = "CameraResilience"
        private const val MAX_RETRY_ATTEMPTS = 3
        private const val RETRY_CHIP_REVEAL_MS = 30_000L
    }

    enum class State { HEALTHY, DEGRADED, AUDIO_ONLY, RECOVERING }

    @Volatile private var state: State = State.HEALTHY
    @Volatile private var retryAttempts: Int = 0
    @Volatile private var lastThermalLabel: String = "none"
    @Volatile private var attached: Boolean = false

    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.Main)
    private var retryChipJob: Job? = null

    private var stallReceiver: BroadcastReceiver? = null
    private var thermalReceiver: BroadcastReceiver? = null

    fun attach() {
        if (attached) return
        attached = true
        try { registerStallReceiver() } catch (t: Throwable) { Log.w(TAG, "registerStallReceiver: ${t.message}") }
        try { registerThermalReceiver() } catch (t: Throwable) { Log.w(TAG, "registerThermalReceiver: ${t.message}") }
        resilienceRetry.setOnClickListener { onRetryTapped() }
        hideAll()
    }

    fun detach() {
        if (!attached) return
        attached = false
        try { stallReceiver?.let { activity.unregisterReceiver(it) } } catch (_: Throwable) {}
        try { thermalReceiver?.let { activity.unregisterReceiver(it) } } catch (_: Throwable) {}
        stallReceiver = null
        thermalReceiver = null
        retryChipJob?.cancel(); retryChipJob = null
        scope.cancel()
    }

    // ─────────── Broadcast receivers ───────────

    private fun registerStallReceiver() {
        val r = object : BroadcastReceiver() {
            override fun onReceive(c: Context?, i: Intent?) {
                i ?: return
                val isLocal = i.getBooleanExtra("isLocal", false)
                val st = i.getStringExtra("state").orEmpty()
                onStall(isLocal, st)
            }
        }
        val f = IntentFilter(LiveKitPlugin.ACTION_VIDEO_STALL)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            activity.registerReceiver(r, f, Context.RECEIVER_NOT_EXPORTED)
        } else {
            @Suppress("UnspecifiedRegisterReceiverFlag")
            activity.registerReceiver(r, f)
        }
        stallReceiver = r
    }

    private fun registerThermalReceiver() {
        val r = object : BroadcastReceiver() {
            override fun onReceive(c: Context?, i: Intent?) {
                i ?: return
                val label = i.getStringExtra("status").orEmpty().ifEmpty { "none" }
                onThermal(label)
            }
        }
        val f = IntentFilter(ThermalBatteryPlugin.ACTION_THERMAL_CHANGE)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            activity.registerReceiver(r, f, Context.RECEIVER_NOT_EXPORTED)
        } else {
            @Suppress("UnspecifiedRegisterReceiverFlag")
            activity.registerReceiver(r, f)
        }
        thermalReceiver = r
    }

    // ─────────── Event handlers ───────────

    private fun onStall(isLocal: Boolean, stallState: String) {
        when (stallState) {
            "stalled" -> {
                if (state == State.HEALTHY) state = State.DEGRADED
                if (isLocal) {
                    // Local stall: subtle indicator — LiveKitPlugin is already
                    // attempting soft recovery. We don't freeze yet; one-shot
                    // hiccups recover within 1-2 s and a freeze flash is jarring.
                    showBannerSubtle("Camera reconnecting…", showRetry = false)
                } else {
                    remotePoorOverlay.visibility = View.VISIBLE
                }
            }
            "failed" -> {
                if (isLocal) enterAudioOnly(reason = "Camera unavailable — audio only")
                else {
                    // Remote permanent failure: keep spinner, show banner.
                    remotePoorOverlay.visibility = View.VISIBLE
                    showBannerPersistent("Peer's camera is unavailable", showRetry = false)
                }
            }
            // Any other state (e.g. plugin emits "recovered" in future) →
            // best-effort: if we were degraded, soft-clear.
            else -> if (state == State.DEGRADED) softRecover()
        }
    }

    private fun onThermal(label: String) {
        lastThermalLabel = label
        when (label) {
            "severe", "critical", "emergency", "shutdown" -> {
                // Proactively cut camera before OS yanks it.
                enterAudioOnly(reason = "Phone overheating — camera paused")
            }
            "moderate" -> {
                // Subtle banner only; don't force audio-only yet. LiveKit
                // publisher ladder will adapt resolution automatically.
                if (state == State.HEALTHY) {
                    showBannerSubtle("Reducing quality to cool down", showRetry = false)
                }
            }
            "none", "light" -> {
                // Thermal recovered. If we entered AUDIO_ONLY purely due to
                // heat, auto-attempt a retry once. Otherwise leave UI alone.
                if (state == State.AUDIO_ONLY && retryAttempts == 0) {
                    onRetryTapped()
                }
            }
        }
    }

    // ─────────── State transitions ───────────

    private fun enterAudioOnly(reason: String) {
        if (state == State.AUDIO_ONLY) {
            // Update the banner text in case the reason changed (thermal vs camera).
            resilienceText.text = reason
            return
        }
        state = State.AUDIO_ONLY
        captureLastFrameAndFreeze()
        showBannerPersistent(reason, showRetry = false)
        // Disable camera at the LiveKit layer (best-effort).
        scope.launch {
            try {
                val room = RtcEngineManager.currentRoom() ?: return@launch
                withContext(Dispatchers.IO) {
                    try { room.localParticipant.setCameraEnabled(false) } catch (_: Throwable) {}
                }
            } catch (_: Throwable) {}
        }
        // After 30 s, surface the Retry chip so the user can try again.
        retryChipJob?.cancel()
        retryChipJob = scope.launch {
            delay(RETRY_CHIP_REVEAL_MS)
            if (state == State.AUDIO_ONLY) {
                resilienceRetry.visibility = View.VISIBLE
            }
        }
    }

    private fun softRecover() {
        if (state == State.HEALTHY) return
        state = State.HEALTHY
        hideAll()
    }

    private fun onRetryTapped() {
        if (state == State.RECOVERING) return
        if (retryAttempts >= MAX_RETRY_ATTEMPTS) {
            showBannerPersistent("Camera unavailable for this call", showRetry = false)
            return
        }
        // Permission gate first — mid-call requestPermissions is auto-denied
        // on MIUI/ColorOS, so deep-link straight to settings if revoked.
        val perm = ContextCompat.checkSelfPermission(activity, android.Manifest.permission.CAMERA)
        if (perm != android.content.pm.PackageManager.PERMISSION_GRANTED) {
            showPermissionRevokeDialog()
            return
        }
        retryAttempts++
        state = State.RECOVERING
        resilienceText.text = "Trying camera…"
        resilienceRetry.visibility = View.GONE
        scope.launch {
            val ok = tryEnableCamera()
            if (ok) {
                state = State.HEALTHY
                clearFreeze()
                hideAll()
            } else {
                // Back to audio-only; chip re-shows after the next 30s window.
                state = State.AUDIO_ONLY
                showBannerPersistent("Camera still unavailable", showRetry = false)
                retryChipJob?.cancel()
                retryChipJob = scope.launch {
                    delay(RETRY_CHIP_REVEAL_MS)
                    if (state == State.AUDIO_ONLY && retryAttempts < MAX_RETRY_ATTEMPTS) {
                        resilienceRetry.visibility = View.VISIBLE
                    }
                }
            }
        }
    }

    private suspend fun tryEnableCamera(): Boolean {
        return try {
            val room = RtcEngineManager.currentRoom() ?: return false
            withContext(Dispatchers.IO) {
                try {
                    room.localParticipant.setCameraEnabled(true)
                    true
                } catch (se: SecurityException) {
                    Log.w(TAG, "tryEnableCamera SecurityException: ${se.message}")
                    false
                } catch (t: Throwable) {
                    Log.w(TAG, "tryEnableCamera failed: ${t.message}")
                    false
                }
            }
        } catch (_: Throwable) { false }
    }

    private fun showPermissionRevokeDialog() {
        try {
            AlertDialog.Builder(activity)
                .setTitle("Camera permission revoked")
                .setMessage(
                    "This call needs camera access. Open settings and re-enable Camera permission for this app."
                )
                .setPositiveButton("Open settings") { d, _ ->
                    try {
                        val i = Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS).apply {
                            data = Uri.fromParts("package", activity.packageName, null)
                            addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                        }
                        activity.startActivity(i)
                    } catch (_: Throwable) {}
                    d.dismiss()
                }
                .setNegativeButton("Continue audio only") { d, _ -> d.dismiss() }
                .setCancelable(true)
                .show()
        } catch (t: Throwable) {
            Log.w(TAG, "showPermissionRevokeDialog: ${t.message}")
        }
    }

    // ─────────── UI helpers ───────────

    private fun showBannerSubtle(text: String, showRetry: Boolean) {
        resilienceBanner.visibility = View.VISIBLE
        resilienceBanner.alpha = 0.85f
        resilienceText.text = text
        resilienceRetry.visibility = if (showRetry) View.VISIBLE else View.GONE
    }

    private fun showBannerPersistent(text: String, showRetry: Boolean) {
        resilienceBanner.visibility = View.VISIBLE
        resilienceBanner.alpha = 1f
        resilienceText.text = text
        resilienceRetry.visibility = if (showRetry) View.VISIBLE else View.GONE
    }

    private fun hideAll() {
        resilienceBanner.visibility = View.GONE
        resilienceRetry.visibility = View.GONE
        remotePoorOverlay.visibility = View.GONE
    }

    private fun captureLastFrameAndFreeze() {
        try {
            val r = localRendererProvider() ?: return
            // LiveKit's TextureViewRenderer extends android.view.TextureView,
            // so getBitmap() returns the last rendered frame at near-zero cost.
            val tv = r as? android.view.TextureView ?: return
            val w = tv.width.coerceAtMost(360)
            val h = tv.height.coerceAtMost(640)
            if (w <= 0 || h <= 0) return
            val bmp: Bitmap? = try { tv.getBitmap(w, h) } catch (_: Throwable) { null }
            if (bmp != null) {
                freezeOverlay.setImageBitmap(bmp)
                freezeOverlay.visibility = View.VISIBLE
            }
        } catch (t: Throwable) {
            Log.w(TAG, "captureLastFrameAndFreeze: ${t.message}")
        }
    }


    private fun clearFreeze() {
        freezeOverlay.visibility = View.GONE
        freezeOverlay.setImageBitmap(null)
    }
}
