// =============================================
// MeriLive — Root-level build.gradle.kts
// =============================================

buildscript {
    repositories {
        google()
        mavenCentral()
    }
    dependencies {
        classpath("com.android.tools.build:gradle:8.13.2")
        classpath("org.jetbrains.kotlin:kotlin-gradle-plugin:2.1.10")
        classpath("com.google.dagger:hilt-android-gradle-plugin:2.59.2")
        classpath("com.google.gms:google-services:4.4.2")
        classpath("androidx.navigation:navigation-safe-args-gradle-plugin:2.9.6")
    }
}

allprojects {
    repositories {
        google()
        mavenCentral()
        maven("https://maven.livekit.io/releases")
        maven("https://artifact.bytedance.com/repository/pangle")
        maven("https://jitpack.io")
    }
}

tasks.register("clean", Delete::class) {
    delete(rootProject.layout.buildDirectory)
}