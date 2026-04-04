package com.merilive.app.util

import android.content.Context
import android.content.pm.PackageManager
import android.os.Build
import android.util.Log

/**
 * App version checking and update prompts
 */
object VersionChecker {
    data class VersionInfo(
        val currentVersionCode: Int = 1,
        val currentVersionName: String = "1.0.0",
        val minVersionCode: Int = 1,
        val forceUpdate: Boolean = false,
        val updateMessage: String? = null,
        val playStoreUrl: String? = null,
    )

    fun getInstalledVersionCode(context: Context): Int {
        return try {
            val pInfo = context.packageManager.getPackageInfo(context.packageName, 0)
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
                pInfo.longVersionCode.toInt()
            } else {
                @Suppress("DEPRECATION")
                pInfo.versionCode
            }
        } catch (e: PackageManager.NameNotFoundException) {
            1
        }
    }

    fun getInstalledVersionName(context: Context): String {
        return try {
            context.packageManager.getPackageInfo(context.packageName, 0).versionName ?: "1.0.0"
        } catch (e: Exception) {
            "1.0.0"
        }
    }

    fun needsUpdate(installed: Int, serverInfo: VersionInfo): Boolean {
        return installed < serverInfo.minVersionCode
    }

    fun needsForceUpdate(installed: Int, serverInfo: VersionInfo): Boolean {
        return serverInfo.forceUpdate && installed < serverInfo.currentVersionCode
    }
}