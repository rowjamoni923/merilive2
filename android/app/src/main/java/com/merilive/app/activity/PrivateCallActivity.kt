package com.merilive.app.activity

import android.app.KeyguardManager
import android.content.Context
import android.content.Intent
import android.os.Build
import android.os.Bundle
import android.util.Log
import android.view.View
import android.view.ViewGroup
import android.view.WindowManager
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
    private lateinit var btnFlip: ImageButton
    private lateinit var btnBeauty: ImageButton
    private lateinit var btnGift: ImageButton
    private lateinit var btnEnd: ImageButton
    private lateinit var lowBalanceBannerSlot: FrameLayout

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

        wireUiToViewModel()
        wireBackPress()

        // Phase A stops here. Phase B will call vm.startConnect() to bring
        // LiveKit up; Phase D will subscribe Supabase Realtime for billing.
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
        btnFlip = findViewById(R.id.privateCallBtnFlip)
        btnBeauty = findViewById(R.id.privateCallBtnBeauty)
        btnGift = findViewById(R.id.privateCallBtnGift)
        btnEnd = findViewById(R.id.privateCallBtnEnd)
        lowBalanceBannerSlot = findViewById(R.id.privateCallLowBalanceSlot)

        btnMic.setOnClickListener {
            val on = vm.toggleMic()
            btnMic.isSelected = !on
            btnMic.contentDescription = if (on) "Mute microphone" else "Unmute microphone"
        }
        btnFlip.setOnClickListener { vm.flipCamera() }
        btnBeauty.setOnClickListener {
            // Phase C — open beauty sheet. Stub for now.
        }
        btnGift.setOnClickListener {
            // Phase D/E — open gift sheet without leaving the Activity.
        }
        btnEnd.setOnClickListener { onUserRequestedEnd() }
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
                        if (st == PrivateCallViewModel.CallState.ENDED) {
                            // Phase E will show end-screen Activity first. For
                            // Phase A scaffold, just finish.
                            finishAndRemoveTask()
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
            }
        }
    }

    private fun wireBackPress() {
        onBackPressedDispatcher.addCallback(this, object : OnBackPressedCallback(true) {
            override fun handleOnBackPressed() {
                // Phase E: confirm dialog. Phase A: treat as End so users in
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
        // Phase B/D will:
        //   - call settle_private_call RPC
        //   - room.disconnect()
        // For Phase A we just mark ended so the state collector calls finish().
        vm.markEnded()
    }

    private fun formatDuration(totalSec: Int): String {
        val m = totalSec / 60
        val s = totalSec % 60
        return "%02d:%02d".format(m, s)
    }
}
