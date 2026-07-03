package com.merilive.app.plugin;

import android.content.Context;
import android.content.Intent;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.net.Uri;
import android.os.Build;
import androidx.core.app.Person;
import androidx.core.content.pm.ShortcutInfoCompat;
import androidx.core.content.pm.ShortcutManagerCompat;
import androidx.core.graphics.drawable.IconCompat;

import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.merilive.app.MainActivity;

import java.util.ArrayList;
import java.util.List;

/**
 * Pkg248 — Conversation shortcuts + Direct Share.
 *
 * Pushes dynamic shortcuts categorized as `android.shortcut.conversation` so:
 *   - Long-press launcher icon shows the user's top recent DMs.
 *   - System share sheet ("Share via…") surfaces those people as direct
 *     targets, WhatsApp/Telegram parity.
 *
 * JS pushes up to 4 conversations on app resume / chat-list change. Each
 * entry: { id, name, avatarBase64?, route }. We build an Intent that
 * opens MainActivity with `route` extra → handleNotificationRoute() →
 * loadUrl(route). Person + setLongLived(true) is what unlocks Direct Share
 * (and Bubbles, but we skipped those at user request).
 */
@CapacitorPlugin(name = "ConversationShortcuts")
public class ConversationShortcutsPlugin extends Plugin {

    @PluginMethod
    public void push(PluginCall call) {
        try {
            Context ctx = getContext();
            JSArray items = call.getArray("items");
            if (items == null) { call.reject("items required"); return; }

            int maxCount = ShortcutManagerCompat.getMaxShortcutCountPerActivity(ctx);
            int limit = Math.min(items.length(), Math.max(1, maxCount - 4)); // leave room for static
            List<ShortcutInfoCompat> shortcuts = new ArrayList<>(limit);

            for (int i = 0; i < limit; i++) {
                JSObject it = JSObject.fromJSONObject(items.getJSONObject(i));
                String id = it.getString("id");
                String name = it.getString("name", "Chat");
                String route = it.getString("route", "/chat");
                String avatarB64 = it.getString("avatarBase64", null);
                if (id == null) continue;

                IconCompat icon = decodeIcon(avatarB64);

                Person person = new Person.Builder()
                    .setName(name)
                    .setKey(id)
                    .setIcon(icon)
                    .setImportant(true)
                    .build();

                Intent intent = new Intent(ctx, MainActivity.class);
                intent.setAction(Intent.ACTION_VIEW);
                intent.putExtra("route", route);
                intent.setData(Uri.parse("merilive://chat/" + Uri.encode(id)));

                ShortcutInfoCompat.Builder b = new ShortcutInfoCompat.Builder(ctx, "conv_" + id)
                    .setShortLabel(name)
                    .setLongLabel(name)
                    .setIntent(intent)
                    .setPerson(person)
                    .setLongLived(true)
                    .setCategories(java.util.Collections.singleton("android.shortcut.conversation"))
                    .setRank(i);

                if (icon != null) b.setIcon(icon);
                else b.setIcon(IconCompat.createWithResource(ctx, com.merilive.app.R.drawable.ic_shortcut_chat));

                shortcuts.add(b.build());
            }

            ShortcutManagerCompat.removeAllDynamicShortcuts(ctx);
            if (!shortcuts.isEmpty()) {
                // pushDynamicShortcut adds to dynamic list AND reports usage for Direct Share ranking.
                // Do NOT call setDynamicShortcuts first — that causes duplicates on API 29+.
                for (ShortcutInfoCompat s : shortcuts) {
                    ShortcutManagerCompat.pushDynamicShortcut(ctx, s);
                }
            }

            JSObject ret = new JSObject();
            ret.put("count", shortcuts.size());
            ret.put("max", maxCount);
            call.resolve(ret);
        } catch (Throwable t) {
            call.reject(t.getMessage(), t);
        }
    }

    @PluginMethod
    public void reportUsage(PluginCall call) {
        try {
            String id = call.getString("id");
            if (id == null) { call.reject("id required"); return; }
            ShortcutManagerCompat.reportShortcutUsed(getContext(), "conv_" + id);
            call.resolve();
        } catch (Throwable t) { call.reject(t.getMessage()); }
    }

    @PluginMethod
    public void clear(PluginCall call) {
        try {
            ShortcutManagerCompat.removeAllDynamicShortcuts(getContext());
            call.resolve();
        } catch (Throwable t) { call.reject(t.getMessage()); }
    }

    private IconCompat decodeIcon(String b64) {
        if (b64 == null || b64.isEmpty()) return null;
        try {
            String clean = b64.contains(",") ? b64.substring(b64.indexOf(',') + 1) : b64;
            byte[] bytes = android.util.Base64.decode(clean, android.util.Base64.DEFAULT);
            Bitmap bmp = BitmapFactory.decodeByteArray(bytes, 0, bytes.length);
            if (bmp == null) return null;
            // Square crop + downscale to 96px for shortcut icon
            int size = Math.min(bmp.getWidth(), bmp.getHeight());
            int x = (bmp.getWidth() - size) / 2;
            int y = (bmp.getHeight() - size) / 2;
            Bitmap square = Bitmap.createBitmap(bmp, x, y, size, size);
            if (square != bmp) { try { bmp.recycle(); } catch (Throwable ignored) {} }
            Bitmap scaled = Bitmap.createScaledBitmap(square, 96, 96, true);
            if (scaled != square) { try { square.recycle(); } catch (Throwable ignored) {} }
            IconCompat icon;
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                icon = IconCompat.createWithAdaptiveBitmap(scaled);
            } else {
                icon = IconCompat.createWithBitmap(scaled);
            }
            return icon;
        } catch (Throwable t) { return null; }
    }
}
