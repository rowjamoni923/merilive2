# ========================
# ProGuard Rules - MeriLive
# ========================

# === Kotlin Serialization ===
-keepattributes *Annotation*, InnerClasses
-dontnote kotlinx.serialization.AnnotationsKt
-keepclassmembers class kotlinx.serialization.json.** { *; }
-keepclasseswithmembers class * {
    kotlinx.serialization.KSerializer serializer(...);
}
-keep,includedescriptorclasses class com.merilive.app.**$$serializer { *; }
-keepclassmembers class com.merilive.app.** {
    *** Companion;
}
-keepclasseswithmembers class com.merilive.app.** {
    kotlinx.serialization.KSerializer serializer(...);
}

# === Supabase ===
-keep class io.github.jan.supabase.** { *; }
-keep class io.github.jan.supabase.auth.** { *; }
-keep class io.github.jan.supabase.postgrest.** { *; }
-keep class io.github.jan.supabase.realtime.** { *; }
-keep class io.github.jan.supabase.storage.** { *; }
-keep class io.github.jan.supabase.functions.** { *; }

# === Ktor (Required for Supabase) ===
-keep class io.ktor.** { *; }
-dontwarn io.ktor.**
-keep class io.ktor.client.plugins.** { *; }
-keepclassmembers class io.ktor.** { volatile <fields>; }

# === LiveKit ===
-keep class io.livekit.** { *; }
-keep class livekit.** { *; }
-keep class livekit.org.webrtc.** { *; }
-keep class org.webrtc.** { *; }
-dontwarn org.webrtc.**
-dontwarn livekit.org.webrtc.**

# === DeepAR ===
-keep class ai.deepar.** { *; }
-keep class ai.deepar.ar.** { *; }
-dontwarn ai.deepar.**

# === Google Play Billing ===
-keep class com.android.vending.billing.** { *; }
-keep class com.android.billingclient.** { *; }

# === Firebase ===
-keep class com.google.firebase.** { *; }
-dontwarn com.google.firebase.**

# === Coil Image Loading ===
-keep class coil.** { *; }

# === SVGA ===
-keep class com.opensource.svgaplayer.** { *; }
-keep class com.squareup.wire.** { *; }

# === Lottie ===
-keep class com.airbnb.lottie.** { *; }

# === Hilt ===
-keep class dagger.hilt.** { *; }
-keep class * extends dagger.hilt.android.internal.managers.ViewComponentManager$FragmentContextWrapper { *; }

# === General ===
-keepattributes Signature
-keepattributes Exceptions
-keepattributes SourceFile,LineNumberTable
-renamesourcefileattribute SourceFile

# Keep data classes used with Supabase
-keep class com.merilive.app.data.** { *; }
-keep class com.merilive.app.ui.**.* { *; }