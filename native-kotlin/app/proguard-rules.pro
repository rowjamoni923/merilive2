# ===== MeriLive — Proguard / R8 Rules =====

# --- Kotlin ---
-keepattributes *Annotation*, InnerClasses, EnclosingMethod, Signature, Exceptions
-keep class kotlin.Metadata { *; }
-dontwarn kotlin.**

# --- Kotlin Coroutines ---
-keepnames class kotlinx.coroutines.internal.MainDispatcherFactory {}
-keepnames class kotlinx.coroutines.CoroutineExceptionHandler {}
-keepclassmembers class kotlinx.coroutines.** { volatile <fields>; }

# --- Kotlinx Serialization ---
-keepattributes *Annotation*, InnerClasses
-dontnote kotlinx.serialization.AnnotationsKt
-keepclassmembers class kotlinx.serialization.json.** {
    *** Companion;
}
-keepclasseswithmembers class kotlinx.serialization.json.** {
    kotlinx.serialization.KSerializer serializer(...);
}
-keep,includedescriptorclasses class com.merilive.app.**$$serializer { *; }
-keepclassmembers class com.merilive.app.** {
    *** Companion;
}
-keepclasseswithmembers class com.merilive.app.** {
    kotlinx.serialization.KSerializer serializer(...);
}

# --- Hilt / Dagger ---
-keep class dagger.hilt.** { *; }
-keep class * extends dagger.hilt.android.internal.lifecycle.HiltViewModelFactory
-keepclasseswithmembers class * {
    @dagger.* <methods>;
}

# --- Ktor ---
-dontwarn io.ktor.**
-keep class io.ktor.** { *; }

# --- Supabase ---
-keep class io.github.jan.supabase.** { *; }
-dontwarn io.github.jan.supabase.**

# --- LiveKit / WebRTC ---
-keep class io.livekit.** { *; }
-keep class livekit.** { *; }
-keep class org.webrtc.** { *; }
-dontwarn io.livekit.**
-dontwarn org.webrtc.**

# --- Firebase ---
-keep class com.google.firebase.** { *; }
-dontwarn com.google.firebase.**

# --- Play Billing ---
-keep class com.android.billingclient.** { *; }

# --- DeepAR ---
-keep class ai.deepar.** { *; }
-dontwarn ai.deepar.**

# --- Coil ---
-keep class coil.** { *; }
-dontwarn coil.**

# --- SVGA ---
-keep class com.opensource.svgaplayer.** { *; }
-dontwarn com.opensource.svgaplayer.**

# --- Lottie ---
-keep class com.airbnb.lottie.** { *; }

# --- Models (data classes serialized by Supabase / kotlinx) ---
-keep class com.merilive.app.data.model.** { *; }

# --- View Binding generated classes ---
-keep class com.merilive.app.databinding.** { *; }
