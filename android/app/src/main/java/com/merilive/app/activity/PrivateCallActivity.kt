package com.merilive.app.activity

import android.app.KeyguardManager
import android.content.Context
import android.content.Intent
import android.graphics.Color
import android.net.ConnectivityManager
import android.net.Network
import android.net.NetworkCapabilities
import android.os.Build
import android.os.Bundle
import android.util.Log
import android.view.View
import android.view.ViewGroup
import android.view.WindowManager
import android.widget.Button
import android.widget.FrameLayout
import android.widget.ImageButton
import android.widget.ImageView
import android.widget.TextView
import androidx.activity.ComponentActivity
import androidx.activity.OnBackPressedCallback
import androidx.activity.viewModels
import androidx.core.view.WindowCompat
import androidx.core.view.WindowInsetsCompat
import androidx.core.view.WindowInsetsControllerCompat
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.lifecycleScope
import androidx.lifecycle.repeatOnLifecycle
import com.merilive.app.R
import io.livekit.android.renderer.TextureViewRenderer
import io.livekit.android.room.track.VideoTrack
import kotlinx.coroutines.launch


/**
 * Pkg500 Phase A — PrivateCallActivity (scaffold)
 *
 * Native in-call surface for 1:1 paid video calls (Chamet/Bigo class). Phase A
 * scope is foundation only: window flags, intent parsing, layout binding,
 * ViewModel wiring, end-call handling. NO LiveKit, NO camera, NO billing yet —
 * those land in B/C/D so each phase ships a reviewable, focused diff and we
 * never carry half-wired media code in tree.
 *
 * Window-flag policy (research-locked):
 *  - showWhenLocked + turnScreenOn (API 27+ programmatic, manifest fallback)
 *    so an accepted call surfaces over the lock screen instantly.
 *  - FLAG_KEEP_SCREEN_ON applied to the window, NOT a WakeLock — scoped to
 *    the Activity lifecycle, cleared automatically on finish().
 *  - FLAG_SECURE blocks screenshots, screen-cast, and MediaProjection capture
 *    of the entire Activity surface. Set BEFORE setContentView so the very
 *    first frame is protected.
 *  - Edge-to-edge layout so the LiveKit video surface (Phase B) can extend
 *    behind the status/navigation bars.
 *
 * Intent contract (caller is responsible for filling all of these):
 *   call_id          String  — Supabase private_calls.id
 *   peer_id          String  — the OTHER side's profile id (host id for caller,
 *                              caller id for host)
 *   peer_name        String
 *   peer_avatar      String? — URL, optional
 *   is_caller        Boolean — true on the user side, false on the host side
 *   livekit_url      String  — wss://livekit.merilive.xyz (self-hosted)
 *   livekit_token    String  — short-TTL token issued by `livekit-token-issue`
 *
 * Activity lifecycle promises:
 *  - configuration changes (rotate/keyboard/density) are absorbed by the
 *    manifest declaration; Activity is NOT recreated, ViewModel persists.
 *  - onDestroy never tears down the Room directly — it lets ViewModel.onCleared
 *    handle disconnect, so we don't double-disconnect on process death races.
 *  - Back press shows a confirm dialog stub (Phase E expands to "End call?").
 */
class PrivateCallActivity : ComponentActivity() {

    companion object {
        private const val TAG = "PrivateCallActivity"

        const val EXTRA_CALL_ID = "call_id"
        const val EXTRA_PEER_ID = "peer_id"
        const val EXTRA_PEER_NAME = "peer_name"
        const val EXTRA_PEER_AVATAR = "peer_avatar"

        const val EXTRA_IS_CALLER = "is_caller"
        const val EXTRA_LIVEKIT_URL = "livekit_url"
        const val EXTRA_LIVEKIT_TOKEN = "livekit_token"

        /** Convenience builder used by NativeCallPlugin (Phase B) and tests. */
        fun newIntent(
            ctx: Context,
            callId: String,
            peerId: String,
            peerName: String,
            peerAvatar: String?,
            isCaller: Boolean,
            livekitUrl: String,
            livekitToken: String,
        ): Intent = Intent(ctx, PrivateCallActivity::class.java).apply {
            putExtra(EXTRA_CALL_ID, callId)
            putExtra(EXTRA_PEER_ID, peerId)
            putExtra(EXTRA_PEER_NAME, peerName)
            putExtra(EXTRA_PEER_AVATAR, peerAvatar)
            putExtra(EXTRA_IS_CALLER, isCaller)
            putExtra(EXTRA_LIVEKIT_URL, livekitUrl)
            putExtra(EXTRA_LIVEKIT_TOKEN, livekitToken)
            // singleTask + new task: never piggyback on MainActivity's task.
            addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        }
    }

    private val vm: PrivateCallViewModel by viewModels()

    // --- View refs (bound once in onCreate) ----------------------------------
    private lateinit var remoteVideoContainer: FrameLayout
    private lateinit var localPreviewContainer: FrameLayout
    private lateinit var tvPeerName: TextView
    private lateinit var tvCallState: TextView
    private lateinit var tvDuration: TextView
    private lateinit var tvBalance: TextView
    private lateinit var ivPeerAvatar: ImageView
    private lateinit var btnMic: ImageButton
    private lateinit var btnSpeaker: ImageButton
    private lateinit var btnFlip: ImageButton
    private lateinit var btnBeauty: ImageButton
    private lateinit var btnGift: ImageButton
    private lateinit var btnEnd: ImageButton
    private lateinit var signalBars: Array<View>

    // Phase E — overlay views toggled in PIP mode.
    private lateinit var topOverlay: View
    private lateinit var bottomBar: View

    // Phase D — low-balance warning banner.
    private lateinit var lowBalanceBannerSlot: View
    private lateinit var lowBalanceText: TextView
    private lateinit var btnRecharge: Button

    // Phase E — audio routing helper.
    private var audioRouter: CallAudioRouter? = null
    @Volatile private var speakerOn: Boolean = true
    @Volatile private var inPipMode: Boolean = false

    // Honest-private-call fix (L-8) — Proximity wakelock for earpiece mode.
    // AOSP InCallUI pattern: acquire PROXIMITY_SCREEN_OFF_WAKE_LOCK while the
    // call is connected and the user is on earpiece (speaker OFF, no BT/wired).
    // Release when routed to speaker/BT/wired or when the call ends so the
    // screen doesn't stay blanked. Null-safe on devices without the sensor.
    private var proximityWakeLock: android.os.PowerManager.WakeLock? = null

    private var connectivityManager: ConnectivityManager? = null
    private var networkCallback: ConnectivityManager.NetworkCallback? = null

    // Phase H — camera resilience controller (last-frame freeze, audio-only
    // fallback banner, thermal-aware throttling, permission-revoke deep link).
    private var resilienceController: CameraResilienceController? = null



    // Phase B — renderers + track refs (managed alongside lifecycle).
    private var remoteRenderer: TextureViewRenderer? = null
    private var localRenderer: TextureViewRenderer? = null
    private var attachedRemoteTrack: VideoTrack? = null
    private var attachedLocalTrack: VideoTrack? = null

    // Phase B — JS / server-side "close this Activity" signal.
    private var closeReceiver: android.content.BroadcastReceiver? = null
    // Phase D — JS pushes billing updates (balance + rate per minute).
    private var billingReceiver: android.content.BroadcastReceiver? = null
    // Phase G — JS asks us to exit PIP + come back to the foreground.
    private var resumeReceiver: android.content.BroadcastReceiver? = null

    override fun onCreate(savedInstanceState: Bundle?) {
        // Window flags BEFORE super so the first frame is already protected.
        applyWindowFlags()
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_private_call)
        enableEdgeToEdge()
        bindViews()

        if (!parseIntentInto(vm)) {
            // Missing required extras = caller bug; bail safely instead of
            // sitting on a black screen forever.
            finishAndRemoveTask()
            return
        }

        // Phase B — adopt the Room that LiveKitPlugin already connected.
        if (!vm.attachToCurrentRoom(applicationContext)) {
            Log.w(TAG, "no active LiveKit Room — finishing")
            finishAndRemoveTask()
            return
        }

        registerCloseReceiver()
        registerBillingReceiver()
        registerResumeReceiver()
        wireUiToViewModel()
        startNetworkQualityIndicator()
        wireBackPress()
        attachResilienceController()

        // Phase 2 — tell JS the native call window is now in front so the
        // React-side #root hide hack stops applying.
        com.merilive.app.plugin.NativeCallPlugin.broadcastWindowState(
            applicationContext, vm.identity.value?.callId, "opened"
        )
    }

    /** Pkg500 Phase H — instantiate + attach the camera resilience controller. */
    private fun attachResilienceController() {
        try {
            val freeze = findViewById<ImageView>(R.id.privateCallFreezeOverlay)
            val banner = findViewById<android.widget.LinearLayout>(R.id.privateCallResilienceBanner)
            val text = findViewById<TextView>(R.id.privateCallResilienceText)
            val retry = findViewById<Button>(R.id.privateCallResilienceRetry)
            val poor = findViewById<View>(R.id.privateCallRemotePoorOverlay)
            resilienceController = CameraResilienceController(
                activity = this,
                remoteVideoContainer = remoteVideoContainer,
                localPreviewContainer = localPreviewContainer,
                freezeOverlay = freeze,
                resilienceBanner = banner,
                resilienceText = text,
                resilienceRetry = retry,
                remotePoorOverlay = poor,
                localRendererProvider = { localRenderer },
            ).also { it.attach() }
        } catch (t: Throwable) {
            Log.w(TAG, "attachResilienceController: ${t.message}")
        }
    }

    private fun registerCloseReceiver() {
        val r = object : android.content.BroadcastReceiver() {
            override fun onReceive(ctx: Context?, intent: Intent?) {
                val incomingCallId = intent?.getStringExtra("call_id").orEmpty()
                val myCallId = vm.identity.value?.callId.orEmpty()
                // Empty incoming id = "close any active call activity"
                if (incomingCallId.isEmpty() || incomingCallId == myCallId) {
                    vm.markEnding("remote_close")
                    vm.markEnded()
                }
            }
        }
        val filter = android.content.IntentFilter(
            com.merilive.app.plugin.NativeCallPlugin.ACTION_CLOSE_PRIVATE_CALL_ACTIVITY
        )
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            registerReceiver(r, filter, Context.RECEIVER_NOT_EXPORTED)
        } else {
            @Suppress("UnspecifiedRegisterReceiverFlag")
            registerReceiver(r, filter)
        }
        closeReceiver = r
    }

    /**
     * Pkg500 Phase D — JS pushes balance + per-minute rate every time the
     * server bills another minute, the caller recharges, or rates change.
     * We accept the update only when the call_id matches ours so a stale
     * push from a previous call can't corrupt the banner.
     */
    private fun registerBillingReceiver() {
        val r = object : android.content.BroadcastReceiver() {
            override fun onReceive(ctx: Context?, intent: Intent?) {
                intent ?: return
                val callId = intent.getStringExtra("call_id").orEmpty()
                val myCallId = vm.identity.value?.callId.orEmpty()
                if (callId.isNotEmpty() && myCallId.isNotEmpty() && callId != myCallId) return
                val balance = intent.getLongExtra("balance", -1L)
                val rate = intent.getIntExtra("rate_per_minute", -1)
                if (balance < 0 || rate < 0) return
                vm.setBilling(balance, rate)
            }
        }
        val filter = android.content.IntentFilter(
            com.merilive.app.plugin.NativeCallPlugin.ACTION_UPDATE_BILLING
        )
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            registerReceiver(r, filter, Context.RECEIVER_NOT_EXPORTED)
        } else {
            @Suppress("UnspecifiedRegisterReceiverFlag")
            registerReceiver(r, filter)
        }
        billingReceiver = r
    }

    /**
     * Pkg500 Phase G — JS-side asks the call surface to come back to the
     * foreground after an inline sheet (gift, recharge) closes. We exit
     * PIP (if we're in it) and re-launch our own task so we land on top
     * of the WebView again, restoring the fullscreen call.
     */
    private fun registerResumeReceiver() {
        val r = object : android.content.BroadcastReceiver() {
            override fun onReceive(ctx: Context?, intent: Intent?) {
                try {
                    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O &&
                        inPipMode
                    ) {
                        // The official way to leave PIP is to restart the
                        // activity in standard mode via a fresh intent.
                        val i = Intent(this@PrivateCallActivity, PrivateCallActivity::class.java)
                            .addFlags(
                                Intent.FLAG_ACTIVITY_SINGLE_TOP
                                    or Intent.FLAG_ACTIVITY_REORDER_TO_FRONT
                            )
                        startActivity(i)
                    } else {
                        moveTaskToFront()
                    }
                } catch (t: Throwable) {
                    Log.w(TAG, "resumeReceiver: ${t.message}")
                }
            }
        }
        val filter = android.content.IntentFilter(
            com.merilive.app.plugin.NativeCallPlugin.ACTION_RESUME_PRIVATE_CALL
        )
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            registerReceiver(r, filter, Context.RECEIVER_NOT_EXPORTED)
        } else {
            @Suppress("UnspecifiedRegisterReceiverFlag")
            registerReceiver(r, filter)
        }
        resumeReceiver = r
    }

    private fun moveTaskToFront() {
        try {
            val am = getSystemService(Context.ACTIVITY_SERVICE)
                as? android.app.ActivityManager
            am?.moveTaskToFront(taskId, 0)
        } catch (t: Throwable) {
            Log.w(TAG, "moveTaskToFront: ${t.message}")
        }
    }

    /**
     * Pkg500 Phase D — Recharge CTA. Broadcasts a request back out so JS
     * (NativeCallPlugin listener) can open the existing recharge sheet.
     * The Activity intentionally stays in foreground; the sheet is opened
     * by JS via the WebView lifecycle behind it.
     */
    private fun onRechargeRequested() {
        try {
            val callId = vm.identity.value?.callId.orEmpty()
            val i = Intent(com.merilive.app.plugin.NativeCallPlugin.ACTION_RECHARGE_REQUESTED).apply {
                setPackage(packageName)
                putExtra("call_id", callId)
            }
            sendBroadcast(i)
        } catch (t: Throwable) {
            Log.w(TAG, "onRechargeRequested: ${t.message}")
        }
    }



    private fun applyWindowFlags() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O_MR1) {
            setShowWhenLocked(true)
            setTurnScreenOn(true)
            (getSystemService(Context.KEYGUARD_SERVICE) as? KeyguardManager)
                ?.requestDismissKeyguard(this, null)
        } else {
            @Suppress("DEPRECATION")
            window.addFlags(
                WindowManager.LayoutParams.FLAG_SHOW_WHEN_LOCKED
                    or WindowManager.LayoutParams.FLAG_TURN_SCREEN_ON
                    or WindowManager.LayoutParams.FLAG_DISMISS_KEYGUARD
            )
        }

        // Keep the screen on while this Activity is in foreground; cleared on finish().
        window.addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON)

        // Block screenshots / screen-cast / MediaProjection capture.
        window.setFlags(
            WindowManager.LayoutParams.FLAG_SECURE,
            WindowManager.LayoutParams.FLAG_SECURE
        )
    }

    private fun enableEdgeToEdge() {
        WindowCompat.setDecorFitsSystemWindows(window, false)
        val controller = WindowInsetsControllerCompat(window, window.decorView)
        controller.systemBarsBehavior =
            WindowInsetsControllerCompat.BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE
        controller.hide(WindowInsetsCompat.Type.statusBars())
        // Keep navigation bar visible so the End button isn't gestured-away by accident.
    }

    private fun bindViews() {
        remoteVideoContainer = findViewById(R.id.privateCallRemoteVideo)
        localPreviewContainer = findViewById(R.id.privateCallLocalPreview)
        tvPeerName = findViewById(R.id.privateCallPeerName)
        tvCallState = findViewById(R.id.privateCallState)
        tvDuration = findViewById(R.id.privateCallDuration)
        tvBalance = findViewById(R.id.privateCallBalance)
        ivPeerAvatar = findViewById(R.id.privateCallPeerAvatar)
        btnMic = findViewById(R.id.privateCallBtnMic)
        btnSpeaker = findViewById(R.id.privateCallBtnSpeaker)
        btnFlip = findViewById(R.id.privateCallBtnFlip)
        btnBeauty = findViewById(R.id.privateCallBtnBeauty)
        btnGift = findViewById(R.id.privateCallBtnGift)
        btnEnd = findViewById(R.id.privateCallBtnEnd)
        signalBars = arrayOf(
            findViewById(R.id.privateCallSignalBar1),
            findViewById(R.id.privateCallSignalBar2),
            findViewById(R.id.privateCallSignalBar3),
            findViewById(R.id.privateCallSignalBar4),
        )
        topOverlay = findViewById(R.id.privateCallTopOverlay)
        bottomBar = findViewById(R.id.privateCallBottomBar)
        lowBalanceBannerSlot = findViewById(R.id.privateCallLowBalanceSlot)
        lowBalanceText = findViewById(R.id.privateCallLowBalanceText)
        btnRecharge = findViewById(R.id.privateCallBtnRecharge)
        btnRecharge.setOnClickListener { onRechargeRequested() }

        // Phase E — initialise audio router. Default to speakerphone ON for a
        // video call (Chamet/WhatsApp pattern). External devices override.
        audioRouter = CallAudioRouter(applicationContext).also {
            speakerOn = it.attach(defaultSpeakerOn = true)
            renderSpeakerButton()
        }

        btnMic.setOnClickListener {
            val on = vm.toggleMic()
            btnMic.isSelected = !on
            btnMic.contentDescription = if (on) "Mute microphone" else "Unmute microphone"
        }
        btnSpeaker.setOnClickListener {
            val next = !speakerOn
            speakerOn = audioRouter?.applySpeaker(next) ?: next
            renderSpeakerButton()
            // L-8: proximity wakelock follows the audio route — on for earpiece,
            // off for speaker/BT/wired. Avoids screen-blank when face is far.
            updateProximityWakeLock()
        }

        btnFlip.setOnClickListener { vm.flipCamera() }
        btnBeauty.visibility = View.GONE
        btnBeauty.setOnClickListener(null)
        btnGift.setOnClickListener {
            // Pkg500 Phase G — inline in-call gift sheet.
            //  1) Broadcast gift_inline → JS GlobalCallGiftSheet opens
            //  2) Enter PIP so the call shrinks to a floating window
            //  3) Bring MainActivity (WebView) to the front so the sheet
            //     is visible. JS calls resumeInCallActivity() when the
            //     sheet closes and the call expands back to fullscreen.
            try {
                val callId = vm.identity.value?.callId.orEmpty()
                val peerId = vm.identity.value?.peerId.orEmpty()
                val i = Intent(com.merilive.app.plugin.NativeCallPlugin.ACTION_CALL_END_ACTION).apply {
                    setPackage(packageName)
                    putExtra("call_id", callId)
                    putExtra("peer_id", peerId)
                    putExtra("action", "gift_inline")
                }
                sendBroadcast(i)
            } catch (_: Throwable) {}
            enterPipForInlineSheet()
            bringMainTaskToFront()
        }
        btnEnd.setOnClickListener { onUserRequestedEnd() }
    }

    /** Pkg500 Phase G — enter PIP for an inline sheet handoff (gift, recharge). */
    private fun enterPipForInlineSheet() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O || inPipMode) return
        val st = vm.state.value
        if (st != PrivateCallViewModel.CallState.CONNECTED &&
            st != PrivateCallViewModel.CallState.RECONNECTING
        ) return
        runCatching { enterPictureInPictureMode(buildPipParams()) }
    }

    /** Pkg500 Phase G — surface MainActivity (WebView) on top of PIP. */
    private fun bringMainTaskToFront() {
        try {
            val launch = packageManager.getLaunchIntentForPackage(packageName)
                ?: return
            launch.addFlags(
                Intent.FLAG_ACTIVITY_NEW_TASK
                    or Intent.FLAG_ACTIVITY_REORDER_TO_FRONT
                    or Intent.FLAG_ACTIVITY_SINGLE_TOP
            )
            startActivity(launch)
        } catch (t: Throwable) {
            Log.w(TAG, "bringMainTaskToFront: ${t.message}")
        }
    }

    private fun renderSpeakerButton() {
        btnSpeaker.isSelected = !speakerOn
        btnSpeaker.alpha = if (speakerOn) 1.0f else 0.55f
        btnSpeaker.contentDescription =
            if (speakerOn) "Switch to earpiece" else "Switch to speaker"
    }

    private fun parseIntentInto(vm: PrivateCallViewModel): Boolean {
        val i = intent ?: return false
        val callId = i.getStringExtra(EXTRA_CALL_ID).orEmpty()
        val peerId = i.getStringExtra(EXTRA_PEER_ID).orEmpty()
        val token = i.getStringExtra(EXTRA_LIVEKIT_TOKEN).orEmpty()
        val url = i.getStringExtra(EXTRA_LIVEKIT_URL).orEmpty()
        if (callId.isEmpty() || peerId.isEmpty() || token.isEmpty() || url.isEmpty()) {
            return false
        }
        vm.bindIdentity(
            PrivateCallViewModel.CallIdentity(
                callId = callId,
                peerId = peerId,
                peerName = i.getStringExtra(EXTRA_PEER_NAME).orEmpty().ifEmpty { "Calling…" },
                peerAvatar = i.getStringExtra(EXTRA_PEER_AVATAR),
                isCaller = i.getBooleanExtra(EXTRA_IS_CALLER, true),
                livekitUrl = url,
                livekitToken = token,
            )
        )
        return true
    }

    private fun wireUiToViewModel() {
        lifecycleScope.launch {
            repeatOnLifecycle(Lifecycle.State.STARTED) {
                launch {
                    vm.identity.collect { id ->
                        id ?: return@collect
                        tvPeerName.text = id.peerName
                        // Phase A: avatar load left as a stub; reuse
                        // IncomingCallActivity's bitmap loader in Phase B to
                        // avoid an extra image-lib dep here.
                    }
                }
                launch {
                    vm.state.collect { st ->
                        tvCallState.text = when (st) {
                            PrivateCallViewModel.CallState.IDLE -> "Preparing…"
                            PrivateCallViewModel.CallState.CONNECTING -> "Connecting…"
                            PrivateCallViewModel.CallState.CONNECTED -> ""
                            PrivateCallViewModel.CallState.RECONNECTING -> "Reconnecting…"
                            PrivateCallViewModel.CallState.ENDING -> "Ending…"
                            PrivateCallViewModel.CallState.ENDED -> "Call ended"
                        }
                        tvCallState.visibility =
                            if (tvCallState.text.isNullOrEmpty()) View.GONE else View.VISIBLE
                        // L-8: re-evaluate proximity wakelock on every state
                        // change (CONNECTING→CONNECTED arms it on earpiece,
                        // any→ENDED releases it).
                        updateProximityWakeLock()

                        if (st == PrivateCallViewModel.CallState.ENDED) {
                            // Phase E — slide in the post-call summary screen
                            // (duration / coins / rating / gift / recharge)
                            // before finishing the in-call surface.
                            launchEndScreenAndFinish()
                        }
                    }
                }
                launch {
                    vm.durationSec.collect { sec ->
                        tvDuration.text = formatDuration(sec)
                    }
                }
                launch {
                    vm.balanceCoins.collect { coins ->
                        tvBalance.text = coins?.let { "$it coins" } ?: ""
                        tvBalance.visibility =
                            if (tvBalance.text.isNullOrEmpty()) View.INVISIBLE else View.VISIBLE
                    }
                }
                launch {
                    vm.micEnabled.collect { on -> btnMic.isSelected = !on }
                }
                launch {
                    vm.cameraEnabled.collect { on ->
                        btnFlip.isEnabled = on
                        localPreviewContainer.visibility =
                            if (on) View.VISIBLE else View.INVISIBLE
                    }
                }
                // Phase B — mount remote / local video tracks into their
                // TextureViewRenderers as soon as the ViewModel sees them.
                launch {
                    vm.remoteVideo.collect { track -> attachRemote(track) }
                }
                launch {
                    vm.localVideo.collect { track -> attachLocal(track) }
                }
                // Phase D — low-balance banner. Reacts to warningLevel +
                // secondsRemaining flows so the countdown ticks every second.
                launch {
                    vm.warningLevel.collect { lvl -> renderLowBalanceBanner(lvl) }
                }
                launch {
                    vm.secondsRemaining.collect { _ ->
                        renderLowBalanceBanner(vm.warningLevel.value)
                    }
                }
            }
        }
    }

    private fun renderLowBalanceBanner(level: PrivateCallViewModel.WarningLevel) {
        val secs = vm.secondsRemaining.value
        if (level == PrivateCallViewModel.WarningLevel.NONE) {
            lowBalanceBannerSlot.visibility = View.GONE
            return
        }
        lowBalanceBannerSlot.visibility = View.VISIBLE
        lowBalanceText.text = when (level) {
            PrivateCallViewModel.WarningLevel.CRITICAL -> "Balance empty — call will end"
            PrivateCallViewModel.WarningLevel.TEN -> "Only ${secs ?: 0}s left — recharge now"
            PrivateCallViewModel.WarningLevel.THIRTY -> "Low balance: ${secs ?: 0}s remaining"
            PrivateCallViewModel.WarningLevel.SIXTY -> "About 1 minute of balance left"
            else -> ""
        }
    }

    // ------------------------------------------------------------------
    // Phase B — TextureViewRenderer lifecycle
    // ------------------------------------------------------------------

    private fun ensureRemoteRenderer(): TextureViewRenderer {
        remoteRenderer?.let { return it }
        val r = TextureViewRenderer(this).apply {
            setEnableHardwareScaler(true)
            setScalingType(org.webrtc.RendererCommon.ScalingType.SCALE_ASPECT_FIT)
        }
        remoteVideoContainer.addView(
            r,
            ViewGroup.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.MATCH_PARENT,
            ),
        )
        remoteRenderer = r
        return r
    }

    private fun ensureLocalRenderer(): TextureViewRenderer {
        localRenderer?.let { return it }
        val r = TextureViewRenderer(this).apply {
            setEnableHardwareScaler(true)
            // Keep the full local frame visible; never crop/zoom in calls.
            setScalingType(org.webrtc.RendererCommon.ScalingType.SCALE_ASPECT_FIT)
            setMirror(true) // selfie convention
        }
        localPreviewContainer.addView(
            r,
            ViewGroup.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT,
                ViewGroup.LayoutParams.MATCH_PARENT,
            ),
        )
        localRenderer = r
        return r
    }

    private fun attachRemote(track: VideoTrack?) {
        // Detach previous if changed (or cleared).
        attachedRemoteTrack?.let { prev ->
            if (prev !== track) {
                runCatching { remoteRenderer?.let { prev.removeRenderer(it) } }
                attachedRemoteTrack = null
            }
        }
        if (track == null) return
        val r = ensureRemoteRenderer()
        initRendererForActiveRoom(r, "remote")
        if (attachedRemoteTrack === track) return
        try {
            track.addRenderer(r)
            attachedRemoteTrack = track
        } catch (t: Throwable) {
            Log.w(TAG, "attachRemote: ${t.message}")
        }
    }

    private fun attachLocal(track: VideoTrack?) {
        attachedLocalTrack?.let { prev ->
            if (prev !== track) {
                runCatching { localRenderer?.let { prev.removeRenderer(it) } }
                attachedLocalTrack = null
            }
        }
        if (track == null) return
        val r = ensureLocalRenderer()
        initRendererForActiveRoom(r, "local")
        if (attachedLocalTrack === track) return
        try {
            track.addRenderer(r)
            attachedLocalTrack = track
        } catch (t: Throwable) {
            Log.w(TAG, "attachLocal: ${t.message}")
        }
    }

    private fun initRendererForActiveRoom(renderer: TextureViewRenderer, label: String) {
        val room = com.merilive.app.rtc.RtcEngineManager.currentRoom()
        if (room == null) {
            Log.w(TAG, "initVideoRenderer($label): no active Room")
            return
        }
        try {
            room.initVideoRenderer(renderer)
        } catch (e: IllegalStateException) {
            Log.d(TAG, "initVideoRenderer($label): already initialized")
        } catch (t: Throwable) {
            Log.w(TAG, "initVideoRenderer($label): ${t.message}")
        }
    }

    private fun detachAllRenderers(release: Boolean) {
        runCatching {
            attachedRemoteTrack?.let { t -> remoteRenderer?.let { t.removeRenderer(it) } }
        }
        runCatching {
            attachedLocalTrack?.let { t -> localRenderer?.let { t.removeRenderer(it) } }
        }
        attachedRemoteTrack = null
        attachedLocalTrack = null
        if (release) {
            runCatching { remoteRenderer?.release() }
            runCatching { localRenderer?.release() }
            (remoteRenderer?.parent as? ViewGroup)?.removeView(remoteRenderer)
            (localRenderer?.parent as? ViewGroup)?.removeView(localRenderer)
            remoteRenderer = null
            localRenderer = null
        }
    }

    private fun wireBackPress() {
        onBackPressedDispatcher.addCallback(this, object : OnBackPressedCallback(true) {
            override fun handleOnBackPressed() {
                // Phase E: confirm dialog. Phase B: treat as End so users in
                // testing can dismiss the scaffold cleanly.
                onUserRequestedEnd()
            }
        })
    }

    private fun onUserRequestedEnd() {
        if (vm.state.value == PrivateCallViewModel.CallState.ENDED ||
            vm.state.value == PrivateCallViewModel.CallState.ENDING
        ) return
        vm.markEnding("user_hangup")
        // Honest-private-call fix (L-2): bridge the user hangup to JS so
        // settle_private_call runs and LiveKitPlugin.disconnect releases the
        // Room. Without this dispatch the Room stays connected and billing
        // never settles after the activity finishes.
        runCatching {
            val id = vm.identity.value
            com.merilive.app.plugin.NativeCallPlugin.dispatch(
                ctx = applicationContext,
                callId = id?.callId,
                callerId = id?.peerId,
                callerName = id?.peerName,
                callType = "video",
                action = "end",
            )
        }
        vm.markEnded()
    }

    override fun onDestroy() {
        // Phase 2 — notify JS the native window is gone so React can re-render
        // its own call surface (system back, force-close, or normal teardown).
        com.merilive.app.plugin.NativeCallPlugin.broadcastWindowState(
            applicationContext, vm.identity.value?.callId, "closed"
        )
        // Release renderers but DO NOT touch the Room (LiveKitPlugin owns it).
        detachAllRenderers(release = true)
        closeReceiver?.let { runCatching { unregisterReceiver(it) } }
        closeReceiver = null
        billingReceiver?.let { runCatching { unregisterReceiver(it) } }
        billingReceiver = null
        resumeReceiver?.let { runCatching { unregisterReceiver(it) } }
        resumeReceiver = null
        stopNetworkQualityIndicator()
        runCatching { audioRouter?.detach() }
        audioRouter = null
        runCatching { resilienceController?.detach() }
        resilienceController = null
        releaseProximityWakeLock(screenOnImmediately = true)
        super.onDestroy()
    }

    private fun startNetworkQualityIndicator() {
        connectivityManager = getSystemService(Context.CONNECTIVITY_SERVICE) as? ConnectivityManager
        renderSignalBars(scoreNetwork(connectivityManager?.getNetworkCapabilities(connectivityManager?.activeNetwork)))
        val cm = connectivityManager ?: return
        val cb = object : ConnectivityManager.NetworkCallback() {
            override fun onAvailable(network: Network) {
                renderSignalBars(scoreNetwork(cm.getNetworkCapabilities(network)))
            }
            override fun onCapabilitiesChanged(network: Network, caps: NetworkCapabilities) {
                renderSignalBars(scoreNetwork(caps))
            }
            override fun onLost(network: Network) { renderSignalBars(0) }
        }
        networkCallback = cb
        runCatching { cm.registerDefaultNetworkCallback(cb) }
    }

    private fun stopNetworkQualityIndicator() {
        val cm = connectivityManager
        val cb = networkCallback
        if (cm != null && cb != null) runCatching { cm.unregisterNetworkCallback(cb) }
        networkCallback = null
        connectivityManager = null
    }

    private fun scoreNetwork(caps: NetworkCapabilities?): Int {
        if (caps == null) return 0
        if (!caps.hasCapability(NetworkCapabilities.NET_CAPABILITY_VALIDATED)) return 1
        val down = caps.linkDownstreamBandwidthKbps
        val up = caps.linkUpstreamBandwidthKbps
        return when {
            down >= 10_000 && up >= 2_000 -> 4
            down >= 4_000 && up >= 1_000 -> 3
            down >= 1_000 && up >= 300 -> 2
            else -> 1
        }
    }

    private fun renderSignalBars(score: Int) {
        runOnUiThread {
            signalBars.forEachIndexed { idx, bar ->
                bar.setBackgroundColor(if (idx < score) Color.parseColor("#6EE7B7") else Color.parseColor("#55FFFFFF"))
            }
        }
    }

    // ------------------------------------------------------------------
    // L-7 / L-8 — Activity lifecycle: renderer + proximity-wakelock
    // ------------------------------------------------------------------

    override fun onResume() {
        // L-7: re-attach the latest tracks to their renderers. Phase B's
        // collect flows handle initial mount; this path covers the case where
        // the user returned from a paused state (background, screen-off, PIP→
        // fullscreen) and the previous detach in onPause cleared the renderer
        // bindings. attach* is idempotent — same track + same renderer no-op.
        super.onResume()
        runCatching { attachRemote(vm.remoteVideo.value) }
        runCatching { attachLocal(vm.localVideo.value) }
        // L-8: re-acquire proximity wakelock if we're on earpiece while
        // returning to foreground. Safe no-op on speaker/BT.
        updateProximityWakeLock()
    }

    override fun onPause() {
        // L-7: detach (but DO NOT release) renderers so frame callbacks stop
        // firing while we're not visible. This frees GPU + reduces battery
        // without tearing down the WebRTC tracks (LiveKitPlugin still owns
        // them). When PIP is active we keep renderers attached so video keeps
        // flowing in the floating window — Chamet/WhatsApp pattern.
        if (!inPipMode) {
            runCatching { detachAllRenderers(release = false) }
        }
        // L-8: always release proximity wakelock when paused so the screen
        // can turn on for incoming notifications / system UI.
        releaseProximityWakeLock(screenOnImmediately = false)
        super.onPause()
    }

    /**
     * L-8 — AOSP InCallUI ProximitySensor pattern. Acquire the proximity
     * wakelock only while the user is on earpiece during a live call;
     * release on speaker / BT / wired / ended. Null-safe on tablets and
     * foldables that don't support the sensor.
     */
    private fun updateProximityWakeLock() {
        try {
            val st = vm.state.value
            val callLive = st == PrivateCallViewModel.CallState.CONNECTED ||
                st == PrivateCallViewModel.CallState.RECONNECTING
            val onEarpiece = !speakerOn &&
                audioRouter?.isExternalAudioDeviceConnected() != true
            if (callLive && onEarpiece) {
                acquireProximityWakeLock()
            } else {
                releaseProximityWakeLock(screenOnImmediately = true)
            }
        } catch (t: Throwable) {
            Log.w(TAG, "updateProximityWakeLock: ${t.message}")
        }
    }

    private fun acquireProximityWakeLock() {
        if (proximityWakeLock?.isHeld == true) return
        try {
            val pm = getSystemService(Context.POWER_SERVICE) as? android.os.PowerManager
                ?: return
            if (!pm.isWakeLockLevelSupported(
                    android.os.PowerManager.PROXIMITY_SCREEN_OFF_WAKE_LOCK)) {
                return
            }
            if (proximityWakeLock == null) {
                proximityWakeLock = pm.newWakeLock(
                    android.os.PowerManager.PROXIMITY_SCREEN_OFF_WAKE_LOCK,
                    "MeriLive:PrivateCallProximity"
                )
                proximityWakeLock?.setReferenceCounted(false)
            }
            proximityWakeLock?.acquire(60 * 60 * 1000L) // 1h safety cap
        } catch (t: Throwable) {
            Log.w(TAG, "acquireProximityWakeLock: ${t.message}")
        }
    }

    private fun releaseProximityWakeLock(screenOnImmediately: Boolean) {
        try {
            val wl = proximityWakeLock ?: return
            if (!wl.isHeld) return
            val flag = if (screenOnImmediately) {
                android.os.PowerManager.RELEASE_FLAG_WAIT_FOR_NO_PROXIMITY
            } else 0
            wl.release(flag)
        } catch (t: Throwable) {
            Log.w(TAG, "releaseProximityWakeLock: ${t.message}")
        }
    }




    // ------------------------------------------------------------------
    // Phase E — Picture-in-Picture
    // ------------------------------------------------------------------

    override fun onUserLeaveHint() {
        super.onUserLeaveHint()
        // User pressed Home while the call is connected → drop into PIP so
        // the video keeps flowing in a floating window (WhatsApp pattern).
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O && !inPipMode) {
            val st = vm.state.value
            if (st == PrivateCallViewModel.CallState.CONNECTED ||
                st == PrivateCallViewModel.CallState.RECONNECTING
            ) {
                runCatching { enterPictureInPictureMode(buildPipParams()) }
            }
        }
    }

    @androidx.annotation.RequiresApi(Build.VERSION_CODES.O)
    private fun buildPipParams(): android.app.PictureInPictureParams {
        val builder = android.app.PictureInPictureParams.Builder()
            .setAspectRatio(android.util.Rational(9, 16))
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            builder.setAutoEnterEnabled(true)
            builder.setSeamlessResizeEnabled(true)
        }
        return builder.build()
    }

    override fun onPictureInPictureModeChanged(
        isInPictureInPictureMode: Boolean,
        newConfig: android.content.res.Configuration,
    ) {
        super.onPictureInPictureModeChanged(isInPictureInPictureMode, newConfig)
        inPipMode = isInPictureInPictureMode
        val hide = if (isInPictureInPictureMode) View.GONE else View.VISIBLE
        topOverlay.visibility = hide
        bottomBar.visibility = hide
        localPreviewContainer.visibility =
            if (isInPictureInPictureMode) View.GONE
            else if (vm.cameraEnabled.value) View.VISIBLE else View.INVISIBLE
        if (isInPictureInPictureMode) {
            lowBalanceBannerSlot.visibility = View.GONE
        } else {
            // Restore banner based on the current warning level.
            renderLowBalanceBanner(vm.warningLevel.value)
        }
    }

    // ------------------------------------------------------------------
    // Phase E — End-screen handoff
    // ------------------------------------------------------------------

    private fun launchEndScreenAndFinish() {
        try {
            val id = vm.identity.value
            val duration = vm.durationSec.value
            val coinsSpent = estimateCoinsSpent(duration, vm.ratePerMinute.value)
            if (id != null) {
                val intent = PrivateCallEndActivity.newIntent(
                    ctx = this,
                    callId = id.callId,
                    peerId = id.peerId,
                    peerName = id.peerName,
                    peerAvatar = id.peerAvatar,
                    durationSec = duration,
                    coinsSpent = coinsSpent,
                    isCaller = id.isCaller,
                    reason = vm.endReason,
                )
                startActivity(intent)
            }
        } catch (t: Throwable) {
            Log.w(TAG, "launchEndScreenAndFinish: ${t.message}")
        }
        finishAndRemoveTask()
    }

    /** Conservative client-side estimate; server settle_private_call is truth. */
    private fun estimateCoinsSpent(durationSec: Int, ratePerMinute: Int): Long {
        if (durationSec <= 0 || ratePerMinute <= 0) return 0L
        // Bill in whole minutes, rounded up (industry standard for paid calls).
        val minutes = (durationSec + 59) / 60
        return minutes.toLong() * ratePerMinute.toLong()
    }


    private fun formatDuration(totalSec: Int): String {
        val m = totalSec / 60
        val s = totalSec % 60
        return "%02d:%02d".format(m, s)
    }
}

