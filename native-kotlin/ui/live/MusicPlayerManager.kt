package com.merilive.app.ui.live

import android.media.MediaPlayer
import android.util.Log

/**
 * Music player for live stream background music.
 * Host-only feature. Plays from admin_music_library URLs.
 */
class MusicPlayerManager {
    private var mediaPlayer: MediaPlayer? = null
    private var currentUrl: String? = null
    var isPlaying: Boolean = false
        private set

    fun play(url: String) {
        try {
            stop()
            mediaPlayer = MediaPlayer().apply {
                setDataSource(url)
                setOnPreparedListener {
                    it.start()
                    isPlaying = true
                }
                setOnCompletionListener {
                    isPlaying = false
                }
                setOnErrorListener { _, _, _ ->
                    isPlaying = false
                    true
                }
                prepareAsync()
            }
            currentUrl = url
        } catch (e: Exception) {
            Log.e("MusicPlayer", "Failed to play", e)
        }
    }

    fun pause() {
        mediaPlayer?.pause()
        isPlaying = false
    }

    fun resume() {
        mediaPlayer?.start()
        isPlaying = true
    }

    fun stop() {
        mediaPlayer?.stop()
        mediaPlayer?.release()
        mediaPlayer = null
        isPlaying = false
        currentUrl = null
    }

    fun setVolume(volume: Float) {
        mediaPlayer?.setVolume(volume, volume)
    }

    fun release() {
        stop()
    }
}
