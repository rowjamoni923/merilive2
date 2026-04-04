package com.merilive.app.ui.live

import android.os.Bundle
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import android.widget.SeekBar
import androidx.fragment.app.viewModels
import androidx.lifecycle.lifecycleScope
import com.google.android.material.bottomsheet.BottomSheetDialogFragment
import com.merilive.app.databinding.BottomSheetBeautyBinding
import com.merilive.app.service.DeepARManager
import dagger.hilt.android.AndroidEntryPoint
import kotlinx.coroutines.launch
import javax.inject.Inject

@AndroidEntryPoint
class BeautyBottomSheet : BottomSheetDialogFragment() {

    private var _binding: BottomSheetBeautyBinding? = null
    private val binding get() = _binding!!

    @Inject lateinit var deepARManager: DeepARManager

    override fun onCreateView(inflater: LayoutInflater, container: ViewGroup?, savedInstanceState: Bundle?): View {
        _binding = BottomSheetBeautyBinding.inflate(inflater, container, false)
        return binding.root
    }

    override fun onViewCreated(view: View, savedInstanceState: Bundle?) {
        super.onViewCreated(view, savedInstanceState)

        // Smoothing slider
        binding.seekSmoothing.setOnSeekBarChangeListener(object : SeekBar.OnSeekBarChangeListener {
            override fun onProgressChanged(sb: SeekBar?, progress: Int, user: Boolean) {
                updateBeauty()
            }
            override fun onStartTrackingTouch(sb: SeekBar?) {}
            override fun onStopTrackingTouch(sb: SeekBar?) {}
        })

        // Whitening slider
        binding.seekWhitening.setOnSeekBarChangeListener(object : SeekBar.OnSeekBarChangeListener {
            override fun onProgressChanged(sb: SeekBar?, progress: Int, user: Boolean) {
                updateBeauty()
            }
            override fun onStartTrackingTouch(sb: SeekBar?) {}
            override fun onStopTrackingTouch(sb: SeekBar?) {}
        })

        // Thin Face slider
        binding.seekThinFace.setOnSeekBarChangeListener(object : SeekBar.OnSeekBarChangeListener {
            override fun onProgressChanged(sb: SeekBar?, progress: Int, user: Boolean) {
                updateBeauty()
            }
            override fun onStartTrackingTouch(sb: SeekBar?) {}
            override fun onStopTrackingTouch(sb: SeekBar?) {}
        })

        // Big Eyes slider
        binding.seekBigEyes.setOnSeekBarChangeListener(object : SeekBar.OnSeekBarChangeListener {
            override fun onProgressChanged(sb: SeekBar?, progress: Int, user: Boolean) {
                updateBeauty()
            }
            override fun onStartTrackingTouch(sb: SeekBar?) {}
            override fun onStopTrackingTouch(sb: SeekBar?) {}
        })

        binding.btnReset.setOnClickListener {
            binding.seekSmoothing.progress = 50
            binding.seekWhitening.progress = 30
            binding.seekThinFace.progress = 20
            binding.seekBigEyes.progress = 20
            updateBeauty()
        }
    }

    private fun updateBeauty() {
        deepARManager.setBeautyParams(
            smooth = binding.seekSmoothing.progress / 100f,
            white = binding.seekWhitening.progress / 100f,
            thin = binding.seekThinFace.progress / 100f,
            eyes = binding.seekBigEyes.progress / 100f,
        )
    }

    override fun onDestroyView() { super.onDestroyView(); _binding = null }
}
