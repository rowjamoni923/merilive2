#include <jni.h>
#include <string>
#include <android/log.h>
#include <android/bitmap.h>

#define LOG_TAG "NativeVideoEngine"
#define LOGI(...) __android_log_print(ANDROID_LOG_INFO, LOG_TAG, __VA_ARGS__)
#define LOGE(...) __android_log_print(ANDROID_LOG_ERROR, LOG_TAG, __VA_ARGS__)

extern "C" JNIEXPORT jstring JNICALL
Java_com_merilive_app_plugin_video_NativeVideoEnginePlugin_getEngineVersion(JNIEnv* env, jobject /* this */) {
    return env->NewStringUTF("1.0.0-native-gpu");
}

extern "C" JNIEXPORT void JNICALL
Java_com_merilive_app_plugin_video_NativeVideoEnginePlugin_processFrameNative(JNIEnv* env, jobject /* this */, jobject bitmap) {
    AndroidBitmapInfo info;
    void* pixels;

    if (AndroidBitmap_getInfo(env, bitmap, &info) < 0) return;
    if (info.format != ANDROID_BITMAP_FORMAT_RGBA_8888) return;
    if (AndroidBitmap_lockPixels(env, bitmap, &pixels) < 0) return;

    // TODO: Implement GPU/CPU accelerated filters here
    // This is where low-level pixel manipulation happens for professional effects
    
    AndroidBitmap_unlockPixels(env, bitmap);
}