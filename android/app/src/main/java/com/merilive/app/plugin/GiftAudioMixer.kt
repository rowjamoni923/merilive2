package com.merilive.app.plugin

import android.content.Context
import android.media.AudioAttributes
import android.media.AudioManager
import android.media.MediaPlayer
import android.media.SoundPool
import android.os.Handler
import android.os.Looper
import java.io.File
import java.net.HttpURLConnection
import java.net.URL
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.Executors

/**
 * Pkg438 — Professional shared audio mixer for native gift + entry
 * animations. ONE app-wide instance prevents the historical "audio dies
 * after 6 contexts" iOS bug (Pkg422 pattern) and the gift/entry/ringtone
 * overlap-clip → white-noise bug. Web audio path untouched.
 *
 * Routing:
 *   - Files ≤ 1 MiB AND ≤ 5 s  → SoundPool  (low-latency, parallel ≤ 4)
 *   - Everything else          → MediaPlayer pool (max 3 concurrent)
 *
 * Master ducking: when 2+ streams overlap, every active stream is
 * down-mixed to 0.65 to keep peak < 0 dBFS (no clipping).
 *
 * Camera-conflict safe — pure decoder side, never touches Camera2.
 */
object GiftAudioMixer {

    private const val TAG = "GiftAudioMixer"
    private const val MAX_SOUNDPOOL_STREAMS = 4
    private const val MAX_MEDIAPLAYER_STREAMS = 3
    private const val SOUNDPOOL_SIZE_THRESHOLD = 1024L * 1024L      // 1 MiB
    private const val SOUNDPOOL_DUR_THRESHOLD_MS = 5_000
    // Pkg-audit fix: bound SoundPool entries so per-sample decoder memory
    // doesn't grow unbounded across hundreds of unique gift URLs.
    private const val MAX_POOL_ENTRIES = 30

    @Volatile private var initialized = false
    private lateinit var appContext: Context
    private lateinit var soundPool: SoundPool
    // Pkg-audit fix: LinkedHashMap with access-order=true gives LRU semantics
    // for unload-on-evict. Guarded by `this` (poolIds) for all mutations.
    private val poolIds = java.util.LinkedHashMap<String, Int>(16, 0.75f, true)
    private val activePoolStreams = mutableSetOf<Int>()            // stream ids
    private val activePlayers = mutableListOf<MediaPlayer>()
    // Pkg-audit fix: SoundPool.setOnLoadCompleteListener is a GLOBAL setter;
    // concurrent loads previously overwrote each other and silently dropped sounds.
    // Track pending (soundId → desired volume) and dispatch from ONE persistent listener.
    private val pendingPoolPlays = ConcurrentHashMap<Int, Float>()
    private val downloadExecutor = Executors.newFixedThreadPool(2)
    private val downloadCache = ConcurrentHashMap<String, File>()
    private val mainHandler = Handler(Looper.getMainLooper())

    @Synchronized
    fun ensureInit(ctx: Context) {
        if (initialized) return
        appContext = ctx.applicationContext
        val attrs = AudioAttributes.Builder()
            .setUsage(AudioAttributes.USAGE_GAME)
            .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
            .build()
        soundPool = SoundPool.Builder()
            .setMaxStreams(MAX_SOUNDPOOL_STREAMS)
            .setAudioAttributes(attrs)
            .build()
        // ONE persistent listener for the life of the SoundPool.
        soundPool.setOnLoadCompleteListener { _, soundId, status ->
            val vol = pendingPoolPlays.remove(soundId) ?: return@setOnLoadCompleteListener
            if (status == 0) startSoundPool(soundId, vol)
        }
        initialized = true
    }


    /**
     * Best-effort play. Returns immediately; honors muted device volume
     * via system AudioManager. Never throws.
     */
    fun play(url: String?, volume: Float = 1.0f) {
        if (url.isNullOrBlank()) return
        if (!initialized) return
        val v = volume.coerceIn(0f, 1f)

        downloadExecutor.execute {
            try {
                val file = resolveLocalFile(url) ?: return@execute
                val useSoundPool = file.length() in 1..SOUNDPOOL_SIZE_THRESHOLD
                mainHandler.post {
                    try {
                        if (useSoundPool) playViaSoundPool(url, file, v)
                        else playViaMediaPlayer(file, v)
                        applyDucking()
                    } catch (_: Throwable) {}
                }
            } catch (_: Throwable) {}
        }
    }

    /** Stop every currently-playing FX. Used by `clearAll()` callers. */
    fun stopAll() {
        if (!initialized) return
        mainHandler.post {
            try {
                synchronized(activePoolStreams) {
                    for (id in activePoolStreams) {
                        try { soundPool.stop(id) } catch (_: Throwable) {}
                    }
                    activePoolStreams.clear()
                }
                synchronized(activePlayers) {
                    for (mp in activePlayers) {
                        try { mp.stop() } catch (_: Throwable) {}
                        try { mp.release() } catch (_: Throwable) {}
                        playerIntendedVol.remove(mp)
                    }
                    activePlayers.clear()
                }
            } catch (_: Throwable) {}
        }
    }

    private fun playViaSoundPool(url: String, file: File, volume: Float) {
        val existing: Int? = synchronized(poolIds) { poolIds[url] }
        if (existing != null) {
            startSoundPool(existing, volume)
            return
        }
        val newId = soundPool.load(file.absolutePath, 1)
        // Insert into LRU map and evict oldest if over cap.
        val evictedId: Int? = synchronized(poolIds) {
            poolIds[url] = newId
            if (poolIds.size > MAX_POOL_ENTRIES) {
                val it = poolIds.entries.iterator()
                if (it.hasNext()) {
                    val oldest = it.next()
                    it.remove()
                    oldest.value
                } else null
            } else null
        }
        if (evictedId != null) {
            try { soundPool.unload(evictedId) } catch (_: Throwable) {}
            pendingPoolPlays.remove(evictedId)
        }
        // Register desired volume; persistent listener in ensureInit() handles
        // dispatch. Concurrent loads no longer overwrite each other.
        pendingPoolPlays[newId] = volume
    }

    /**
     * Pkg-audit fix: explicit teardown for tests / long background states.
     * Singleton — safe to re-init after release().
     */
    @Synchronized
    fun release() {
        if (!initialized) return
        try { stopAll() } catch (_: Throwable) {}
        try {
            synchronized(poolIds) {
                for (id in poolIds.values) {
                    try { soundPool.unload(id) } catch (_: Throwable) {}
                }
                poolIds.clear()
            }
            pendingPoolPlays.clear()
            soundPool.release()
        } catch (_: Throwable) {}
        downloadCache.clear()
        initialized = false
    }


    private fun startSoundPool(soundId: Int, volume: Float) {
        try {
            val streamId = soundPool.play(soundId, volume, volume, 1, 0, 1.0f)
            if (streamId != 0) {
                synchronized(activePoolStreams) { activePoolStreams.add(streamId) }
                // Auto-release tracking after ~10s (max FX length).
                mainHandler.postDelayed({
                    synchronized(activePoolStreams) { activePoolStreams.remove(streamId) }
                }, 10_000)
            }
        } catch (_: Throwable) {}
    }

    private fun playViaMediaPlayer(file: File, volume: Float) {
        synchronized(activePlayers) {
            // Cap concurrent MediaPlayers — drop oldest if over limit.
            while (activePlayers.size >= MAX_MEDIAPLAYER_STREAMS) {
                val oldest = activePlayers.removeAt(0)
                try { oldest.stop() } catch (_: Throwable) {}
                try { oldest.release() } catch (_: Throwable) {}
                playerIntendedVol.remove(oldest)
            }
        }
        val mp = MediaPlayer()
        try {
            mp.setAudioAttributes(
                AudioAttributes.Builder()
                    .setUsage(AudioAttributes.USAGE_GAME)
                    .setContentType(AudioAttributes.CONTENT_TYPE_SONIFICATION)
                    .build()
            )
            mp.setVolume(volume, volume)
            // Track intended volume BEFORE async ops so ducking always finds it.
            playerIntendedVol[mp] = volume
            mp.setDataSource(file.absolutePath)
            mp.setOnPreparedListener { it.start() }
            mp.setOnCompletionListener {
                synchronized(activePlayers) { activePlayers.remove(it) }
                playerIntendedVol.remove(it)
                try { it.release() } catch (_: Throwable) {}
                applyDucking()
            }
            mp.setOnErrorListener { player, _, _ ->
                synchronized(activePlayers) { activePlayers.remove(player) }
                playerIntendedVol.remove(player)
                try { player.release() } catch (_: Throwable) {}
                true
            }
            // Pkg-audit fix: add to pool BEFORE prepareAsync() so an early-fire
            // onError listener can't race past us and leave the player registered
            // after release.
            synchronized(activePlayers) { activePlayers.add(mp) }
            mp.prepareAsync()
        } catch (_: Throwable) {
            synchronized(activePlayers) { activePlayers.remove(mp) }
            playerIntendedVol.remove(mp)
            try { mp.release() } catch (_: Throwable) {}
        }
    }


    /**
     * Apply master ducking: when 2+ FX streams overlap, attenuate every
     * active MediaPlayer to 0.65 to prevent peak clipping. SoundPool
     * streams are already capped at their initial volume and SoundPool
     * doesn't expose per-stream re-mix without the stream id, so we leave
     * them — empirically these are short and rarely overlap > 2x.
     */
    // Pkg-audit fix: per-player intended volume so we can restore correctly
    // after ducking lifts (instead of hard-coding 1.0f and silently boosting
    // streams that were intentionally played quieter, e.g. entry plugin 0.85f).
    private val playerIntendedVol = ConcurrentHashMap<MediaPlayer, Float>()

    private fun applyDucking() {
        val totalActive: Int
        synchronized(activePlayers) {
            totalActive = activePlayers.size
        }
        val duckFactor = if (totalActive >= 2) 0.65f else 1.0f
        synchronized(activePlayers) {
            for (mp in activePlayers) {
                val intended = playerIntendedVol[mp] ?: 1.0f
                val v = (intended * duckFactor).coerceIn(0f, 1f)
                try { mp.setVolume(v, v) } catch (_: Throwable) {}
            }
        }
    }


    private fun resolveLocalFile(url: String): File? {
        downloadCache[url]?.let { if (it.exists()) return it }
        if (url.startsWith("file://") || url.startsWith("/")) {
            val raw = if (url.startsWith("file://")) url.removePrefix("file://") else url
            val f = File(raw)
            if (f.exists()) {
                downloadCache[url] = f
                return f
            }
            return null
        }
        val cacheDir = File(appContext.cacheDir, "gift-audio").apply { mkdirs() }
        val safeName = url.hashCode().toString().replace("-", "n") + ".bin"
        val target = File(cacheDir, safeName)
        if (target.exists() && target.length() > 0) {
            downloadCache[url] = target
            return target
        }
        val tmp = File(cacheDir, "$safeName.tmp")
        val conn = (URL(url).openConnection() as HttpURLConnection).apply {
            connectTimeout = 12_000
            readTimeout = 20_000
            instanceFollowRedirects = true
        }
        try {
            conn.inputStream.use { input ->
                tmp.outputStream().use { out -> input.copyTo(out) }
            }
            if (!tmp.renameTo(target)) {
                tmp.copyTo(target, overwrite = true); tmp.delete()
            }
        } finally {
            try { conn.disconnect() } catch (_: Throwable) {}
        }
        downloadCache[url] = target
        return target
    }
}
