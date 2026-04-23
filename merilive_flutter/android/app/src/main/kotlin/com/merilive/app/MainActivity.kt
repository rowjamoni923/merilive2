package com.merilive.app

import android.os.Bundle
import android.view.WindowManager
import io.flutter.embedding.android.FlutterActivity

class MainActivity : FlutterActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        // [SECURITY] Prevent screenshots and screen recording app-wide
        window.addFlags(WindowManager.LayoutParams.FLAG_SECURE)
    }
}
