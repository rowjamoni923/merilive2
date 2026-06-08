package com.merilive.app.activity

import android.content.Context
import android.content.Intent
import android.os.Bundle
import android.util.Log
import android.widget.Button
import android.widget.ImageView
import android.widget.LinearLayout
import android.widget.TextView
import androidx.activity.ComponentActivity
import com.merilive.app.R

/**
 * Pkg500 Phase E — PrivateCallEndActivity
 *
 * Professional post-call summary (Chamet / Bigo pattern):
 *   • Peer avatar + name
 *   • Duration + coins spent
 *   • 5-star rating (caller side only — hidden for host)
 *   • Send-gift CTA  → broadcasts action="gift" so JS opens gift sheet
 *   • Recharge CTA   → broadcasts action="recharge" so JS opens recharge sheet
 *   • Close          → finishes (and JS settle_private_call has already run)
 *
 * No network calls here — JS already settled the call before launching us.
 * All actions emit Capacitor events via NativeCallPlugin → JS opens the
 * matching sheet on the web layer underneath.
 */
class PrivateCallEndActivity : ComponentActivity() {

    companion object {
        private const val TAG = "PrivateCallEndAct"

        const val EXTRA_CALL_ID = "call_id"
        const val EXTRA_PEER_ID = "peer_id"
        const val EXTRA_PEER_NAME = "peer_name"
        const val EXTRA_PEER_AVATAR = "peer_avatar"
        const val EXTRA_DURATION_SEC = "duration_sec"
        const val EXTRA_COINS_SPENT = "coins_spent"
        const val EXTRA_IS_CALLER = "is_caller"
        const val EXTRA_REASON = "reason"

        fun newIntent(
            ctx: Context,
            callId: String,
            peerId: String,
            peerName: String,
            peerAvatar: String?,
            durationSec: Int,
            coinsSpent: Long,
            isCaller: Boolean,
            reason: String?,
        ): Intent = Intent(ctx, PrivateCallEndActivity::class.java).apply {
            putExtra(EXTRA_CALL_ID, callId)
            putExtra(EXTRA_PEER_ID, peerId)
            putExtra(EXTRA_PEER_NAME, peerName)
            putExtra(EXTRA_PEER_AVATAR, peerAvatar)
            putExtra(EXTRA_DURATION_SEC, durationSec)
            putExtra(EXTRA_COINS_SPENT, coinsSpent)
            putExtra(EXTRA_IS_CALLER, isCaller)
            putExtra(EXTRA_REASON, reason ?: "")
            addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        }
    }

    private var callId: String = ""
    private var peerId: String = ""
    private var isCaller: Boolean = true
    private var rating: Int = 0
    private lateinit var stars: List<TextView>

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_private_call_end)
        // L-4: register predictive-back-compatible handler.
        onBackPressedDispatcher.addCallback(this, backHandler)



        val i = intent ?: run { finish(); return }
        callId = i.getStringExtra(EXTRA_CALL_ID).orEmpty()
        peerId = i.getStringExtra(EXTRA_PEER_ID).orEmpty()
        val peerName = i.getStringExtra(EXTRA_PEER_NAME).orEmpty().ifEmpty { "Unknown" }
        val durationSec = i.getIntExtra(EXTRA_DURATION_SEC, 0).coerceAtLeast(0)
        val coinsSpent = i.getLongExtra(EXTRA_COINS_SPENT, 0L).coerceAtLeast(0L)
        isCaller = i.getBooleanExtra(EXTRA_IS_CALLER, true)

        findViewById<TextView>(R.id.callEndPeerName).text = peerName
        findViewById<TextView>(R.id.callEndDuration).text = formatDuration(durationSec)
        findViewById<TextView>(R.id.callEndCoins).text = coinsSpent.toString()
        findViewById<TextView>(R.id.callEndCoinsLabel).text =
            if (isCaller) "Coins spent" else "Coins earned"

        // Avatar: lightweight — show placeholder background. Real bitmap load
        // is JS-side via existing avatar cache; not worth a new image lib here.
        findViewById<ImageView>(R.id.callEndAvatar)

        if (isCaller) {
            findViewById<LinearLayout>(R.id.callEndRatingSection).visibility =
                android.view.View.VISIBLE
            wireStars()
        }

        val primary = findViewById<Button>(R.id.callEndBtnPrimary)
        val secondary = findViewById<Button>(R.id.callEndBtnSecondary)
        val close = findViewById<Button>(R.id.callEndBtnClose)

        if (isCaller) {
            primary.text = "Send a gift"
            secondary.text = "Recharge wallet"
        } else {
            // Host side: primary = withdraw shortcut, secondary = back to live.
            primary.text = "Open wallet"
            secondary.text = "Go live"
        }

        primary.setOnClickListener {
            broadcastAction(if (isCaller) "gift" else "wallet")
            finish()
        }
        secondary.setOnClickListener {
            broadcastAction(if (isCaller) "recharge" else "go_live")
            finish()
        }
        close.setOnClickListener {
            if (rating > 0) broadcastRating(rating)
            broadcastAction("close")
            finish()
        }
    }

    private fun wireStars() {
        stars = listOf(
            findViewById(R.id.callEndStar1),
            findViewById(R.id.callEndStar2),
            findViewById(R.id.callEndStar3),
            findViewById(R.id.callEndStar4),
            findViewById(R.id.callEndStar5),
        )
        stars.forEachIndexed { idx, view ->
            view.setOnClickListener {
                rating = idx + 1
                renderStars()
                broadcastRating(rating)
            }
        }
        renderStars()
    }

    private fun renderStars() {
        stars.forEachIndexed { idx, v ->
            v.alpha = if (idx < rating) 1.0f else 0.32f
            v.setTextColor(if (idx < rating) 0xFFFFCA28.toInt() else 0xFFFFFFFF.toInt())
        }
    }

    private fun broadcastAction(action: String) {
        try {
            val i = Intent(com.merilive.app.plugin.NativeCallPlugin.ACTION_CALL_END_ACTION).apply {
                setPackage(packageName)
                putExtra("call_id", callId)
                putExtra("peer_id", peerId)
                putExtra("action", action)
            }
            sendBroadcast(i)
        } catch (t: Throwable) { Log.w(TAG, "broadcastAction: ${t.message}") }
    }

    private fun broadcastRating(stars: Int) {
        try {
            val i = Intent(com.merilive.app.plugin.NativeCallPlugin.ACTION_CALL_END_ACTION).apply {
                setPackage(packageName)
                putExtra("call_id", callId)
                putExtra("peer_id", peerId)
                putExtra("action", "rate")
                putExtra("rating", stars)
            }
            sendBroadcast(i)
        } catch (t: Throwable) { Log.w(TAG, "broadcastRating: ${t.message}") }
    }

    // Honest-private-call fix (L-4): onBackPressed() override is deprecated on
    // API 33+. With `enableOnBackInvokedCallback=true` in manifest, it doesn't
    // fire reliably on Android 14 gesture-nav, silently dropping the rating
    // broadcast on back-swipe. Migrated to OnBackPressedDispatcher.
    private val backHandler = object : androidx.activity.OnBackPressedCallback(true) {
        override fun handleOnBackPressed() {
            if (rating > 0) broadcastRating(rating)
            broadcastAction("close")
            isEnabled = false
            onBackPressedDispatcher.onBackPressed()
        }
    }


    private fun formatDuration(totalSec: Int): String {
        val h = totalSec / 3600
        val m = (totalSec % 3600) / 60
        val s = totalSec % 60
        return if (h > 0) "%d:%02d:%02d".format(h, m, s)
        else "%02d:%02d".format(m, s)
    }
}
