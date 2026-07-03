-keep class com.merilive.app.plugin.** { *; }
-keep class com.getcapacitor.** { *; }
-keep class com.google.firebase.** { *; }
-keep class com.android.billingclient.** { *; }
-keep class io.livekit.** { *; }
-keep class com.tencent.qgame.vap.** { *; }
-keep class com.github.yyued.svga.** { *; }
# ─── OEM HARDENING (research-verified, prevents release-APK crash on ALL devices) ───
# WebRTC native + LiveKit's repackaged WebRTC fork. JNI bridges accessed by name from
# libjingle_peerconnection_so.so / libwebrtc.so — R8 rename = UnsatisfiedLinkError.
# Refs: LiveKit issues #735 (jni_zero), #808 (Kotlin serialization R8 strip)
-keep class org.webrtc.** { *; }
-keep class livekit.org.webrtc.** { *; }
-keep class livekit.org.jni_zero.** { *; }
-keepclassmembers class org.webrtc.** { native <methods>; }
-keepclassmembers class livekit.org.webrtc.** { native <methods>; }
-keepclassmembers class * {
    @org.webrtc.CalledByNative *;
    @org.webrtc.CalledByNativeUnchecked *;
}

# CameraX (used by LiveKit's CameraCapturerUtils + our NativeCameraPlugin face verify).
# Reflectively loaded by SDK; R8 rename = silent NPE in registerCameraProvider().
-keep class androidx.camera.** { *; }
-keep class io.livekit.android.room.track.video.CameraCapturerUtils { *; }
-keep class io.livekit.android.room.track.video.CameraCapturerUtils$* { *; }

# Kotlin serialization (LiveKit signal/data packets) — LiveKit #808 release crash.
-keepattributes RuntimeVisibleAnnotations,AnnotationDefault
-keepclassmembers class **$$serializer { *; }
-keepclassmembers class * { @kotlinx.serialization.Serializable <fields>; }
-keep,includedescriptorclasses class **$$serializer { *; }
-keepclasseswithmembers class * {
    kotlinx.serialization.KSerializer serializer(...);
}

# OEM Vendor SDKs / reflection (Huawei HMS, Honor, Samsung Knox stubs).
-keep class com.huawei.hms.** { *; }
-dontwarn com.huawei.**
-keep class com.hihonor.** { *; }
-dontwarn com.hihonor.**
-keep class com.samsung.android.** { *; }
-dontwarn com.samsung.**
-dontwarn com.mediatek.**
-dontwarn com.spreadtrum.**
-dontwarn com.unisoc.**

# Optimization for size
-repackageclasses ''
-allowaccessmodification
-optimizations !code/simplification/arithmetic,!field/*,!class/merging/*
-keepattributes *Annotation*,Signature,InnerClasses,SourceFile,LineNumberTable
