package com.merilive.app.plugin

import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.Response
import okhttp3.WebSocket
import okhttp3.WebSocketListener
import okio.ByteString
import java.util.concurrent.ConcurrentHashMap
import java.util.concurrent.TimeUnit
import java.util.concurrent.atomic.AtomicInteger

/**
 * Pkg431 — WebSocketBridgePlugin
 *
 * Native OkHttp WebSocket bridge. Designed for Supabase Realtime (Phoenix
 * Channels protocol) but transport-agnostic — JS sends raw text frames,
 * receives raw text/binary frames via plugin events.
 *
 * Why native: the WebView socket is killed by Android when the activity
 * backgrounds for >30s on many OEMs (Xiaomi/Vivo/Oppo aggressive doze).
 * A native OkHttp socket lives in the foreground service/process and only
 * gets torn down by the OS. It also survives WebView reloads, so chat
 * presence / live counters stay accurate.
 *
 * Multi-socket: each `connect()` call returns a numeric `socketId`. JS
 * tracks ids; the plugin holds the WebSocket and pumps frames back as
 * `ws:event` notifications carrying `{socketId, type, data?}`.
 *
 * ZERO behaviour change for callers that don't opt in. Default Supabase
 * Realtime path continues to use the JS WebSocket inside the WebView
 * until a future Pkg wires this up via `socketNativeFlag`.
 *
 * Auto-reconnect is INTENTIONALLY NOT done here — the Phoenix client on
 * the JS side already does exponential backoff + heartbeat. This plugin
 * is a pure transport. Reconnect = JS calls `connect()` again with a
 * fresh URL/token.
 */
@CapacitorPlugin(name = "WebSocketBridge")
class WebSocketBridgePlugin : Plugin() {

    private val sockets = ConcurrentHashMap<Int, WebSocket>()
    private val idGen = AtomicInteger(0)

    // ONE shared OkHttp client for every socket — connection pool reused.
    // pingInterval keeps NAT mappings alive on cellular (most carriers
    // recycle UDP/TCP NAT entries after 60-180s of silence; we send a
    // protocol ping every 25s which is well under that floor).
    // Pkg-audit Tier-4: expose the `lazy` delegate so handleOnDestroy can
    // detect whether the OkHttpClient was ever materialized and shut its
    // dispatcher thread pool + connection pool down. Without this, the
    // dispatcher's cached ExecutorService threads survive activity destroy
    // and leak across hot-reload / activity recreation.
    private val httpDelegate = lazy {
        OkHttpClient.Builder()
            .connectTimeout(15, TimeUnit.SECONDS)
            .readTimeout(0, TimeUnit.MILLISECONDS) // never time out a long-lived socket
            .writeTimeout(15, TimeUnit.SECONDS)
            .pingInterval(25, TimeUnit.SECONDS)
            .retryOnConnectionFailure(true)
            .build()
    }
    private val http: OkHttpClient by httpDelegate

    // ---------------- JS API ----------------

    @PluginMethod
    fun connect(call: PluginCall) {
        val url = call.getString("url") ?: return call.reject("url required")
        val headers = call.getObject("headers", JSObject()) ?: JSObject()
        val protocol = call.getString("protocol")

        val id = idGen.incrementAndGet()
        val builder = Request.Builder().url(url)
        val iter = headers.keys()
        while (iter.hasNext()) {
            val k = iter.next()
            val v = headers.optString(k, "")
            if (v.isNotEmpty()) builder.addHeader(k, v)
        }
        if (!protocol.isNullOrEmpty()) builder.addHeader("Sec-WebSocket-Protocol", protocol)

        val listener = BridgeListener(id)
        val ws = try {
            http.newWebSocket(builder.build(), listener)
        } catch (t: Throwable) {
            return call.reject("connect_failed: ${t.message ?: "unknown"}")
        }
        sockets[id] = ws

        val res = JSObject(); res.put("socketId", id); call.resolve(res)
    }

    @PluginMethod
    fun send(call: PluginCall) {
        val id = call.getInt("socketId") ?: return call.reject("socketId required")
        val data = call.getString("data") ?: return call.reject("data required")
        val ws = sockets[id] ?: return call.reject("socket_not_found")
        val ok = ws.send(data)
        val res = JSObject(); res.put("queued", ok); call.resolve(res)
    }

    @PluginMethod
    fun sendBinary(call: PluginCall) {
        val id = call.getInt("socketId") ?: return call.reject("socketId required")
        val b64 = call.getString("data") ?: return call.reject("data required")
        val ws = sockets[id] ?: return call.reject("socket_not_found")
        val bytes = try {
            android.util.Base64.decode(b64, android.util.Base64.NO_WRAP)
        } catch (t: Throwable) {
            return call.reject("invalid_base64")
        }
        val ok = ws.send(ByteString.of(*bytes))
        val res = JSObject(); res.put("queued", ok); call.resolve(res)
    }

    @PluginMethod
    fun close(call: PluginCall) {
        val id = call.getInt("socketId") ?: return call.reject("socketId required")
        val code = call.getInt("code", 1000) ?: 1000
        val reason = call.getString("reason", "client_close") ?: "client_close"
        val ws = sockets.remove(id) ?: return call.resolve()
        try { ws.close(code, reason) } catch (_: Throwable) { /* ignore */ }
        call.resolve()
    }

    @PluginMethod
    fun isOpen(call: PluginCall) {
        val id = call.getInt("socketId") ?: return call.reject("socketId required")
        val out = JSObject(); out.put("open", sockets[id] != null); call.resolve(out)
    }

    @PluginMethod
    fun status(call: PluginCall) {
        val out = JSObject(); out.put("count", sockets.size); call.resolve(out)
    }

    override fun handleOnDestroy() {
        // Best-effort tear down on activity destroy. JS will reconnect on
        // next launch — Phoenix client already idempotent.
        sockets.values.forEach { ws ->
            try { ws.close(1001, "activity_destroyed") } catch (_: Throwable) {}
        }
        sockets.clear()
        // Pkg-audit Tier-4: release OkHttp dispatcher threads + connection pool
        // so they don't outlive the activity. Only touch the client if it was
        // actually materialized — otherwise we'd needlessly construct + tear
        // down a client just to free nothing.
        if (httpDelegate.isInitialized()) {
            try { http.dispatcher.executorService.shutdown() } catch (_: Throwable) {}
            try { http.connectionPool.evictAll() } catch (_: Throwable) {}
        }
        super.handleOnDestroy()
    }

    // ---------------- Listener ----------------

    private inner class BridgeListener(private val id: Int) : WebSocketListener() {

        override fun onOpen(webSocket: WebSocket, response: Response) {
            emit("open", null, null, response.code)
        }

        override fun onMessage(webSocket: WebSocket, text: String) {
            emit("message", text, null, null)
        }

        override fun onMessage(webSocket: WebSocket, bytes: ByteString) {
            // Forward as base64 — JS callers explicitly opt into binary by
            // checking `binary:true` in the event payload.
            val b64 = android.util.Base64.encodeToString(bytes.toByteArray(), android.util.Base64.NO_WRAP)
            emit("message", b64, true, null)
        }

        override fun onClosing(webSocket: WebSocket, code: Int, reason: String) {
            try { webSocket.close(code, reason) } catch (_: Throwable) {}
        }

        override fun onClosed(webSocket: WebSocket, code: Int, reason: String) {
            sockets.remove(id)
            val payload = JSObject()
            payload.put("socketId", id)
            payload.put("type", "close")
            payload.put("code", code)
            payload.put("reason", reason)
            notifyListeners("ws:event", payload)
        }

        override fun onFailure(webSocket: WebSocket, t: Throwable, response: Response?) {
            sockets.remove(id)
            val payload = JSObject()
            payload.put("socketId", id)
            payload.put("type", "error")
            payload.put("message", t.message ?: t.javaClass.simpleName)
            response?.let { payload.put("status", it.code) }
            notifyListeners("ws:event", payload)
        }

        private fun emit(type: String, data: String?, binary: Boolean?, status: Int?) {
            val payload = JSObject()
            payload.put("socketId", id)
            payload.put("type", type)
            if (data != null) payload.put("data", data)
            if (binary != null) payload.put("binary", binary)
            if (status != null) payload.put("status", status)
            notifyListeners("ws:event", payload)
        }
    }
}
