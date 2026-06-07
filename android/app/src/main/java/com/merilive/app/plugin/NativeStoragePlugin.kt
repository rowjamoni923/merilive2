package com.merilive.app.plugin

import android.content.ContentValues
import android.content.Context
import android.database.sqlite.SQLiteDatabase
import android.database.sqlite.SQLiteOpenHelper
import com.getcapacitor.JSArray
import com.getcapacitor.JSObject
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin
import java.util.concurrent.Executors

/**
 * Pkg430 — NativeStoragePlugin
 *
 * Offline-first key/value cache backed by SQLite (SQLiteOpenHelper, no Room
 * annotation processor — keeps build simple and APK small). Designed for:
 *   - Profile/feed/message/conversation cache (JSON blob per key)
 *   - Per-namespace TTL eviction
 *   - Atomic batch read/write for bulk cache hydration
 *   - Background thread execution (never blocks UI / JS bridge)
 *
 * ZERO behaviour change for callers that don't opt in. Web/iOS/older APKs
 * stay on localStorage via the `storageNativeFlag` gate on the JS side.
 *
 * Schema:
 *   namespace TEXT   — logical bucket (e.g. "profiles", "feed", "messages")
 *   key       TEXT   — opaque key inside the namespace
 *   value     TEXT   — JSON or raw string
 *   updated   INTEGER — epoch ms
 *   expires   INTEGER — epoch ms (0 = never expires)
 *   PRIMARY KEY(namespace, key)
 *
 * All public methods are safe to call from the main thread; the actual
 * disk IO happens on the single-thread `io` executor and resolves the
 * PluginCall when done. StrictMode (Pkg239) will NOT trip.
 */
@CapacitorPlugin(name = "NativeStorage")
class NativeStoragePlugin : Plugin() {

    private val io = Executors.newSingleThreadExecutor { r ->
        Thread(r, "NativeStorage-IO").apply { isDaemon = true }
    }

    private lateinit var helper: Helper

    override fun load() {
        super.load()
        helper = Helper(context.applicationContext)
    }

    // ---------------- JS API ----------------

    @PluginMethod
    fun set(call: PluginCall) {
        val ns = call.getString("namespace") ?: return call.reject("namespace required")
        val key = call.getString("key") ?: return call.reject("key required")
        val value = call.getString("value") ?: ""
        val ttl = call.getInt("ttlMs", 0) ?: 0
        io.execute {
            try {
                writeRow(ns, key, value, ttl.toLong())
                call.resolve()
            } catch (t: Throwable) {
                call.reject("write_failed", t)
            }
        }
    }

    @PluginMethod
    fun get(call: PluginCall) {
        val ns = call.getString("namespace") ?: return call.reject("namespace required")
        val key = call.getString("key") ?: return call.reject("key required")
        io.execute {
            try {
                val (value, expires) = readRow(ns, key)
                val out = JSObject()
                if (value != null) {
                    out.put("value", value)
                    out.put("expires", expires)
                    out.put("hit", true)
                } else {
                    out.put("hit", false)
                }
                call.resolve(out)
            } catch (t: Throwable) {
                call.reject("read_failed", t)
            }
        }
    }

    @PluginMethod
    fun remove(call: PluginCall) {
        val ns = call.getString("namespace") ?: return call.reject("namespace required")
        val key = call.getString("key") ?: return call.reject("key required")
        io.execute {
            try {
                helper.writableDatabase.delete(
                    TABLE, "namespace=? AND key=?", arrayOf(ns, key)
                )
                call.resolve()
            } catch (t: Throwable) {
                call.reject("remove_failed", t)
            }
        }
    }

    @PluginMethod
    fun clearNamespace(call: PluginCall) {
        val ns = call.getString("namespace") ?: return call.reject("namespace required")
        io.execute {
            try {
                val n = helper.writableDatabase.delete(TABLE, "namespace=?", arrayOf(ns))
                val o = JSObject(); o.put("deleted", n); call.resolve(o)
            } catch (t: Throwable) {
                call.reject("clear_failed", t)
            }
        }
    }

    @PluginMethod
    fun batchSet(call: PluginCall) {
        val ns = call.getString("namespace") ?: return call.reject("namespace required")
        val items = call.getArray("items") ?: return call.reject("items required")
        val ttl = call.getInt("ttlMs", 0) ?: 0
        io.execute {
            try {
                val db = helper.writableDatabase
                db.beginTransaction()
                try {
                    val now = System.currentTimeMillis()
                    val expires = if (ttl > 0) now + ttl else 0L
                    for (i in 0 until items.length()) {
                        val o = items.getJSONObject(i)
                        val key = o.optString("key", "")
                        if (key.isEmpty()) continue
                        val value = o.optString("value", "")
                        val cv = ContentValues().apply {
                            put("namespace", ns)
                            put("key", key)
                            put("value", value)
                            put("updated", now)
                            put("expires", expires)
                        }
                        db.insertWithOnConflict(TABLE, null, cv, SQLiteDatabase.CONFLICT_REPLACE)
                    }
                    db.setTransactionSuccessful()
                } finally {
                    db.endTransaction()
                }
                call.resolve()
            } catch (t: Throwable) {
                call.reject("batch_set_failed", t)
            }
        }
    }

    @PluginMethod
    fun batchGet(call: PluginCall) {
        val ns = call.getString("namespace") ?: return call.reject("namespace required")
        val keys = call.getArray("keys") ?: return call.reject("keys required")
        io.execute {
            try {
                val now = System.currentTimeMillis()
                val resultArr = JSArray()
                if (keys.length() == 0) {
                    val out = JSObject(); out.put("items", resultArr); call.resolve(out); return@execute
                }
                val placeholders = keys.toList<Any>().joinToString(",") { "?" }
                val args = ArrayList<String>(keys.length() + 1)
                args.add(ns)
                for (i in 0 until keys.length()) args.add(keys.getString(i))
                val c = helper.readableDatabase.rawQuery(
                    "SELECT key,value,expires FROM $TABLE WHERE namespace=? AND key IN ($placeholders)",
                    args.toTypedArray()
                )
                c.use {
                    while (it.moveToNext()) {
                        val expires = it.getLong(2)
                        if (expires != 0L && expires < now) continue
                        val row = JSObject()
                        row.put("key", it.getString(0))
                        row.put("value", it.getString(1))
                        row.put("expires", expires)
                        resultArr.put(row)
                    }
                }
                val out = JSObject(); out.put("items", resultArr); call.resolve(out)
            } catch (t: Throwable) {
                call.reject("batch_get_failed", t)
            }
        }
    }

    @PluginMethod
    fun evictExpired(call: PluginCall) {
        io.execute {
            try {
                val n = helper.writableDatabase.delete(
                    TABLE, "expires>0 AND expires<?", arrayOf(System.currentTimeMillis().toString())
                )
                val o = JSObject(); o.put("deleted", n); call.resolve(o)
            } catch (t: Throwable) {
                call.reject("evict_failed", t)
            }
        }
    }

    @PluginMethod
    fun stats(call: PluginCall) {
        io.execute {
            try {
                val db = helper.readableDatabase
                var rows = 0L
                db.rawQuery("SELECT COUNT(*) FROM $TABLE", null).use {
                    if (it.moveToFirst()) rows = it.getLong(0)
                }
                val file = context.getDatabasePath(DB_NAME)
                val sizeBytes = if (file.exists()) file.length() else 0L
                val out = JSObject()
                out.put("rows", rows)
                out.put("sizeBytes", sizeBytes)
                out.put("version", DB_VERSION)
                call.resolve(out)
            } catch (t: Throwable) {
                call.reject("stats_failed", t)
            }
        }
    }

    @PluginMethod
    fun clearAll(call: PluginCall) {
        io.execute {
            try {
                val n = helper.writableDatabase.delete(TABLE, null, null)
                val o = JSObject(); o.put("deleted", n); call.resolve(o)
            } catch (t: Throwable) {
                call.reject("clear_all_failed", t)
            }
        }
    }

    // ---------------- internal ----------------

    private fun writeRow(ns: String, key: String, value: String, ttlMs: Long) {
        val now = System.currentTimeMillis()
        val expires = if (ttlMs > 0) now + ttlMs else 0L
        val cv = ContentValues().apply {
            put("namespace", ns)
            put("key", key)
            put("value", value)
            put("updated", now)
            put("expires", expires)
        }
        helper.writableDatabase.insertWithOnConflict(
            TABLE, null, cv, SQLiteDatabase.CONFLICT_REPLACE
        )
    }

    private fun readRow(ns: String, key: String): Pair<String?, Long> {
        val now = System.currentTimeMillis()
        helper.readableDatabase.rawQuery(
            "SELECT value,expires FROM $TABLE WHERE namespace=? AND key=? LIMIT 1",
            arrayOf(ns, key)
        ).use { c ->
            if (!c.moveToFirst()) return Pair(null, 0L)
            val expires = c.getLong(1)
            if (expires != 0L && expires < now) {
                // lazy-evict on read
                helper.writableDatabase.delete(
                    TABLE, "namespace=? AND key=?", arrayOf(ns, key)
                )
                return Pair(null, 0L)
            }
            return Pair(c.getString(0), expires)
        }
    }

    private class Helper(ctx: Context) : SQLiteOpenHelper(ctx, DB_NAME, null, DB_VERSION) {
        override fun onCreate(db: SQLiteDatabase) {
            db.execSQL(
                """
                CREATE TABLE $TABLE (
                    namespace TEXT NOT NULL,
                    key TEXT NOT NULL,
                    value TEXT NOT NULL,
                    updated INTEGER NOT NULL,
                    expires INTEGER NOT NULL,
                    PRIMARY KEY(namespace, key)
                )
                """.trimIndent()
            )
            db.execSQL("CREATE INDEX idx_${TABLE}_ns ON $TABLE(namespace)")
            db.execSQL("CREATE INDEX idx_${TABLE}_exp ON $TABLE(expires) WHERE expires>0")
        }

        override fun onUpgrade(db: SQLiteDatabase, oldVersion: Int, newVersion: Int) {
            // v1 launch — nothing to migrate yet.
        }

        override fun onConfigure(db: SQLiteDatabase) {
            super.onConfigure(db)
            db.enableWriteAheadLogging()
        }
    }

    override fun handleOnDestroy() {
        try { io.shutdown() } catch (_: Throwable) {}
        // Flush WAL + close the SQLite database file handle. Without this
        // the WAL may not checkpoint on process death, causing slow next-launch
        // open and (on some OEMs) corruption risk.
        try { if (this::helper.isInitialized) helper.close() } catch (_: Throwable) {}
        super.handleOnDestroy()
    }

    companion object {
        private const val DB_NAME = "merilive_native_storage.db"
        private const val DB_VERSION = 1
        private const val TABLE = "kv"
    }
}
