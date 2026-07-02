package com.merilive.app

import android.graphics.Color
import android.os.Build
import android.os.Bundle
import android.view.WindowManager
import io.flutter.embedding.android.FlutterActivity
import io.flutter.embedding.engine.FlutterEngine
import com.merilive.app.flutter.IncomingCallBridgePlugin
import com.merilive.app.plugins.LiveKitFlutterPlugin
import com.merilive.app.plugins.NativeEntryAnimationPlugin
import com.merilive.app.plugins.NativeGiftAnimationPlugin

/**
 * H1 — Flutter host activity.
 *
 * Registers every native plugin authored under `com.merilive.app.plugins`
 * / `com.merilive.app.flutter` and pins the window background transparent
 * so the LiveKit `SurfaceViewRenderer` mounted BEHIND Flutter's surface
 * (see `LiveKitFlutterPlugin.attachLocal`) shows through — zero-gap
 * Chamet-style preview → publish handoff (see `LiveHostBridge`).
 */
class MainActivity : FlutterActivity() {

    override fun onCreate(savedInstanceState: Bundle?) {
        // Must run BEFORE super.onCreate so the FlutterView is created with
        // a translucent background.
        window.setBackgroundDrawableResource(android.R.color.transparent)
        window.setFormat(android.graphics.PixelFormat.TRANSLUCENT)
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
            window.statusBarColor = Color.TRANSPARENT
        }
        window.addFlags(WindowManager.LayoutParams.FLAG_LAYOUT_NO_LIMITS)
        super.onCreate(savedInstanceState)
    }

    override fun configureFlutterEngine(flutterEngine: FlutterEngine) {
        super.configureFlutterEngine(flutterEngine)
        // Live streaming / camera / beauty / sticker bridge.
        LiveKitFlutterPlugin.register(flutterEngine, this)
        // Gift + entry animation native renderers (Pkg438).
        NativeGiftAnimationPlugin().register(flutterEngine, this)
        NativeEntryAnimationPlugin().register(flutterEngine, this)
        // Incoming private-call ringer bridge.
        flutterEngine.plugins.add(IncomingCallBridgePlugin())
    }
}
