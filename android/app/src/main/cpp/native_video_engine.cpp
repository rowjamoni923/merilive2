// Pkg435 — real per-pixel brightness/saturation pass.
// Used by NativeVideoEnginePlugin.processFrame for utility filters
// (LiveKit owns the live preview pipeline via GPUPixel — this is
// only for snapshot/thumbnail/reel post-processing).

#include <jni.h>
#include <string>
#include <android/log.h>
#include <android/bitmap.h>

#define LOG_TAG "NativeVideoEngine"
#define LOGI(...) __android_log_print(ANDROID_LOG_INFO, LOG_TAG, __VA_ARGS__)
#define LOGE(...) __android_log_print(ANDROID_LOG_ERROR, LOG_TAG, __VA_ARGS__)

static inline uint8_t clamp_u8(int v) {
    if (v < 0) return 0;
    if (v > 255) return 255;
    return (uint8_t) v;
}

extern "C" JNIEXPORT jstring JNICALL
Java_com_merilive_app_plugin_video_NativeVideoEnginePlugin_getEngineVersion(JNIEnv* env, jobject /* this */) {
    return env->NewStringUTF("1.1.0-pkg435");
}

/**
 * Apply brightness (offset) + saturation (scale around luma) to an RGBA bitmap in place.
 *
 *   brightness: -100..100  (mapped to -64..+64)
 *   saturation: 0..200     (100 = identity)
 */
extern "C" JNIEXPORT jint JNICALL
Java_com_merilive_app_plugin_video_NativeVideoEnginePlugin_processFrameNative(
        JNIEnv* env, jobject /* this */, jobject bitmap, jint brightness, jint saturation) {
    AndroidBitmapInfo info;
    void* pixels = nullptr;

    if (AndroidBitmap_getInfo(env, bitmap, &info) < 0) {
        LOGE("getInfo failed");
        return -1;
    }
    if (info.format != ANDROID_BITMAP_FORMAT_RGBA_8888) {
        LOGE("unsupported format %d", info.format);
        return -2;
    }
    if (AndroidBitmap_lockPixels(env, bitmap, &pixels) < 0) {
        LOGE("lockPixels failed");
        return -3;
    }

    const int bOffset = (brightness * 64) / 100; // -64..+64
    const float satScale = saturation <= 0 ? 0.f : (float) saturation / 100.f;
    const uint32_t pixelCount = info.width * info.height;
    uint8_t* p = (uint8_t*) pixels;

    for (uint32_t i = 0; i < pixelCount; i++) {
        int r = p[0];
        int g = p[1];
        int b = p[2];

        // luma (Rec. 601)
        float luma = 0.299f * r + 0.587f * g + 0.114f * b;

        // saturation around luma
        r = (int) (luma + (r - luma) * satScale);
        g = (int) (luma + (g - luma) * satScale);
        b = (int) (luma + (b - luma) * satScale);

        // brightness
        r += bOffset; g += bOffset; b += bOffset;

        p[0] = clamp_u8(r);
        p[1] = clamp_u8(g);
        p[2] = clamp_u8(b);
        // p[3] alpha unchanged
        p += 4;
    }

    AndroidBitmap_unlockPixels(env, bitmap);
    return 0;
}
