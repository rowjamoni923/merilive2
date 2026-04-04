package com.merilive.app.ui.live

import android.os.Bundle
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import com.google.android.material.bottomsheet.BottomSheetDialogFragment
import com.merilive.app.databinding.BottomSheetLiveEndSummaryBinding
import kotlinx.serialization.json.Json

class LiveEndSummaryBottomSheet : BottomSheetDialogFragment() {

    private var _binding: BottomSheetLiveEndSummaryBinding? = null
    private val binding get() = _binding!!

    companion object {
        fun newInstance(summary: StreamEndSummary) = LiveEndSummaryBottomSheet().apply {
            arguments = Bundle().apply {
                putString("summary", Json.encodeToString(StreamEndSummary.serializer(), summary))
            }
        }
    }

    override fun onCreateView(inflater: LayoutInflater, container: ViewGroup?, savedInstanceState: Bundle?): View {
        _binding = BottomSheetLiveEndSummaryBinding.inflate(inflater, container, false)
        return binding.root
    }

    override fun onViewCreated(view: View, savedInstanceState: Bundle?) {
        super.onViewCreated(view, savedInstanceState)

        val summaryJson = arguments?.getString("summary") ?: return
        val summary = Json { ignoreUnknownKeys = true }.decodeFromString<StreamEndSummary>(summaryJson)

        val hours = summary.duration / 3600
        val minutes = (summary.duration % 3600) / 60
        binding.tvDuration.text = if (hours > 0) "${hours}h ${minutes}m" else "${minutes}m"
        binding.tvTotalViewers.text = String.format("%,d", summary.totalViewers)
        binding.tvTotalGifts.text = String.format("%,d", summary.totalGifts)
        binding.tvTotalBeans.text = String.format("%,d", summary.totalBeans)
        binding.tvNewFollowers.text = "+${summary.newFollowers}"

        binding.btnClose.setOnClickListener {
            dismiss()
            activity?.onBackPressedDispatcher?.onBackPressed()
        }
    }

    override fun onDestroyView() { super.onDestroyView(); _binding = null }
}
