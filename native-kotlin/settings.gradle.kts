pluginManagement {
    repositories {
        google()
        mavenCentral()
        gradlePluginPortal()
    }
}

dependencyResolutionManagement {
    repositories {
        google()
        mavenCentral()
        maven("https://maven.livekit.io/releases")
        maven("https://jitpack.io")
    }
}

rootProject.name = "MeriLive"
include(":app")
