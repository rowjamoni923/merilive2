-keep class com.merilive.app.plugin.** { *; }
-keep class com.getcapacitor.** { *; }
-keep class com.google.firebase.** { *; }
-keep class com.android.billingclient.** { *; }
-keep class io.livekit.** { *; }
-keep class com.tencent.qgame.vap.** { *; }
-keep class com.github.yyued.svga.** { *; }
-keep class com.pixpark.gpupixel.** { *; }
-keepclasseswithmembernames class com.pixpark.gpupixel.** { native <methods>; }

# Optimization for size
-repackageclasses ''
-allowaccessmodification
-optimizations !code/simplification/arithmetic,!field/*,!class/merging/*
-keepattributes *Annotation*,Signature,InnerClasses,SourceFile,LineNumberTable
