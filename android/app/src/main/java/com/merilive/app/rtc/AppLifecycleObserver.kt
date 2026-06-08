package com.merilive.app.rtc

import android.os.Handler
import android.os.Looper
import android.util.Log
import androidx.lifecycle.DefaultLifecycleObserver
import androidx.lifecycle.LifecycleOwner
import androidx.lifecycle.ProcessLifecycleOwner
import java.util.concurrent.CopyOnWriteArrayList

/**
 * Phase 2A — Process-level lifecycle observer.
 *
 * Backed by [ProcessLifecycleOwner], which fires `ON_START` / `ON_STOP`
 * only when ALL of the app's Activities cross the foreground boundary
 * (debounced ~700 ms). This is **NOT** the same as an Activity-level
 * `onPause` / `onStop` — those fire for permission sheets, notification
 * shade, PiP entry, WebView focus churn, and were the reason
 * `useNativeLiveKitLifecycle.ts` historically chose NOT to pause tracks
 * on `appStateChange`.
 *
 * Listeners receive a single `onAppForeground(true|false)` callback.
 * Initialization is **lazy** — the observer attaches on first
 * subscription and detaches when the last listener leaves, so this file
 * costs nothing for apps that never wire it up.
 *
 * Default behavior:
 *   - The observer alone does NOT touch the camera, mic, or Room.
 *   - It only fans events out. Consumers (LiveKitPlugin, JS overlay)
 *     decide whether to act, and act behind feature flags.
 */
object AppLifecycleObserver {
    private const val TAG = "AppLifecycleObserver"

    @Volatile private var attached = false
    @Volatile private var inForeground = true

    private val listeners = CopyOnWriteArrayList<(Boolean) -> Unit>()

    private val observer = object : DefaultLifecycleObserver {
        override fun onStart(owner: LifecycleOwner) { dispatch(true) }
        override fun onStop(owner: LifecycleOwner)  { dispatch(false) }
    }

    /** Register a listener. Returns an unsubscribe handle. Idempotent on observer attach. */
    @JvmStatic
    fun addListener(cb: (foreground: Boolean) -> Unit): () -> Unit {
        listeners.add(cb)
        ensureAttached()
        // Replay current state so subscribers don't need to query.
        try { cb(inForeground) } catch (e: Exception) {
            Log.w(TAG, "addListener replay failed: ${e.message}")
        }
        return {
            listeners.remove(cb)
            if (listeners.isEmpty()) detach()
        }
    }

    /** Current best-effort foreground status. */
    @JvmStatic
    fun isInForeground(): Boolean = inForeground

    private fun ensureAttached() {
        if (attached) return
        // Lifecycle APIs must be touched on the main thread.
        runOnMain {
            if (attached) return@runOnMain
            try {
                ProcessLifecycleOwner.get().lifecycle.addObserver(observer)
                attached = true
                // Seed initial state: if STARTED+, we're already foreground.
                inForeground = ProcessLifecycleOwner.get().lifecycle.currentState
                    .isAtLeast(androidx.lifecycle.Lifecycle.State.STARTED)
                Log.d(TAG, "attached; initialForeground=$inForeground")
            } catch (e: Exception) {
                Log.w(TAG, "ensureAttached failed: ${e.message}")
            }
        }
    }

    private fun detach() {
        if (!attached) return
        runOnMain {
            if (!attached) return@runOnMain
            try {
                ProcessLifecycleOwner.get().lifecycle.removeObserver(observer)
            } catch (_: Exception) {}
            attached = false
            Log.d(TAG, "detached (no more listeners)")
        }
    }

    private fun dispatch(foreground: Boolean) {
        if (inForeground == foreground) return
        inForeground = foreground
        Log.d(TAG, "process ${if (foreground) "FOREGROUND" else "BACKGROUND"} (${listeners.size} listeners)")
        for (cb in listeners) {
            try { cb(foreground) } catch (e: Exception) {
                Log.w(TAG, "listener threw: ${e.message}")
            }
        }
    }

    private fun runOnMain(block: () -> Unit) {
        if (Looper.myLooper() == Looper.getMainLooper()) block()
        else Handler(Looper.getMainLooper()).post(block)
    }
}
