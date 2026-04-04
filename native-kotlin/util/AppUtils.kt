package com.merilive.app.util

import android.content.Context
import android.content.SharedPreferences
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.net.ConnectivityManager
import android.net.NetworkCapabilities
import android.os.Build
import android.provider.Settings
import android.util.Base64
import android.widget.ImageView
import androidx.security.crypto.EncryptedSharedPreferences
import androidx.security.crypto.MasterKey
import java.io.ByteArrayOutputStream
import java.security.MessageDigest
import java.text.SimpleDateFormat
import java.util.*

// ===== Network Utils =====
object NetworkUtils {
    fun isConnected(context: Context): Boolean {
        val cm = context.getSystemService(Context.CONNECTIVITY_SERVICE) as ConnectivityManager
        val network = cm.activeNetwork ?: return false
        val capabilities = cm.getNetworkCapabilities(network) ?: return false
        return capabilities.hasCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET)
    }

    fun isWifi(context: Context): Boolean {
        val cm = context.getSystemService(Context.CONNECTIVITY_SERVICE) as ConnectivityManager
        val network = cm.activeNetwork ?: return false
        val capabilities = cm.getNetworkCapabilities(network) ?: return false
        return capabilities.hasTransport(NetworkCapabilities.TRANSPORT_WIFI)
    }
}

// ===== Date/Time Formatter =====
object DateTimeUtils {
    private val isoFormat = SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss", Locale.getDefault())
    
    fun formatRelativeTime(isoDate: String?): String {
        if (isoDate.isNullOrEmpty()) return ""
        return try {
            val date = isoFormat.parse(isoDate) ?: return isoDate
            val diff = System.currentTimeMillis() - date.time
            val seconds = diff / 1000
            val minutes = seconds / 60
            val hours = minutes / 60
            val days = hours / 24
            when {
                seconds < 60 -> "just now"
                minutes < 60 -> "${minutes}m ago"
                hours < 24 -> "${hours}h ago"
                days < 7 -> "${days}d ago"
                else -> SimpleDateFormat("MMM dd", Locale.getDefault()).format(date)
            }
        } catch (e: Exception) { isoDate }
    }

    fun formatDuration(seconds: Int): String {
        val h = seconds / 3600
        val m = (seconds % 3600) / 60
        val s = seconds % 60
        return if (h > 0) String.format("%d:%02d:%02d", h, m, s)
        else String.format("%d:%02d", m, s)
    }

    fun formatCallDuration(durationMs: Long): String {
        val totalSeconds = (durationMs / 1000).toInt()
        return formatDuration(totalSeconds)
    }
}

// ===== Number Formatter =====
object NumberUtils {
    fun formatCompact(value: Long): String = when {
        value >= 1_000_000_000 -> String.format("%.1fB", value / 1_000_000_000.0)
        value >= 1_000_000 -> String.format("%.1fM", value / 1_000_000.0)
        value >= 1_000 -> String.format("%.1fK", value / 1_000.0)
        else -> "$value"
    }

    fun formatCurrency(value: Long, symbol: String = "💎"): String = "$symbol ${formatCompact(value)}"
    
    fun formatCoins(coins: Long): String = formatCurrency(coins, "💎")
    fun formatBeans(beans: Long): String = formatCurrency(beans, "🫘")
    fun formatDiamonds(diamonds: Long): String = formatCurrency(diamonds, "💎")
}

// ===== Device Utils =====
object DeviceUtils {
    fun getDeviceId(context: Context): String {
        return Settings.Secure.getString(context.contentResolver, Settings.Secure.ANDROID_ID) ?: "unknown"
    }

    fun getDeviceFingerprint(): String {
        val raw = "${Build.MANUFACTURER}|${Build.MODEL}|${Build.BOARD}|${Build.HARDWARE}|${Build.FINGERPRINT}"
        return raw.sha256()
    }

    fun getDeviceName(): String = "${Build.MANUFACTURER} ${Build.MODEL}"
    fun getOSVersion(): String = "Android ${Build.VERSION.RELEASE} (API ${Build.VERSION.SDK_INT})"
}

// ===== Crypto Utils =====
fun String.sha256(): String {
    val bytes = MessageDigest.getInstance("SHA-256").digest(this.toByteArray())
    return bytes.joinToString("") { "%02x".format(it) }
}

fun String.md5(): String {
    val bytes = MessageDigest.getInstance("MD5").digest(this.toByteArray())
    return bytes.joinToString("") { "%02x".format(it) }
}

// ===== Secure Storage =====
object SecureStorage {
    private const val FILE_NAME = "merilive_secure_prefs"

    fun getPrefs(context: Context): SharedPreferences {
        val masterKey = MasterKey.Builder(context)
            .setKeyScheme(MasterKey.KeyScheme.AES256_GCM)
            .build()
        return EncryptedSharedPreferences.create(
            context, FILE_NAME, masterKey,
            EncryptedSharedPreferences.PrefKeyEncryptionScheme.AES256_SIV,
            EncryptedSharedPreferences.PrefValueEncryptionScheme.AES256_GCM,
        )
    }

    fun saveToken(context: Context, key: String, value: String) {
        getPrefs(context).edit().putString(key, value).apply()
    }

    fun getToken(context: Context, key: String): String? {
        return getPrefs(context).getString(key, null)
    }

    fun clearAll(context: Context) {
        getPrefs(context).edit().clear().apply()
    }
}

// ===== Image Utils =====
object ImageUtils {
    fun bitmapToBase64(bitmap: Bitmap, quality: Int = 80): String {
        val stream = ByteArrayOutputStream()
        bitmap.compress(Bitmap.CompressFormat.JPEG, quality, stream)
        return Base64.encodeToString(stream.toByteArray(), Base64.NO_WRAP)
    }

    fun base64ToBitmap(base64: String): Bitmap? {
        return try {
            val bytes = Base64.decode(base64, Base64.DEFAULT)
            BitmapFactory.decodeByteArray(bytes, 0, bytes.size)
        } catch (e: Exception) { null }
    }

    fun resizeBitmap(bitmap: Bitmap, maxWidth: Int, maxHeight: Int): Bitmap {
        val ratio = minOf(maxWidth.toFloat() / bitmap.width, maxHeight.toFloat() / bitmap.height)
        val width = (bitmap.width * ratio).toInt()
        val height = (bitmap.height * ratio).toInt()
        return Bitmap.createScaledBitmap(bitmap, width, height, true)
    }
}

// ===== Validation Utils =====
object ValidationUtils {
    fun isValidEmail(email: String): Boolean {
        return android.util.Patterns.EMAIL_ADDRESS.matcher(email).matches()
    }

    fun isValidPhone(phone: String): Boolean {
        return phone.length in 10..15 && phone.all { it.isDigit() || it == '+' }
    }

    fun isValidUID(uid: String): Boolean {
        return uid.length in 6..12 && uid.all { it.isDigit() }
    }
}

// ===== Constants =====
object AppConstants {
    const val SUPABASE_URL = "https://pppcwawjjpwwrmvezcdy.supabase.co"
    const val SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBwcGN3YXdqanB3d3JtdmV6Y2R5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjgzMzQ4OTYsImV4cCI6MjA4MzkxMDg5Nn0.VUy58uiU63Kb3i4qj2ALK2s3arjBJ25CbnwCcvblpQw"
    const val LIVEKIT_URL = "wss://merilive-ixwp6kps.livekit.cloud"
    
    const val MAX_AVATAR_SIZE = 512
    const val MAX_UPLOAD_SIZE_MB = 10
    const val CALL_TIMEOUT_MS = 30_000L
    const val RECONNECT_DELAY_MS = 3_000L
    const val HEARTBEAT_INTERVAL_MS = 15_000L
    
    const val PREF_ACCESS_TOKEN = "access_token"
    const val PREF_REFRESH_TOKEN = "refresh_token"
    const val PREF_USER_ID = "user_id"
    const val PREF_FCM_TOKEN = "fcm_token"
    const val PREF_LANGUAGE = "app_language"
    const val PREF_THEME = "app_theme"
}