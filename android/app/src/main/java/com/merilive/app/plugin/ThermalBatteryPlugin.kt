package com.merilive.app.plugin

/**
 * Pkg441 — Thermal & Battery Plugin
 *
 * Long live-streams (1-2 hrs) heat the phone + drain battery. This plugin
 * exposes:
 *   • PowerManager thermal status (NONE/LIGHT/MODERATE/SEVERE/CRITICAL/EMERGENCY/SHUTDOWN)
 *   • Battery level %, charging state, low-power-mode flag
 *   • ActivityManager.isLowRamDevice() — for auto-disable beauty on cheap phones
 *
 * Events:
 *   • thermalChange  — fires when thermal status moves (API 29+)
 *   • batteryChange  — fires on plug/unplug + every level tick
 *   • powerSaveChange — fires when battery saver toggles
 *
 * Safe by construction:
 *   • try/catch on every @PluginMethod
 *   • All receivers + listeners unregistered in handleOnDestroy
 */

import android.app.ActivityManager
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.os.BatteryManager
import android.os.Build
import android.os.PowerManager
import android.util.Log
import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin

@CapacitorPlugin(name = "ThermalBattery")
class ThermalBatteryPlugin : Plugin() {

    companion object {
        private const val TAG = "ThermalBatteryPlugin"
        // Pkg500 Phase H — local broadcast emitted alongside JS notifyListeners
        // so in-process consumers (PrivateCallActivity) can subscribe directly.
        const val ACTION_THERMAL_CHANGE = "com.merilive.app.action.THERMAL_CHANGE"
    }


    private var thermalListener: PowerManager.OnThermalStatusChangedListener? = null
    private var batteryReceiver: BroadcastReceiver? = null
    private var powerSaveReceiver: BroadcastReceiver? = null

    override fun load() {
        try { registerThermal() } catch (e: Throwable) { Log.w(TAG, "registerThermal failed: ${e.message}") }
        try { registerBattery() } catch (e: Throwable) { Log.w(TAG, "registerBattery failed: ${e.message}") }
        try { registerPowerSave() } catch (e: Throwable) { Log.w(TAG, "registerPowerSave failed: ${e.message}") }
    }

    override fun handleOnDestroy() {
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q && thermalListener != null) {
                val pm = context.getSystemService(Context.POWER_SERVICE) as? PowerManager
                pm?.removeThermalStatusListener(thermalListener!!)
            }
        } catch (_: Throwable) {}
        try { batteryReceiver?.let { context.unregisterReceiver(it) } } catch (_: Throwable) {}
        try { powerSaveReceiver?.let { context.unregisterReceiver(it) } } catch (_: Throwable) {}
        thermalListener = null
        batteryReceiver = null
        powerSaveReceiver = null
        super.handleOnDestroy()
    }

    // ─────────── Thermal ───────────

    private fun registerThermal() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.Q) return
        val pm = context.getSystemService(Context.POWER_SERVICE) as? PowerManager ?: return
        val listener = PowerManager.OnThermalStatusChangedListener { status ->
            try {
                val label = thermalLabel(status)
                val obj = JSObject()
                obj.put("status", label)
                obj.put("statusCode", status)
                notifyListeners("thermalChange", obj)
                // Pkg500 Phase H — local broadcast so PrivateCallActivity's
                // CameraResilienceController can react without a JS round-trip.
                try {
                    val i = Intent(ACTION_THERMAL_CHANGE).apply {
                        setPackage(context.packageName)
                        putExtra("status", label)
                        putExtra("statusCode", status)
                    }
                    context.sendBroadcast(i)
                } catch (_: Throwable) {}
            } catch (_: Throwable) {}
        }
        pm.addThermalStatusListener(listener)
        thermalListener = listener
    }




    private fun thermalLabel(s: Int): String = when (s) {
        PowerManager.THERMAL_STATUS_NONE -> "none"
        PowerManager.THERMAL_STATUS_LIGHT -> "light"
        PowerManager.THERMAL_STATUS_MODERATE -> "moderate"
        PowerManager.THERMAL_STATUS_SEVERE -> "severe"
        PowerManager.THERMAL_STATUS_CRITICAL -> "critical"
        PowerManager.THERMAL_STATUS_EMERGENCY -> "emergency"
        PowerManager.THERMAL_STATUS_SHUTDOWN -> "shutdown"
        else -> "unknown"
    }

    @PluginMethod
    fun getThermalStatus(call: PluginCall) {
        try {
            val out = JSObject()
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                val pm = context.getSystemService(Context.POWER_SERVICE) as? PowerManager
                val s = pm?.currentThermalStatus ?: PowerManager.THERMAL_STATUS_NONE
                out.put("status", thermalLabel(s))
                out.put("statusCode", s)
                out.put("supported", true)
            } else {
                out.put("status", "none")
                out.put("statusCode", 0)
                out.put("supported", false)
            }
            call.resolve(out)
        } catch (e: Throwable) {
            call.reject("getThermalStatus failed: ${e.message}")
        }
    }

    // ─────────── Battery ───────────

    private fun registerBattery() {
        val filter = IntentFilter(Intent.ACTION_BATTERY_CHANGED)
        val r = object : BroadcastReceiver() {
            override fun onReceive(c: Context?, i: Intent?) {
                try { notifyListeners("batteryChange", batterySnapshot(i)) } catch (_: Throwable) {}
            }
        }
        // Pkg-audit Tier-13: API 33+ enforces explicit export flag on
        // context-registered receivers (targetSdk 34). System-broadcast only,
        // so RECEIVER_NOT_EXPORTED is correct — without it, SecurityException
        // at registration kills the battery snapshot path entirely.
        androidx.core.content.ContextCompat.registerReceiver(
            context, r, filter,
            androidx.core.content.ContextCompat.RECEIVER_NOT_EXPORTED
        )
        batteryReceiver = r
    }

    private fun batterySnapshot(intent: Intent?): JSObject {
        val out = JSObject()
        val sticky = intent ?: context.registerReceiver(null, IntentFilter(Intent.ACTION_BATTERY_CHANGED))
        var level = -1; var scale = -1; var status = -1; var plugged = -1
        if (sticky != null) {
            level = sticky.getIntExtra(BatteryManager.EXTRA_LEVEL, -1)
            scale = sticky.getIntExtra(BatteryManager.EXTRA_SCALE, -1)
            status = sticky.getIntExtra(BatteryManager.EXTRA_STATUS, -1)
            plugged = sticky.getIntExtra(BatteryManager.EXTRA_PLUGGED, -1)
        }
        val pct = if (level >= 0 && scale > 0) (level * 100 / scale) else -1
        val charging = status == BatteryManager.BATTERY_STATUS_CHARGING ||
            status == BatteryManager.BATTERY_STATUS_FULL
        out.put("level", pct)
        out.put("isCharging", charging)
        out.put("pluggedSource", when (plugged) {
            BatteryManager.BATTERY_PLUGGED_AC -> "ac"
            BatteryManager.BATTERY_PLUGGED_USB -> "usb"
            BatteryManager.BATTERY_PLUGGED_WIRELESS -> "wireless"
            0 -> "none"
            else -> "unknown"
        })
        // Power save mode + low-RAM device — handy hints for auto-quality
        try {
            val pm = context.getSystemService(Context.POWER_SERVICE) as? PowerManager
            out.put("powerSaveMode", pm?.isPowerSaveMode == true)
        } catch (_: Throwable) { out.put("powerSaveMode", false) }
        try {
            val am = context.getSystemService(Context.ACTIVITY_SERVICE) as? ActivityManager
            out.put("isLowRamDevice", am?.isLowRamDevice == true)
        } catch (_: Throwable) { out.put("isLowRamDevice", false) }
        return out
    }

    @PluginMethod
    fun getBatteryStatus(call: PluginCall) {
        try { call.resolve(batterySnapshot(null)) }
        catch (e: Throwable) { call.reject("getBatteryStatus failed: ${e.message}") }
    }

    // ─────────── Power-Save ───────────

    private fun registerPowerSave() {
        val filter = IntentFilter(PowerManager.ACTION_POWER_SAVE_MODE_CHANGED)
        val r = object : BroadcastReceiver() {
            override fun onReceive(c: Context?, i: Intent?) {
                try {
                    val pm = context.getSystemService(Context.POWER_SERVICE) as? PowerManager
                    val obj = JSObject()
                    obj.put("powerSaveMode", pm?.isPowerSaveMode == true)
                    notifyListeners("powerSaveChange", obj)
                } catch (_: Throwable) {}
            }
        }
        // Pkg-audit Tier-13: same RECEIVER_NOT_EXPORTED guard for API 33+
        // — system-only broadcast, must be explicitly flagged.
        androidx.core.content.ContextCompat.registerReceiver(
            context, r, filter,
            androidx.core.content.ContextCompat.RECEIVER_NOT_EXPORTED
        )
        powerSaveReceiver = r
    }

    @PluginMethod
    fun getDeviceCapabilities(call: PluginCall) {
        try {
            val out = JSObject()
            val am = context.getSystemService(Context.ACTIVITY_SERVICE) as? ActivityManager
            out.put("isLowRamDevice", am?.isLowRamDevice == true)
            out.put("memoryClassMb", am?.memoryClass ?: 0)
            out.put("largeMemoryClassMb", am?.largeMemoryClass ?: 0)
            out.put("sdkInt", Build.VERSION.SDK_INT)
            out.put("model", Build.MODEL ?: "")
            out.put("manufacturer", Build.MANUFACTURER ?: "")
            call.resolve(out)
        } catch (e: Throwable) {
            call.reject("getDeviceCapabilities failed: ${e.message}")
        }
    }
}
