package com.merilive.app.service

import android.Manifest
import android.content.Context
import android.content.pm.PackageManager
import android.graphics.Bitmap
import android.os.Build
import ai.deepar.ar.ARErrorType
import ai.deepar.ar.AREventListener
import ai.deepar.ar.DeepAR
import ai.deepar.ar.DeepARImageFormat
import androidx.core.content.ContextCompat
import dagger.hilt.android.qualifiers.ApplicationContext
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow
import javax.inject.Inject
import javax.inject.Singleton

// ============================================================
// DeepAR v5.6.20 Compatible Manager
// ============================================================
// - receiveFrame → byte[] (not ByteBuffer)
// - DeepARImageFormat.NV21
// - screenshotTaken(Bitmap?) callback
// - No onFrameAvailable(Image?) in v5
// ============================================================

@Singleton
class DeepARManager @Inject constructor(
    @ApplicationContext private val context: Context,
) : AREventListener {

    companion object {
        private const val DEEPAR_LICENSE_KEY = "cf1eb9f4e2d9a7fdd208d71e4232eb8d05e09b2e2f9b1de6cc28fb93f0c824c65c9bcc7cfbe0c797"
        private const val ASSET_PREFIX = "file:///android_asset"
    }

    private var deepAR: DeepAR? = null
    private var isInitialized = false

    private val _currentEffect = MutableStateFlow<String?>(null)
    val currentEffect = _currentEffect.asStateFlow()

    private val _isReady = MutableStateFlow(false)
    val isReady = _isReady.asStateFlow()

    private val _faceVisible = MutableStateFlow(false)
    val faceVisible = _faceVisible.asStateFlow()

    // Beauty parameters
    private var smoothing = 0.5f
    private var whiten = 0.3f
    private var thinFace = 0.2f
    private var bigEyes = 0.2f

    fun initialize() {
        if (isInitialized || isEmulatorEnvironment() || !hasCameraPermission()) return

        deepAR = DeepAR(context).apply {
            setLicenseKey(DEEPAR_LICENSE_KEY)
            initialize(context, this@DeepARManager)
        }
    }

    /**
     * DeepAR v5.6.20: receiveFrame uses byte[] and NV21 format
     */
    fun processFrame(frameData: ByteArray, width: Int, height: Int, orientation: Int) {
        if (!isInitialized || isEmulatorEnvironment()) return

        deepAR?.receiveFrame(
            frameData,
            width, height,
            orientation,
            false,
            DeepARImageFormat.NV21
        )
    }

    fun loadEffect(effectPath: String) {
        if (!isInitialized) return
        if (isBlockedAsset(effectPath)) return

        val normalizedPath = normalizeEffectPath(effectPath)
        deepAR?.switchEffect("effect", normalizedPath)
        _currentEffect.value = normalizedPath
    }

    fun loadBeautyEffect() {
        deepAR?.switchEffect("beauty", normalizeEffectPath("/effects/beauty.deepar"))
    }

    fun setBeautyParams(smooth: Float, white: Float, thin: Float, eyes: Float) {
        smoothing = smooth; whiten = white; thinFace = thin; bigEyes = eyes
        deepAR?.let { ar ->
            ar.changeParameter("Beauty", "Smoothing", smooth)
            ar.changeParameter("Beauty", "Whiten", white)
            ar.changeParameter("Beauty", "ThinFace", thin)
            ar.changeParameter("Beauty", "BigEyes", eyes)
        }
    }

    fun clearEffect() {
        deepAR?.switchEffect("effect", "none")
        _currentEffect.value = null
    }

    fun release() {
        deepAR?.release()
        deepAR = null
        isInitialized = false
        _isReady.value = false
    }

    // ===== AREventListener (v5.6.20) =====

    override fun screenshotTaken(bitmap: Bitmap?) {
        // Handle screenshot if needed
    }

    override fun videoRecordingStarted() {}
    override fun videoRecordingFinished() {}
    override fun videoRecordingFailed() {}
    override fun videoRecordingPrepared() {}
    override fun shutdownFinished() {}

    override fun initialized() {
        isInitialized = true
        _isReady.value = true
        loadBeautyEffect()
    }

    override fun faceVisibilityChanged(visible: Boolean) {
        _faceVisible.value = visible
    }

    override fun imageVisibilityChanged(gameObject: String?, visible: Boolean) {}

    override fun effectSwitched(slot: String?) {}

    override fun error(errorType: ARErrorType, message: String) {
        _isReady.value = false
    }

    // ===== Utility =====

    private fun isBlockedAsset(path: String): Boolean {
        val blocked = listOf("demo", "fake", "sample", "test")
        return blocked.any { path.lowercase().contains(it) }
    }

    private fun normalizeEffectPath(path: String): String {
        val trimmed = path.trim()
        if (trimmed.isBlank() || trimmed == "none") return "none"
        if (trimmed.startsWith("file://") || trimmed.startsWith("http://") || trimmed.startsWith("https://")) {
            return trimmed
        }

        val relativePath = when {
            trimmed.startsWith("/") -> trimmed
            trimmed.startsWith("effects/") -> "/$trimmed"
            else -> "/effects/$trimmed"
        }

        return "$ASSET_PREFIX$relativePath"
    }

    private fun isEmulatorEnvironment(): Boolean {
        return (Build.FINGERPRINT.startsWith("generic")
                || Build.FINGERPRINT.startsWith("unknown")
                || Build.MODEL.contains("Emulator")
                || Build.MODEL.contains("Android SDK built for x86")
                || Build.MANUFACTURER.contains("Genymotion")
                || Build.BRAND.startsWith("generic")
                || Build.DEVICE.startsWith("generic")
                || "google_sdk" == Build.PRODUCT)
    }

    private fun hasCameraPermission(): Boolean {
        return ContextCompat.checkSelfPermission(context, Manifest.permission.CAMERA) == PackageManager.PERMISSION_GRANTED
    }
}
