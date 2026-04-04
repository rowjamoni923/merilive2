# ==========================================
# ProGuard Rules for LiveKit Native Plugin
# Add these to your proguard-rules.pro file
# ==========================================

# === LiveKit SDK ===
-keep class io.livekit.** { *; }
-dontwarn io.livekit.**

# === WebRTC ===
-keep class org.webrtc.** { *; }
-dontwarn org.webrtc.**

# === Kotlin Coroutines ===
-keepnames class kotlinx.coroutines.** { *; }
-dontwarn kotlinx.coroutines.**

# === LiveKit Native Plugin ===
-keep class com.merilive.app.plugins.LiveKitNativePlugin { *; }

# === Capacitor Plugin Annotations ===
-keep @com.getcapacitor.annotation.CapacitorPlugin class * { *; }
-keep @com.getcapacitor.PluginMethod class * { *; }
