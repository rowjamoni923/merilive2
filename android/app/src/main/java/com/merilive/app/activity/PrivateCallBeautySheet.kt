package com.merilive.app.activity

import android.content.Context
import android.os.Bundle
import android.view.LayoutInflater
import android.view.View
import android.widget.SeekBar
import android.widget.TextView
import androidx.appcompat.widget.SwitchCompat
import com.google.android.material.bottomsheet.BottomSheetDialog
import com.merilive.app.R
import com.merilive.app.plugin.BeautyPipelineBridge
import com.merilive.app.plugin.GPUPixelBeautyPlugin
import com.merilive.app.plugin.LiveKitPlugin

/**
 * Pkg500 Phase C — Native in-call beauty sheet.
 *
 * Surfaces four GPUPixel filter sliders (smooth / white / thin face /
 * big eye) plus a master enable switch. Sliders write through to the
 * GPUPixel filter graph in real time via [GPUPixelBeautyPlugin] static
 * helpers; the master switch drives the camera handoff via
 * [LiveKitPlugin.setBeautyPipelineEnabledFromNative].
 *
 * Persistence: last levels and enabled flag are saved to
 * [PREFS] so they survive the call ending. When the sheet first opens
 * after app launch, levels are restored from prefs and pushed into the
 * filter graph (if [GPUPixelBeautyPlugin.isReady]).
 *
 * Design rationale: matches Chamet/Bigo in-call beauty surface — modal
 * bottom sheet, no destructive prompts, switch + sliders, immediate
 * visual feedback because filters apply per-frame in GPUPixel.
 */
class PrivateCallBeautySheet private constructor(
    private val host: Context,
) {

    companion object {
        const val PREFS = "private_call_beauty_prefs"
        private const val KEY_ENABLED = "enabled"
        private const val KEY_SMOOTH = "smooth"
        private const val KEY_WHITE = "white"
        private const val KEY_THIN = "thin_face"
        private const val KEY_EYE = "big_eye"

        // Sensible defaults — "natural" preset, mild smoothing only.
        private const val DEFAULT_SMOOTH = 5
        private const val DEFAULT_WHITE = 2
        private const val DEFAULT_THIN = 0
        private const val DEFAULT_EYE = 0

        fun show(ctx: Context) {
            PrivateCallBeautySheet(ctx).build().show()
        }

        /**
         * Restore last beauty levels into the GPUPixel filter graph. Called
         * by PrivateCallActivity on attach so opening a call resumes the
         * user's saved look without forcing them to open the sheet.
         */
        fun restoreLevelsIfReady(ctx: Context) {
            if (!GPUPixelBeautyPlugin.isReady()) return
            val sp = ctx.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
            GPUPixelBeautyPlugin.setSmoothLevel(sp.getInt(KEY_SMOOTH, DEFAULT_SMOOTH).toFloat())
            GPUPixelBeautyPlugin.setWhiteLevel(sp.getInt(KEY_WHITE, DEFAULT_WHITE).toFloat())
            GPUPixelBeautyPlugin.setThinFaceLevel(sp.getInt(KEY_THIN, DEFAULT_THIN).toFloat())
            GPUPixelBeautyPlugin.setBigEyeLevel(sp.getInt(KEY_EYE, DEFAULT_EYE).toFloat())
        }
    }

    private val prefs = host.getSharedPreferences(PREFS, Context.MODE_PRIVATE)

    private fun build(): BottomSheetDialog {
        val dialog = BottomSheetDialog(host)
        val view = LayoutInflater.from(host).inflate(R.layout.dialog_private_call_beauty, null, false)
        dialog.setContentView(view)

        val ready = GPUPixelBeautyPlugin.isReady()
        val pipelineOn = BeautyPipelineBridge.isEnabled()
        val savedEnabled = prefs.getBoolean(KEY_ENABLED, false) || pipelineOn

        val statusText = view.findViewById<TextView>(R.id.beautyStatusText)
        val enableSwitch = view.findViewById<SwitchCompat>(R.id.beautyEnableSwitch)

        enableSwitch.isChecked = pipelineOn && ready
        enableSwitch.isEnabled = ready
        statusText.text = when {
            !ready -> "Beauty filter is not ready yet. Open the lobby beauty panel once to initialise it."
            enableSwitch.isChecked -> "Beauty is on. Slide to fine-tune."
            else -> "Tap to enable. Camera will briefly reload."
        }

        enableSwitch.setOnCheckedChangeListener { _, isChecked ->
            prefs.edit().putBoolean(KEY_ENABLED, isChecked).apply()
            statusText.text =
                if (isChecked) "Switching… your video will reload in ~1s."
                else "Beauty off. Switching to raw camera…"
            LiveKitPlugin.setBeautyPipelineEnabledFromNative(isChecked)
        }

        bindRow(
            view.findViewById(R.id.rowSmooth),
            label = "Smooth",
            initial = prefs.getInt(KEY_SMOOTH, DEFAULT_SMOOTH),
            onChange = { v ->
                prefs.edit().putInt(KEY_SMOOTH, v).apply()
                if (ready) GPUPixelBeautyPlugin.setSmoothLevel(v.toFloat())
            },
        )
        bindRow(
            view.findViewById(R.id.rowWhite),
            label = "White",
            initial = prefs.getInt(KEY_WHITE, DEFAULT_WHITE),
            onChange = { v ->
                prefs.edit().putInt(KEY_WHITE, v).apply()
                if (ready) GPUPixelBeautyPlugin.setWhiteLevel(v.toFloat())
            },
        )
        bindRow(
            view.findViewById(R.id.rowThinFace),
            label = "Slim face",
            initial = prefs.getInt(KEY_THIN, DEFAULT_THIN),
            onChange = { v ->
                prefs.edit().putInt(KEY_THIN, v).apply()
                if (ready) GPUPixelBeautyPlugin.setThinFaceLevel(v.toFloat())
            },
        )
        bindRow(
            view.findViewById(R.id.rowBigEye),
            label = "Big eyes",
            initial = prefs.getInt(KEY_EYE, DEFAULT_EYE),
            onChange = { v ->
                prefs.edit().putInt(KEY_EYE, v).apply()
                if (ready) GPUPixelBeautyPlugin.setBigEyeLevel(v.toFloat())
            },
        )

        return dialog
    }

    private fun bindRow(
        row: View,
        label: String,
        initial: Int,
        onChange: (Int) -> Unit,
    ) {
        val labelTv = row.findViewById<TextView>(R.id.rowLabel)
        val valueTv = row.findViewById<TextView>(R.id.rowValue)
        val slider = row.findViewById<SeekBar>(R.id.rowSlider)
        labelTv.text = label
        slider.progress = initial.coerceIn(0, 10)
        valueTv.text = slider.progress.toString()

        slider.setOnSeekBarChangeListener(object : SeekBar.OnSeekBarChangeListener {
            override fun onProgressChanged(sb: SeekBar?, progress: Int, fromUser: Boolean) {
                valueTv.text = progress.toString()
                if (fromUser) onChange(progress)
            }
            override fun onStartTrackingTouch(sb: SeekBar?) = Unit
            override fun onStopTrackingTouch(sb: SeekBar?) = Unit
        })
    }
}

// Bundle import-keeper so AS doesn't complain in case of partial diff edits.
@Suppress("unused") private val _b: Bundle? = null
