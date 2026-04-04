import java.util.Properties

plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
    id("org.jetbrains.kotlin.plugin.serialization") version "2.1.10"
    id("com.google.dagger.hilt.android")
    id("com.google.devtools.ksp") version "2.1.10-1.0.31"
    id("androidx.navigation.safeargs.kotlin")
}

android {
    namespace = "com.merilive.app"
    compileSdk = 35

    sourceSets {
        getByName("main") {
            manifest.srcFile("AndroidManifest.xml")
            java.setSrcDirs(listOf("src/main/java", "../data", "../di", "../receiver", "../service", "../ui", "../util"))
            res.setSrcDirs(listOf("../res"))
            assets.setSrcDirs(listOf("../assets"))
        }
    }

    defaultConfig {
        applicationId = "com.merilive.app"
        minSdk = 24
        targetSdk = 35
        versionCode = 10
        versionName = "5.2.0"
        testInstrumentationRunner = "androidx.test.runner.AndroidJUnitRunner"

        buildConfigField("String", "SUPABASE_URL", "\"https://pppcwawjjpwwrmvezcdy.supabase.co\"")
        buildConfigField("String", "SUPABASE_ANON_KEY", "\"eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBwcGN3YXdqanB3d3JtdmV6Y2R5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDQ5NzI0NzksImV4cCI6MjA2MDU0ODQ3OX0.LMDKPRjASNbijCXqpFJBOIvJBkMnEClCFOKhsPfqYAU\"")
    }

    signingConfigs {
        create("release") {
            val keystoreFile = rootProject.file("keystore.properties")
            if (keystoreFile.exists()) {
                val props = java.util.Properties().apply { load(keystoreFile.inputStream()) }
                storeFile = file(props["storeFile"] as String)
                storePassword = props["storePassword"] as String
                keyAlias = props["keyAlias"] as String
                keyPassword = props["keyPassword"] as String
            }
        }
    }

    buildTypes {
        release {
            isMinifyEnabled = true
            isShrinkResources = true
            signingConfig = signingConfigs.getByName("release")
            proguardFiles(getDefaultProguardFile("proguard-android-optimize.txt"), "proguard-rules.pro")
        }
        debug {
            isDebuggable = true
        }
    }

    buildFeatures {
        viewBinding = true
        buildConfig = true
    }

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
    kotlinOptions {
        jvmTarget = "17"
    }
}

dependencies {
    // ===== AndroidX Core =====
    implementation("androidx.core:core-ktx:1.18.0")
    implementation("androidx.appcompat:appcompat:1.7.1")
    implementation("com.google.android.material:material:1.12.0")
    implementation("androidx.constraintlayout:constraintlayout:2.2.1")
    implementation("androidx.core:core-splashscreen:1.2.0")
    implementation("androidx.swiperefreshlayout:swiperefreshlayout:1.2.0")
    implementation("androidx.viewpager2:viewpager2:1.1.0")

    // ===== Navigation =====
    implementation("androidx.navigation:navigation-fragment-ktx:2.9.6")
    implementation("androidx.navigation:navigation-ui-ktx:2.9.6")

    // ===== Lifecycle =====
    implementation("androidx.lifecycle:lifecycle-viewmodel-ktx:2.9.0")
    implementation("androidx.lifecycle:lifecycle-livedata-ktx:2.9.0")
    implementation("androidx.lifecycle:lifecycle-runtime-ktx:2.9.0")
    implementation("androidx.lifecycle:lifecycle-process:2.9.0")

    // ===== Hilt DI =====
    implementation("com.google.dagger:hilt-android:2.59.2")
    ksp("com.google.dagger:hilt-compiler:2.59.2")

    // ===== Supabase Kotlin SDK v3 =====
    implementation(platform("io.github.jan-tennert.supabase:bom:3.4.1"))
    implementation("io.github.jan-tennert.supabase:postgrest-kt")
    implementation("io.github.jan-tennert.supabase:auth-kt")
    implementation("io.github.jan-tennert.supabase:realtime-kt")
    implementation("io.github.jan-tennert.supabase:storage-kt")
    implementation("io.github.jan-tennert.supabase:functions-kt")

    // ===== Ktor 3.x (for Supabase v3) =====
    implementation("io.ktor:ktor-client-android:3.4.1")
    implementation("io.ktor:ktor-client-core:3.4.1")
    implementation("io.ktor:ktor-client-content-negotiation:3.4.1")
    implementation("io.ktor:ktor-serialization-kotlinx-json:3.4.1")
    implementation("io.ktor:ktor-client-logging:3.4.1")

    // ===== Kotlin Serialization =====
    implementation("org.jetbrains.kotlinx:kotlinx-serialization-json:1.8.1")
    implementation("org.jetbrains.kotlinx:kotlinx-coroutines-android:1.10.2")
    implementation("org.jetbrains.kotlinx:kotlinx-coroutines-core:1.10.2")

    // ===== Firebase =====
    implementation(platform("com.google.firebase:firebase-bom:34.11.0"))
    implementation("com.google.firebase:firebase-messaging")

    // ===== Google Play Billing =====
    implementation("com.android.billingclient:billing-ktx:7.1.1")

    // ===== Google Play In-App Update =====
    implementation("com.google.android.play:app-update-ktx:2.1.0")

    // ===== LiveKit (WebRTC) =====
    implementation("io.livekit:livekit-android:2.23.4")

    // ===== DeepAR (Beauty Filters) =====
    implementation(files("libs/deepar.aar"))

    // ===== Image Loading (Coil) =====
    implementation("io.coil-kt:coil:2.7.0")
    implementation("io.coil-kt:coil-svg:2.7.0")

    // ===== SVGA Animation =====
    implementation("com.github.nickyc975:SVGAPlayer-Android-2:2.7.0")

    // ===== Lottie Animation =====
    implementation("com.airbnb.android:lottie:6.6.7")

    // ===== Security (Encrypted SharedPrefs) =====
    implementation("androidx.security:security-crypto:1.1.0-alpha06")

    // ===== Biometric =====
    implementation("androidx.biometric:biometric:1.2.0-alpha05")

    // ===== CameraX (for DeepAR) =====
    val cameraxVersion = "1.5.3"
    implementation("androidx.camera:camera-core:$cameraxVersion")
    implementation("androidx.camera:camera-camera2:$cameraxVersion")
    implementation("androidx.camera:camera-lifecycle:$cameraxVersion")
    implementation("androidx.camera:camera-view:$cameraxVersion")

    // ===== Media3 ExoPlayer (Party/Live audio) =====
    implementation("androidx.media3:media3-exoplayer:1.9.2")
    implementation("androidx.media3:media3-ui:1.9.2")

    // ===== Image Cropper =====
    implementation("com.vanniktech:android-image-cropper:4.6.0")

    // ===== Testing =====
    testImplementation("junit:junit:4.13.2")
    androidTestImplementation("androidx.test.ext:junit:1.2.1")
    androidTestImplementation("androidx.test.espresso:espresso-core:3.6.1")
}


if (file("google-services.json").exists()) {
    apply(plugin = "com.google.gms.google-services")
}