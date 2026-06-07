package com.merilive.app.plugin

import android.app.Activity
import android.content.Intent
import android.graphics.Bitmap
import android.net.Uri
import android.util.Base64
import androidx.activity.result.ActivityResultLauncher
import androidx.activity.result.contract.ActivityResultContracts
import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin
import com.yalantis.ucrop.UCrop
import java.io.ByteArrayOutputStream
import java.io.File

/**
 * Pkg440 — ImageCropper plugin.
 *
 * Wraps Yalantis UCrop for avatar / cover / reels thumb cropping.
 * Aspect-locked, pinch-zoom, rotate, optional circular mask preview.
 *
 * JS API:
 *   ImageCropper.crop({
 *     sourceUri: "file:///..." | "content://..." | "data:image/jpeg;base64,...",
 *     aspectX?: number = 1, aspectY?: number = 1,
 *     maxWidth?: number = 1080, maxHeight?: number = 1080,
 *     quality?: number = 90,           // 1..100
 *     format?: "jpeg" | "png" = "jpeg",
 *     freeStyle?: boolean = false,     // false = locked aspect
 *     circular?: boolean = false       // circular preview overlay
 *   }) → { base64, mime, width, height, sizeBytes } | cancelled → resolves with {cancelled:true}
 */
@CapacitorPlugin(name = "ImageCropper")
class ImageCropperPlugin : Plugin() {

    private var pendingCall: PluginCall? = null
    private var cropLauncher: ActivityResultLauncher<Intent>? = null

    override fun load() {
        try {
            cropLauncher = activity.registerForActivityResult(
                ActivityResultContracts.StartActivityForResult()
            ) { result ->
                val call = pendingCall
                pendingCall = null
                if (call == null) return@registerForActivityResult
                try {
                    when (result.resultCode) {
                        Activity.RESULT_OK -> {
                            val data = result.data
                            val uri = data?.let { UCrop.getOutput(it) }
                            if (uri == null) { call.reject("no crop output"); return@registerForActivityResult }
                            val obj = readToJson(uri, call.getString("format", "jpeg") ?: "jpeg")
                            if (obj == null) call.reject("read cropped failed") else call.resolve(obj)
                        }
                        UCrop.RESULT_ERROR -> {
                            val err = data?.let { UCrop.getError(it) }
                            call.reject(err?.message ?: "crop error")
                        }
                        Activity.RESULT_CANCELED -> {
                            val ret = JSObject(); ret.put("cancelled", true); call.resolve(ret)
                        }
                        else -> { val ret = JSObject(); ret.put("cancelled", true); call.resolve(ret) }
                    }
                } catch (t: Throwable) {
                    call.reject(t.message ?: "crop result failed")
                }
            }
        } catch (t: Throwable) {
            // registerForActivityResult must run during load — if it fails the plugin is unusable.
            // Method-level guards will reject with a friendly message.
        }
    }

    @PluginMethod
    fun crop(call: PluginCall) {
        if (pendingCall != null) { call.reject("cropper busy"); return }
        val launcher = cropLauncher ?: run { call.reject("cropper not initialized"); return }
        try {
            val sourceUri = resolveSource(call.getString("sourceUri"))
                ?: run { call.reject("sourceUri required (file://, content://, or data:image base64)"); return }

            val aspectX = (call.getFloat("aspectX") ?: 1.0f).coerceIn(0.01f, 100f)
            val aspectY = (call.getFloat("aspectY") ?: 1.0f).coerceIn(0.01f, 100f)
            val maxW = (call.getInt("maxWidth") ?: 1080).coerceIn(64, 8192)
            val maxH = (call.getInt("maxHeight") ?: 1080).coerceIn(64, 8192)
            val quality = (call.getInt("quality") ?: 90).coerceIn(1, 100)
            val format = call.getString("format", "jpeg") ?: "jpeg"
            val freeStyle = call.getBoolean("freeStyle", false) == true
            val circular = call.getBoolean("circular", false) == true

            val ext = if (format.equals("png", true)) "png" else "jpg"
            val dest = Uri.fromFile(
                File(context.cacheDir, "ucrop_${System.currentTimeMillis()}.$ext")
            )

            val opts = UCrop.Options().apply {
                setCompressionFormat(
                    if (format.equals("png", true)) Bitmap.CompressFormat.PNG
                    else Bitmap.CompressFormat.JPEG
                )
                setCompressionQuality(quality)
                setHideBottomControls(false)
                setFreeStyleCropEnabled(freeStyle)
                setCircleDimmedLayer(circular)
                setShowCropFrame(!circular)
                setShowCropGrid(!circular)
                setToolbarTitle("Crop")
            }

            val intent = UCrop.of(sourceUri, dest)
                .withAspectRatio(aspectX, aspectY)
                .withMaxResultSize(maxW, maxH)
                .withOptions(opts)
                .getIntent(activity)

            pendingCall = call
            call.setKeepAlive(true)
            launcher.launch(intent)
        } catch (t: Throwable) {
            pendingCall = null
            call.reject(t.message ?: "crop launch failed")
        }
    }

    /** Accepts file://, content://, /absolute/path, or data:image/...;base64,XXX */
    private fun resolveSource(input: String?): Uri? {
        if (input.isNullOrBlank()) return null
        return try {
            when {
                input.startsWith("data:") -> {
                    val comma = input.indexOf(',')
                    if (comma <= 0) return null
                    val b64 = input.substring(comma + 1)
                    val bytes = Base64.decode(b64, Base64.DEFAULT)
                    val f = File(context.cacheDir, "ucrop_in_${System.currentTimeMillis()}.bin")
                    f.outputStream().use { it.write(bytes) }
                    Uri.fromFile(f)
                }
                input.startsWith("/") -> Uri.fromFile(File(input))
                else -> Uri.parse(input)
            }
        } catch (_: Throwable) { null }
    }

    private fun readToJson(uri: Uri, format: String): JSObject? {
        return try {
            val cr = context.contentResolver
            val mime = if (format.equals("png", true)) "image/png" else "image/jpeg"
            val bos = ByteArrayOutputStream()
            cr.openInputStream(uri)?.use { input ->
                val buf = ByteArray(16 * 1024)
                var total = 0L
                while (true) {
                    val n = input.read(buf)
                    if (n <= 0) break
                    total += n
                    if (total > 25L * 1024 * 1024) return null // 25 MB hard cap on output
                    bos.write(buf, 0, n)
                }
            } ?: return null
            val bytes = bos.toByteArray()
            // best-effort decode for w/h — skip if file is huge to save memory
            var w = -1; var h = -1
            try {
                val o = android.graphics.BitmapFactory.Options().apply { inJustDecodeBounds = true }
                android.graphics.BitmapFactory.decodeByteArray(bytes, 0, bytes.size, o)
                w = o.outWidth; h = o.outHeight
            } catch (_: Throwable) {}
            val b64 = Base64.encodeToString(bytes, Base64.NO_WRAP)
            JSObject().apply {
                put("base64", b64)
                put("mime", mime)
                put("width", w)
                put("height", h)
                put("sizeBytes", bytes.size)
                put("cancelled", false)
            }
        } catch (_: Throwable) { null }
    }

    override fun handleOnDestroy() {
        val c = pendingCall
        pendingCall = null
        try { c?.reject("Cropper cancelled: activity destroyed", "ACTIVITY_DESTROYED") } catch (_: Throwable) {}
        super.handleOnDestroy()
    }
}
