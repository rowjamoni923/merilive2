# 🔧 CRITICAL FIX: Resolve ALL "error.NonExistentClass" Build Errors

## Problem Summary
The build fails at `:app:kspDebugKotlin` with `error.NonExistentClass` for ALL repositories that inject `SupabaseClient`. KSP/Hilt cannot resolve the `SupabaseClient` type because either:
1. The Ktor HTTP engine dependency is missing (causes Supabase SDK to fail silently)
2. The `SupabaseModule` Hilt module is not correctly providing `io.github.jan.supabase.SupabaseClient`
3. Repositories are importing the wrong class

## Affected Files (ALL of these need fixing)
```
com.merilive.app.data.manager.AdminSyncManager
com.merilive.app.data.repository.AdminFinancialRepository
com.merilive.app.data.repository.AdminGameRepository
com.merilive.app.data.repository.AdminLeaderboardRepository
com.merilive.app.data.repository.AdminModerationRepository
com.merilive.app.data.repository.AdminNotificationRepository
com.merilive.app.data.repository.AdminRepository
com.merilive.app.data.repository.AdminRewardRepository
com.merilive.app.data.repository.AdminShopRepository
com.merilive.app.data.repository.AdminStaffRepository
com.merilive.app.data.repository.AdminSupportRepository
com.merilive.app.data.repository.AdminUserManagementRepository
com.merilive.app.data.repository.AdminVipRepository
com.merilive.app.data.repository.AdminVisualRepository
com.merilive.app.data.repository.ChatRepository
com.merilive.app.data.repository.ConfigRepository
com.merilive.app.data.repository.FollowRepository
com.merilive.app.data.repository.GameRepository
com.merilive.app.data.repository.GoLiveRepository
com.merilive.app.data.repository.HostRepository
com.merilive.app.data.repository.LeaderboardRepository
```

---

## STEP 1: Fix `build.gradle.kts` (app-level) Dependencies

Open `android/app/build.gradle.kts` and ensure these EXACT dependencies exist:

```kotlin
// At the top of dependencies block
val supabaseVersion = "3.1.4"
val ktorVersion = "2.3.12"

dependencies {
    // ══════════════════════════════════════════════
    // SUPABASE KOTLIN SDK — Use HYPHEN in group ID
    // ══════════════════════════════════════════════
    implementation(platform("io.github.jan-tennert.supabase:bom:$supabaseVersion"))
    implementation("io.github.jan-tennert.supabase:postgrest-kt")
    implementation("io.github.jan-tennert.supabase:auth-kt")
    implementation("io.github.jan-tennert.supabase:storage-kt")
    implementation("io.github.jan-tennert.supabase:realtime-kt")
    implementation("io.github.jan-tennert.supabase:functions-kt")

    // ══════════════════════════════════════════════
    // KTOR ENGINE — THIS IS MANDATORY FOR SUPABASE
    // Without this, SupabaseClient class won't resolve!
    // ══════════════════════════════════════════════
    implementation("io.ktor:ktor-client-android:$ktorVersion")
    implementation("io.ktor:ktor-client-okhttp:$ktorVersion")
    implementation("io.ktor:ktor-client-content-negotiation:$ktorVersion")
    implementation("io.ktor:ktor-serialization-kotlinx-json:$ktorVersion")

    // Kotlinx Serialization
    implementation("org.jetbrains.kotlinx:kotlinx-serialization-json:1.6.3")

    // ... other dependencies ...
}
```

### ⚠️ CRITICAL RULE:
- **Gradle dependency group ID** uses HYPHEN: `io.github.jan-tennert.supabase`
- **Kotlin import statements** use DOTS (no hyphen): `io.github.jan.supabase`
- These are DIFFERENT! Don't confuse them!

---

## STEP 2: Fix `SupabaseModule.kt` (Hilt DI Provider)

File: `app/src/main/java/com/merilive/app/di/SupabaseModule.kt`

This file MUST provide `io.github.jan.supabase.SupabaseClient` to Hilt:

```kotlin
package com.merilive.app.di

import dagger.Module
import dagger.Provides
import dagger.hilt.InstallIn
import dagger.hilt.components.SingletonComponent
import io.github.jan.supabase.SupabaseClient
import io.github.jan.supabase.createSupabaseClient
import io.github.jan.supabase.auth.Auth
import io.github.jan.supabase.auth.FlowType
import io.github.jan.supabase.postgrest.Postgrest
import io.github.jan.supabase.storage.Storage
import io.github.jan.supabase.realtime.Realtime
import io.github.jan.supabase.functions.Functions
import javax.inject.Singleton

@Module
@InstallIn(SingletonComponent::class)
object SupabaseModule {

    private const val SUPABASE_URL = "https://pppcwawjjpwwrmvezcdy.supabase.co"
    private const val SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBwcGN3YXdqanB3d3JtdmV6Y2R5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjgzMzQ4OTYsImV4cCI6MjA4MzkxMDg5Nn0.VUy58uiU63Kb3i4qj2ALK2s3arjBJ25CbnwCcvblpQw"

    @Provides
    @Singleton
    fun provideSupabaseClient(): SupabaseClient {
        return createSupabaseClient(
            supabaseUrl = SUPABASE_URL,
            supabaseKey = SUPABASE_ANON_KEY
        ) {
            install(Auth) {
                flowType = FlowType.PKCE
                scheme = "merilive"
                host = "auth-callback"
            }
            install(Postgrest)
            install(Storage)
            install(Realtime)
            install(Functions)
        }
    }
}
```

---

## STEP 3: Fix ALL Repository Files

Every single repository that was listed above MUST follow this exact pattern.

### Pattern for repositories with only SupabaseClient:

```kotlin
package com.merilive.app.data.repository

// ⚠️ CRITICAL: Use DOTS, no hyphen! 
import io.github.jan.supabase.SupabaseClient
import io.github.jan.supabase.postgrest.postgrest
import io.github.jan.supabase.functions.functions
import javax.inject.Inject
import javax.inject.Singleton

@Singleton
class ExampleRepository @Inject constructor(
    private val supabaseClient: SupabaseClient  // ← This type MUST be io.github.jan.supabase.SupabaseClient
) {
    // Use supabaseClient.postgrest, supabaseClient.functions, etc.
}
```

### Pattern for AdminSyncManager (has additional dependency):

```kotlin
package com.merilive.app.data.manager

import io.github.jan.supabase.SupabaseClient
import io.github.jan.supabase.postgrest.postgrest
import com.merilive.app.data.session.SettingsCache
import javax.inject.Inject
import javax.inject.Singleton

@Singleton
class AdminSyncManager @Inject constructor(
    private val supabaseClient: SupabaseClient,
    private val settingsCache: SettingsCache
) {
    // ...
}
```

### Pattern for ConfigRepository (has additional dependency):

```kotlin
package com.merilive.app.data.repository

import io.github.jan.supabase.SupabaseClient
import io.github.jan.supabase.postgrest.postgrest
import com.merilive.app.utils.SecurityManager
import javax.inject.Inject
import javax.inject.Singleton

@Singleton
class ConfigRepository @Inject constructor(
    private val supabaseClient: SupabaseClient,
    private val securityManager: SecurityManager
) {
    // ...
}
```

---

## STEP 4: Delete old SupabaseClient singleton (if exists)

If file `app/src/main/java/com/merilive/app/data/SupabaseClient.kt` exists with `object SupabaseClient { ... }`, **DELETE IT**. We use Hilt DI module instead.

---

## STEP 5: Verify Application class has @HiltAndroidApp

File: `app/src/main/java/com/merilive/app/MeriLiveApplication.kt`

```kotlin
package com.merilive.app

import android.app.Application
import dagger.hilt.android.HiltAndroidApp

@HiltAndroidApp
class MeriLiveApplication : Application() {
    override fun onCreate() {
        super.onCreate()
    }
}
```

---

## STEP 6: Verify KSP + Hilt plugins in build.gradle.kts

```kotlin
// build.gradle.kts (app-level) — at the top
plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
    id("com.google.devtools.ksp")           // KSP for Hilt
    id("dagger.hilt.android.plugin")        // Hilt plugin
    id("org.jetbrains.kotlin.plugin.serialization")  // For Supabase JSON
    id("com.google.gms.google-services")    // Firebase
}

dependencies {
    // Hilt
    implementation("com.google.dagger:hilt-android:2.51.1")
    ksp("com.google.dagger:hilt-compiler:2.51.1")
    
    // ... all other deps from Step 1 ...
}
```

```kotlin
// build.gradle.kts (project-level)
plugins {
    id("com.android.application") version "8.7.0" apply false
    id("org.jetbrains.kotlin.android") version "1.9.22" apply false
    id("com.google.devtools.ksp") version "1.9.22-1.0.18" apply false
    id("com.google.dagger.hilt.android") version "2.51.1" apply false
    id("org.jetbrains.kotlin.plugin.serialization") version "1.9.22" apply false
    id("com.google.gms.google-services") version "4.4.0" apply false
}
```

---

## STEP 7: Clean and Rebuild

After making ALL changes above, run:

```bash
cd android
./gradlew clean
./gradlew :app:kspDebugKotlin
```

If `kspDebugKotlin` passes, then run full build:

```bash
./gradlew :app:assembleDebug
```

---

## Quick Checklist

- [ ] `build.gradle.kts` has `io.ktor:ktor-client-android:2.3.12` dependency
- [ ] `build.gradle.kts` has all `io.github.jan-tennert.supabase:*` dependencies with BOM
- [ ] `SupabaseModule.kt` exists in `com.merilive.app.di` package
- [ ] `SupabaseModule.kt` imports `io.github.jan.supabase.SupabaseClient` (DOTS, no hyphen)
- [ ] `SupabaseModule.kt` has `@Provides @Singleton` and returns `SupabaseClient`
- [ ] ALL 21 repository/manager files import `io.github.jan.supabase.SupabaseClient`
- [ ] NO file imports `com.merilive.app.data.SupabaseClient` (old singleton)
- [ ] Old `data/SupabaseClient.kt` object file is DELETED
- [ ] `MeriLiveApplication.kt` has `@HiltAndroidApp`
- [ ] KSP plugin version matches Kotlin version (1.9.22 → ksp 1.9.22-1.0.18)
- [ ] `./gradlew clean` done before rebuild
