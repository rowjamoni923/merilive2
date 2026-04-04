package com.merilive.app.util

import android.content.Context
import android.content.res.Configuration
import java.util.Locale

object LocaleManager {
    private const val PREF_LANGUAGE = "app_language"

    fun setLocale(context: Context, languageCode: String): Context {
        saveLanguage(context, languageCode)
        return updateResources(context, languageCode)
    }

    fun getLocale(context: Context): String {
        val prefs = context.getSharedPreferences("merilive_prefs", Context.MODE_PRIVATE)
        return prefs.getString(PREF_LANGUAGE, "en") ?: "en"
    }

    fun onAttach(context: Context): Context {
        val lang = getLocale(context)
        return updateResources(context, lang)
    }

    private fun saveLanguage(context: Context, language: String) {
        val prefs = context.getSharedPreferences("merilive_prefs", Context.MODE_PRIVATE)
        prefs.edit().putString(PREF_LANGUAGE, language).apply()
    }

    private fun updateResources(context: Context, language: String): Context {
        val locale = Locale(language)
        Locale.setDefault(locale)
        val config = Configuration(context.resources.configuration)
        config.setLocale(locale)
        return context.createConfiguredContext(config)
    }

    // Supported languages
    val SUPPORTED_LANGUAGES = mapOf(
        "en" to "English",
        "bn" to "বাংলা",
        "hi" to "हिन्दी",
        "ar" to "العربية",
        "ur" to "اردو",
        "id" to "Bahasa Indonesia",
        "ms" to "Bahasa Melayu",
        "th" to "ไทย",
        "vi" to "Tiếng Việt",
        "tr" to "Türkçe",
        "pt" to "Português",
        "es" to "Español",
    )
}