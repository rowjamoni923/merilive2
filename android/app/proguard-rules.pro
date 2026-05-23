# Capacitor
-keep class com.getcapacitor.** { *; }
-keep @com.getcapacitor.annotation.CapacitorPlugin class * { *; }

# Firebase
-keep class com.google.firebase.** { *; }
-keep class com.google.android.gms.** { *; }

# MeriLive
-keep class com.merilive.app.** { *; }

# Glide
-keep public class * implements com.bumptech.glide.module.GlideModule
-keep class * extends com.bumptech.glide.module.AppGlideModule { <init>(...); }

# Google Billing
-keep class com.android.vending.billing.** { *; }

# LiveKit Android SDK + WebRTC native (Step 1 — never strip in release)
-keep class io.livekit.android.** { *; }
-keep class livekit.** { *; }
-keep class org.webrtc.** { *; }
-keepclassmembers class org.webrtc.** { *; }
-dontwarn org.webrtc.**
-dontwarn io.livekit.android.**

# Kotlin coroutines (LiveKit interop)
-keepnames class kotlinx.coroutines.internal.MainDispatcherFactory {}
-keepnames class kotlinx.coroutines.CoroutineExceptionHandler {}
-keepclassmembers class kotlinx.coroutines.** { volatile <fields>; }

# OkHttp / Okio (LiveKit signaling transport)
-dontwarn okhttp3.**
-dontwarn okio.**
-dontwarn org.conscrypt.**

# MediaPipe (virtual background)
-keep class com.google.mediapipe.** { *; }
-dontwarn com.google.mediapipe.**

# GPUPixel professional beauty engine + MarsFace detector
-keep class com.pixpark.gpupixel.** { *; }
-dontwarn com.pixpark.gpupixel.**

# CameraX
-keep class androidx.camera.** { *; }
-dontwarn androidx.camera.**

# Play Integrity / Play Core (Pkg236)
-keep class com.google.android.play.core.** { *; }
-keep class com.google.android.play.integrity.** { *; }
-dontwarn com.google.android.play.**

# Firebase Messaging service + AnalyticsConnector reflection
-keep class com.merilive.app.service.** { *; }
-keep class * extends com.google.firebase.messaging.FirebaseMessagingService { *; }
-keepclassmembers class * extends com.google.firebase.messaging.FirebaseMessagingService { <init>(...); }

# Kotlinx serialization (LiveKit data channel payloads)
-keepattributes RuntimeVisibleAnnotations,AnnotationDefault
-keepclasseswithmembers class **$$serializer { *; }
-keepclassmembers class * { @kotlinx.serialization.Serializable *; }

# WorkManager workers (Pkg221 background sync)
-keep class * extends androidx.work.Worker { <init>(...); }
-keep class * extends androidx.work.ListenableWorker { <init>(...); }

# AndroidX Startup initializers (future Pkg)
-keep class * implements androidx.startup.Initializer { <init>(); }

# General
-keepattributes *Annotation*
-keepattributes Signature
-keepattributes SourceFile,LineNumberTable
-keepattributes InnerClasses,EnclosingMethod
# Crashlytics deobfuscation
-keepattributes LineNumberTable,SourceFile
-renamesourcefileattribute SourceFile
