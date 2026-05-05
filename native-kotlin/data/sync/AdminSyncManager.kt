package com.merilive.app.data.sync

import android.content.Context
import android.content.SharedPreferences
import dagger.hilt.android.qualifiers.ApplicationContext
import io.github.jan.supabase.postgrest.Postgrest
import io.github.jan.supabase.realtime.Realtime
import io.github.jan.supabase.realtime.channel
import io.github.jan.supabase.realtime.postgresChangeFlow
import io.github.jan.supabase.realtime.PostgresAction
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.decodeFromJsonElement
import javax.inject.Inject
import javax.inject.Singleton

/**
 * AdminSyncManager - Realtime sync of admin panel changes
 */
@Singleton
class AdminSyncManager @Inject constructor(
    @ApplicationContext private val context: Context,
    private val postgrest: Postgrest,
    private val realtime: Realtime,
) {
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
    private val prefs: SharedPreferences = context.getSharedPreferences("admin_sync", Context.MODE_PRIVATE)
    private val json = Json { ignoreUnknownKeys = true }

    private val _branding = MutableStateFlow<BrandingData?>(null)
    val branding = _branding.asStateFlow()

    private val _activeTheme = MutableStateFlow<ThemeData?>(null)
    val activeTheme = _activeTheme.asStateFlow()

    private val _appSettings = MutableStateFlow<Map<String, String>>(emptyMap())
    val appSettings = _appSettings.asStateFlow()

    fun initialize() {
        scope.launch {
            loadCached()
            fetchBranding()
            fetchActiveTheme()
            fetchAppSettings()
            subscribeToChanges()
        }
    }

    private fun loadCached() {
        prefs.getString("branding", null)?.let {
            _branding.value = json.decodeFromString<BrandingData>(it)
        }
        prefs.getString("theme", null)?.let {
            _activeTheme.value = json.decodeFromString<ThemeData>(it)
        }
    }

    private suspend fun fetchBranding() {
        try {
            val row = postgrest.from("branding_settings")
                .select {
                    filter { eq("setting_key", "default") }
                    limit(1)
                }
                .decodeSingleOrNull<BrandingSettingsRow>()
            val data = row?.setting_value?.let { json.decodeFromJsonElement<BrandingData>(it) }
            _branding.value = data
            data?.let { prefs.edit().putString("branding", json.encodeToString(BrandingData.serializer(), it)).apply() }
        } catch (_: Exception) {}
    }

    private suspend fun fetchActiveTheme() {
        try {
            val data = postgrest.from("app_event_themes")
                .select {
                    filter { eq("is_active", true) }
                    limit(1)
                }
                .decodeSingleOrNull<ThemeData>()
            _activeTheme.value = data
            data?.let { prefs.edit().putString("theme", json.encodeToString(ThemeData.serializer(), it)).apply() }
        } catch (_: Exception) {}
    }

    private suspend fun fetchAppSettings() {
        try {
            val result = postgrest.from("app_settings")
                .select {}
                .decodeList<AppSettingResponse>()
            _appSettings.value = result.associate { it.setting_key to it.setting_value.toString() }
        } catch (_: Exception) {}
    }

    private fun subscribeToChanges() {
        scope.launch {
            try {
                val channel = realtime.channel("admin-sync")

                val brandingFlow = channel.postgresChangeFlow<PostgresAction>(schema = "public") {
                    table = "branding_settings"
                }

                val themeFlow = channel.postgresChangeFlow<PostgresAction>(schema = "public") {
                    table = "app_event_themes"
                }

                val settingsFlow = channel.postgresChangeFlow<PostgresAction>(schema = "public") {
                    table = "app_settings"
                }

                channel.subscribe()

                launch { brandingFlow.collect { fetchBranding() } }
                launch { themeFlow.collect { fetchActiveTheme() } }
                launch { settingsFlow.collect { fetchAppSettings() } }
            } catch (_: Exception) {}
        }
    }

    fun getSetting(key: String, default: String = ""): String {
        return _appSettings.value[key] ?: default
    }
}

@Serializable
data class BrandingData(
    val id: String? = null,
    val logo_image_url: String? = null,
    val logo_text_primary: String? = null,
    val logo_text_secondary: String? = null,
    val background_url: String? = null,
    val background_type: String? = null,
    val tagline: String? = null,
)

@Serializable
data class BrandingSettingsRow(
    val id: String? = null,
    val setting_key: String? = null,
    val setting_value: JsonElement? = null,
)

@Serializable
data class ThemeData(
    val id: String? = null,
    val theme_key: String? = null,
    val theme_name: String? = null,
    val primary_color: String? = null,
    val secondary_color: String? = null,
    val accent_color: String? = null,
    val header_gradient_from: String? = null,
    val header_gradient_to: String? = null,
    val nav_bg_color: String? = null,
    val nav_active_color: String? = null,
    val floating_particles: List<String>? = null,
)

@Serializable
data class AppSettingResponse(
    val setting_key: String,
    val setting_value: kotlinx.serialization.json.JsonElement,
)