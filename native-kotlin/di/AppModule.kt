package com.merilive.app.di

import android.content.Context
import com.merilive.app.data.repository.*
import com.merilive.app.service.DeepARManager
import com.merilive.app.service.LiveKitManager
import dagger.Module
import dagger.Provides
import dagger.hilt.InstallIn
import dagger.hilt.android.qualifiers.ApplicationContext
import dagger.hilt.components.SingletonComponent
import io.github.jan.supabase.auth.Auth
import io.github.jan.supabase.functions.Functions
import io.github.jan.supabase.postgrest.Postgrest
import io.github.jan.supabase.realtime.Realtime
import io.github.jan.supabase.storage.Storage
import javax.inject.Singleton

@Module
@InstallIn(SingletonComponent::class)
object AppModule {

    @Provides @Singleton
    fun provideUserRepository(auth: Auth, postgrest: Postgrest, storage: Storage): UserRepository =
        UserRepositoryImpl(auth, postgrest, storage)

    @Provides @Singleton
    fun provideLiveRepository(postgrest: Postgrest, functions: Functions, realtime: Realtime): LiveRepository =
        LiveRepositoryImpl(postgrest, functions, realtime)

    @Provides @Singleton
    fun provideGiftRepository(postgrest: Postgrest, functions: Functions): GiftRepository =
        GiftRepositoryImpl(postgrest, functions)

    @Provides @Singleton
    fun provideCallRepository(auth: Auth, postgrest: Postgrest, functions: Functions): CallRepository =
        CallRepositoryImpl(auth, postgrest, functions)

    @Provides @Singleton
    fun provideTaskRepository(postgrest: Postgrest, functions: Functions): TaskRepository =
        TaskRepositoryImpl(postgrest, functions)

    @Provides @Singleton
    fun provideAgencyRepository(postgrest: Postgrest, functions: Functions, realtime: Realtime): AgencyRepository =
        AgencyRepositoryImpl(postgrest, functions, realtime)

    @Provides @Singleton
    fun provideHelperRepository(postgrest: Postgrest, functions: Functions): HelperRepository =
        HelperRepositoryImpl(postgrest, functions)

    @Provides @Singleton
    fun provideTraderRepository(postgrest: Postgrest, functions: Functions): TraderRepository =
        TraderRepositoryImpl(postgrest, functions)

    @Provides @Singleton
    fun provideDeepARManager(@ApplicationContext context: Context): DeepARManager =
        DeepARManager(context)

    @Provides @Singleton
    fun provideLiveKitManager(@ApplicationContext context: Context): LiveKitManager =
        LiveKitManager(context)
}
