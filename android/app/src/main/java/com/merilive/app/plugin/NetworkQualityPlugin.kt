package com.merilive.app.plugin

/**
 * Pkg441 — Network Quality Plugin
 *
 * Watches connectivity + transport type + estimated bandwidth and emits
 * `networkChange` events so the JS layer (LiveKit adaptive bitrate, viewer
 * quality auto-switch, host weak-network badge) can react instantly.
 *
 * - getStatus(): returns current snapshot
 * - addListener('networkChange', cb): live updates on every change
 *
 * Safe by construction:
 *   • try/catch + call.reject() on every @PluginMethod
 *   • ConnectivityManager.NetworkCallback unregistered in handleOnDestroy
 *   • No background threads; OS delivers callbacks
 */

import android.Manifest
import android.content.Context
import android.net.ConnectivityManager
import android.net.Network
import android.net.NetworkCapabilities
import android.net.NetworkRequest
import android.os.Build
import android.telephony.TelephonyManager
import android.util.Log
import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin
import com.getcapacitor.annotation.Permission

@CapacitorPlugin(
    name = "NetworkQuality",
    permissions = [
        Permission(strings = [Manifest.permission.ACCESS_NETWORK_STATE], alias = "network"),
        Permission(strings = [Manifest.permission.READ_PHONE_STATE], alias = "phone")
    ]
)
class NetworkQualityPlugin : Plugin() {

    companion object { private const val TAG = "NetworkQualityPlugin" }

    private var cm: ConnectivityManager? = null
    private var callback: ConnectivityManager.NetworkCallback? = null

    override fun load() {
        try {
            cm = context.getSystemService(Context.CONNECTIVITY_SERVICE) as? ConnectivityManager
            registerCallback()
        } catch (e: Throwable) {
            Log.w(TAG, "load failed: ${e.message}")
        }
    }

    override fun handleOnDestroy() {
        try {
            callback?.let { cm?.unregisterNetworkCallback(it) }
        } catch (_: Throwable) {}
        callback = null
        cm = null
        super.handleOnDestroy()
    }

    private fun registerCallback() {
        val mgr = cm ?: return
        val req = NetworkRequest.Builder()
            .addCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET)
            .build()
        val cb = object : ConnectivityManager.NetworkCallback() {
            override fun onAvailable(network: Network) { emit() }
            // Pkg-audit Tier-4: do NOT blindly emit offline=true here — onLost
            // fires when ONE network is lost (e.g. wifi drops while cellular
            // is still active), and a false offline flash forces LiveKit
            // adaptive bitrate to drop quality unnecessarily. Re-query the
            // active network instead so buildSnapshot derives truth from
            // ConnectivityManager state.
            override fun onLost(network: Network) { emit() }
            override fun onCapabilitiesChanged(n: Network, caps: NetworkCapabilities) { emit(caps) }
        }
        try {
            mgr.registerNetworkCallback(req, cb)
            callback = cb
        } catch (e: Throwable) {
            Log.w(TAG, "registerNetworkCallback failed: ${e.message}")
        }
    }

    private fun emit(caps: NetworkCapabilities? = null) {
        try {
            val snap = buildSnapshot(caps)
            notifyListeners("networkChange", snap)
        } catch (_: Throwable) {}
    }

    @PluginMethod
    fun getStatus(call: PluginCall) {
        try {
            call.resolve(buildSnapshot(null))
        } catch (e: Throwable) {
            call.reject("getStatus failed: ${e.message}")
        }
    }

    private fun buildSnapshot(capsIn: NetworkCapabilities?): JSObject {
        val out = JSObject()
        val mgr = cm
        val net = mgr?.activeNetwork
        val caps = capsIn ?: (net?.let { mgr.getNetworkCapabilities(it) })

        // Pkg-audit Tier-4: derive online purely from ConnectivityManager
        // — onLost on a non-default network must not cause a false offline.
        val online = caps != null &&
            caps.hasCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET)
        out.put("online", online)

        var transport = "unknown"
        if (caps != null) {
            transport = when {
                caps.hasTransport(NetworkCapabilities.TRANSPORT_WIFI) -> "wifi"
                caps.hasTransport(NetworkCapabilities.TRANSPORT_CELLULAR) -> "cellular"
                caps.hasTransport(NetworkCapabilities.TRANSPORT_ETHERNET) -> "ethernet"
                caps.hasTransport(NetworkCapabilities.TRANSPORT_VPN) -> "vpn"
                else -> "unknown"
            }
        } else if (!online) {
            transport = "none"
        }
        out.put("transport", transport)

        // Cellular subtype (4G/5G/3G)
        var cellularType: String? = null
        if (transport == "cellular") {
            try {
                val tm = context.getSystemService(Context.TELEPHONY_SERVICE) as? TelephonyManager
                cellularType = mapDataNetworkType(tm?.dataNetworkType ?: TelephonyManager.NETWORK_TYPE_UNKNOWN)
            } catch (_: SecurityException) {
                cellularType = "cellular"
            } catch (_: Throwable) {
                cellularType = "cellular"
            }
        }
        out.put("cellularType", cellularType ?: JSObject.NULL)

        var downKbps = 0
        var upKbps = 0
        if (caps != null) {
            try { downKbps = caps.linkDownstreamBandwidthKbps } catch (_: Throwable) {}
            try { upKbps = caps.linkUpstreamBandwidthKbps } catch (_: Throwable) {}
        }
        out.put("downstreamKbps", downKbps)
        out.put("upstreamKbps", upKbps)

        // Metered / VPN flags
        var metered = false
        var vpn = false
        if (caps != null) {
            metered = !caps.hasCapability(NetworkCapabilities.NET_CAPABILITY_NOT_METERED)
            vpn = caps.hasTransport(NetworkCapabilities.TRANSPORT_VPN)
        }
        out.put("metered", metered)
        out.put("vpn", vpn)

        // Quality bucket — for "show low-quality switch" UI hint
        val quality = when {
            !online -> "offline"
            downKbps in 1..399 -> "poor"
            downKbps in 400..1499 -> "fair"
            downKbps in 1500..4999 -> "good"
            downKbps >= 5000 -> "excellent"
            transport == "wifi" -> "good"
            cellularType == "5g" -> "excellent"
            cellularType == "4g" || cellularType == "lte" -> "good"
            cellularType == "3g" -> "fair"
            cellularType == "2g" -> "poor"
            else -> "unknown"
        }
        out.put("quality", quality)

        return out
    }

    private fun mapDataNetworkType(t: Int): String = when (t) {
        TelephonyManager.NETWORK_TYPE_NR -> "5g"
        TelephonyManager.NETWORK_TYPE_LTE -> "4g"
        TelephonyManager.NETWORK_TYPE_HSPAP,
        TelephonyManager.NETWORK_TYPE_HSPA,
        TelephonyManager.NETWORK_TYPE_HSDPA,
        TelephonyManager.NETWORK_TYPE_HSUPA,
        TelephonyManager.NETWORK_TYPE_UMTS,
        TelephonyManager.NETWORK_TYPE_EVDO_A,
        TelephonyManager.NETWORK_TYPE_EVDO_B,
        TelephonyManager.NETWORK_TYPE_EVDO_0,
        TelephonyManager.NETWORK_TYPE_EHRPD -> "3g"
        TelephonyManager.NETWORK_TYPE_GPRS,
        TelephonyManager.NETWORK_TYPE_EDGE,
        TelephonyManager.NETWORK_TYPE_CDMA,
        TelephonyManager.NETWORK_TYPE_1xRTT,
        TelephonyManager.NETWORK_TYPE_IDEN -> "2g"
        else -> "cellular"
    }
}
