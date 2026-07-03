package com.merilive.app.plugin

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.media.AudioDeviceCallback
import android.media.AudioDeviceInfo
import android.media.AudioManager
import android.os.Build
import android.os.Handler
import android.os.Looper
import com.getcapacitor.JSArray
import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin

/**
 * Pkg442 — Live audio-device routing events.
 *
 * Complements AudioFocusPlugin (which queries current route on demand).
 * This plugin pushes real-time events when wired headset is plugged/unplugged
 * or Bluetooth headset connects/disconnects, so the live-stream/call UI can:
 *   • Auto-route call audio to headset
 *   • Show "Headphones connected" toast
 *   • Auto-disable speakerphone when headphones plugged in mid-call
 *
 * Methods:
 *   • start() → begins listening
 *   • stop()
 *   • listDevices() → { devices: [{type,name,isSource}] }
 *
 * Events:
 *   • devicesChanged → { added:[...], removed:[...], hasWired, hasBluetooth }
 */
@CapacitorPlugin(name = "HeadsetRouting")
class HeadsetRoutingPlugin : Plugin() {

    private var am: AudioManager? = null
    private var deviceCallback: AudioDeviceCallback? = null
    private var wiredReceiver: BroadcastReceiver? = null
    private val mainHandler = Handler(Looper.getMainLooper())

    override fun load() {
        super.load()
        am = context.getSystemService(Context.AUDIO_SERVICE) as? AudioManager
    }

    @PluginMethod
    fun start(call: PluginCall) {
        try {
            registerDeviceCallback()
            registerWiredReceiver()
            call.resolve()
        } catch (t: Throwable) {
            call.reject("start_failed: ${t.message}", t)
        }
    }

    @PluginMethod
    fun stop(call: PluginCall) {
        unregisterAll()
        call.resolve()
    }

    @PluginMethod
    fun listDevices(call: PluginCall) {
        val ret = JSObject()
        val arr = JSArray()
        try {
            val mgr = am ?: throw IllegalStateException("audio_manager_null")
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
                val devs = mgr.getDevices(AudioManager.GET_DEVICES_ALL)
                for (d in devs) arr.put(deviceToJson(d))
            }
            ret.put("devices", arr)
            ret.put("hasWired", hasWired())
            ret.put("hasBluetooth", hasBluetooth())
            call.resolve(ret)
        } catch (t: Throwable) {
            call.reject("list_failed: ${t.message}", t)
        }
    }

    private fun registerDeviceCallback() {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.M) return
        if (deviceCallback != null) return
        val mgr = am ?: return
        deviceCallback = object : AudioDeviceCallback() {
            override fun onAudioDevicesAdded(addedDevices: Array<out AudioDeviceInfo>?) {
                emitChange(addedDevices, null)
            }
            override fun onAudioDevicesRemoved(removedDevices: Array<out AudioDeviceInfo>?) {
                emitChange(null, removedDevices)
            }
        }
        mgr.registerAudioDeviceCallback(deviceCallback, mainHandler)
    }

    private fun registerWiredReceiver() {
        if (wiredReceiver != null) return
        wiredReceiver = object : BroadcastReceiver() {
            override fun onReceive(c: Context?, intent: Intent?) {
                val state = intent?.getIntExtra("state", -1) ?: -1
                val data = JSObject()
                data.put("wiredPlugged", state == 1)
                data.put("hasWired", hasWired())
                data.put("hasBluetooth", hasBluetooth())
                notifyListeners("devicesChanged", data)
            }
        }
        @Suppress("DEPRECATION")
        val filter = IntentFilter(Intent.ACTION_HEADSET_PLUG)
        try {
            context.registerReceiver(wiredReceiver, filter)
        } catch (_: Throwable) {}
    }

    private fun emitChange(added: Array<out AudioDeviceInfo>?, removed: Array<out AudioDeviceInfo>?) {
        val data = JSObject()
        val addedArr = JSArray(); added?.forEach { addedArr.put(deviceToJson(it)) }
        val removedArr = JSArray(); removed?.forEach { removedArr.put(deviceToJson(it)) }
        data.put("added", addedArr)
        data.put("removed", removedArr)
        data.put("hasWired", hasWired())
        data.put("hasBluetooth", hasBluetooth())
        notifyListeners("devicesChanged", data)
    }

    private fun deviceToJson(d: AudioDeviceInfo): JSObject {
        val o = JSObject()
        val typeStr = when (d.type) {
            AudioDeviceInfo.TYPE_BLUETOOTH_SCO -> "bluetooth_sco"
            AudioDeviceInfo.TYPE_BLUETOOTH_A2DP -> "bluetooth_a2dp"
            AudioDeviceInfo.TYPE_WIRED_HEADSET -> "wired_headset"
            AudioDeviceInfo.TYPE_WIRED_HEADPHONES -> "wired_headphones"
            AudioDeviceInfo.TYPE_BUILTIN_SPEAKER -> "speaker"
            AudioDeviceInfo.TYPE_BUILTIN_EARPIECE -> "earpiece"
            AudioDeviceInfo.TYPE_BUILTIN_MIC -> "builtin_mic"
            AudioDeviceInfo.TYPE_USB_HEADSET -> "usb_headset"
            AudioDeviceInfo.TYPE_USB_DEVICE -> "usb_device"
            AudioDeviceInfo.TYPE_HEARING_AID -> "hearing_aid"
            else -> "other_${d.type}"
        }
        o.put("type", typeStr)
        o.put("name", d.productName?.toString() ?: "")
        o.put("isSource", d.isSource)
        o.put("isSink", d.isSink)
        return o
    }

    private fun hasWired(): Boolean {
        val mgr = am ?: return false
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.M) {
            @Suppress("DEPRECATION")
            return mgr.isWiredHeadsetOn
        }
        return mgr.getDevices(AudioManager.GET_DEVICES_OUTPUTS).any {
            it.type == AudioDeviceInfo.TYPE_WIRED_HEADSET ||
            it.type == AudioDeviceInfo.TYPE_WIRED_HEADPHONES ||
            it.type == AudioDeviceInfo.TYPE_USB_HEADSET
        }
    }

    private fun hasBluetooth(): Boolean {
        val mgr = am ?: return false
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.M) {
            return mgr.isBluetoothScoOn || mgr.isBluetoothA2dpOn
        }
        return mgr.getDevices(AudioManager.GET_DEVICES_OUTPUTS).any {
            it.type == AudioDeviceInfo.TYPE_BLUETOOTH_SCO ||
            it.type == AudioDeviceInfo.TYPE_BLUETOOTH_A2DP ||
            it.type == AudioDeviceInfo.TYPE_HEARING_AID
        }
    }

    private fun unregisterAll() {
        try {
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M && deviceCallback != null) {
                am?.unregisterAudioDeviceCallback(deviceCallback)
            }
        } catch (_: Throwable) {}
        deviceCallback = null
        try { wiredReceiver?.let { context.unregisterReceiver(it) } } catch (_: Throwable) {}
        wiredReceiver = null
    }

    override fun handleOnDestroy() {
        unregisterAll()
        super.handleOnDestroy()
    }
}
