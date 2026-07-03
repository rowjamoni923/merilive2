package com.merilive.app.plugin;

import android.content.Context;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.merilive.app.receiver.MessageActionReceiver;

import org.json.JSONArray;
import org.json.JSONObject;

import java.util.concurrent.ConcurrentLinkedQueue;

/**
 * Pkg209 — NativeMessageReply.
 *
 * Bridges MessageActionReceiver (inline reply / mark-read triggered
 * from the notification shade) into the JS layer so the existing
 * Supabase client can do the durable write under the user's own JWT.
 *
 * Two delivery paths:
 *   1. Real-time event "message-action" when JS is attached.
 *   2. Cold-start drain via drainPending() — pulls everything queued
 *      while the app process was dead and resolves with the same shape.
 */
@CapacitorPlugin(name = "NativeMessageReply")
public class NativeMessageReplyPlugin extends Plugin {

    private static final ConcurrentLinkedQueue<JSONObject> pending = new ConcurrentLinkedQueue<>();
    private static volatile NativeMessageReplyPlugin INSTANCE;

    public static void dispatch(Context ctx, String type, String conversationId,
                                String senderId, String body) {
        try {
            JSONObject p = new JSONObject();
            p.put("type", type);
            p.put("conversationId", conversationId == null ? "" : conversationId);
            p.put("senderId", senderId == null ? "" : senderId);
            p.put("body", body == null ? "" : body);
            p.put("ts", System.currentTimeMillis());
            pending.offer(p);
            while (pending.size() > 64) pending.poll();

            NativeMessageReplyPlugin p2 = INSTANCE;
            if (p2 != null) {
                try {
                    p2.notifyListeners("message-action", JSObject.fromJSONObject(p), true);
                } catch (Throwable ignored) {}
            }
        } catch (Throwable ignored) {}
    }

    @Override
    public void load() {
        super.load();
        INSTANCE = this;
        // Flush in-memory queued events that arrived before JS attached.
        try {
            while (!pending.isEmpty()) {
                JSONObject next = pending.poll();
                if (next != null) notifyListeners("message-action", JSObject.fromJSONObject(next), true);
            }
        } catch (Throwable ignored) {}
    }

    @Override
    protected void handleOnDestroy() {
        super.handleOnDestroy();
        if (INSTANCE == this) INSTANCE = null;
    }

    /**
     * Drain the durable SharedPreferences queue (actions captured while
     * the process was dead). JS calls this once on boot AND on every
     * foreground resume so nothing is left undelivered.
     */
    @PluginMethod
    public void drainPending(PluginCall call) {
        JSONArray durable = MessageActionReceiver.drainQueue(getContext());
        // Also drain any in-memory entries that haven't been delivered.
        JSONArray memory = new JSONArray();
        while (!pending.isEmpty()) {
            JSONObject n = pending.poll();
            if (n != null) memory.put(n);
        }
        try {
            for (int i = 0; i < memory.length(); i++) durable.put(memory.get(i));
        } catch (Throwable ignored) {}
        JSObject ret = new JSObject();
        ret.put("actions", durable);
        call.resolve(ret);
    }
}
