package com.merilive.app.ui.party

import android.os.Bundle
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import com.google.android.material.bottomsheet.BottomSheetDialogFragment
import com.merilive.app.databinding.BottomSheetPartySettingsBinding
import dagger.hilt.android.AndroidEntryPoint

@AndroidEntryPoint
class PartySettingsBottomSheet : BottomSheetDialogFragment() {

    private var _binding: BottomSheetPartySettingsBinding? = null
    private val binding get() = _binding!!

    companion object {
        fun newInstance(roomId: String) = PartySettingsBottomSheet().apply {
            arguments = Bundle().apply { putString("roomId", roomId) }
        }
    }

    override fun onCreateView(inflater: LayoutInflater, container: ViewGroup?, savedInstanceState: Bundle?): View {
        _binding = BottomSheetPartySettingsBinding.inflate(inflater, container, false)
        return binding.root
    }

    override fun onViewCreated(view: View, savedInstanceState: Bundle?) {
        super.onViewCreated(view, savedInstanceState)

        binding.switchFreeSeats.setOnCheckedChangeListener { _, checked ->
            // Toggle free/request seat mode
        }
        binding.switchLockAll.setOnCheckedChangeListener { _, checked ->
            // Lock/unlock all seats
        }
        binding.btnClearAllSeats.setOnClickListener {
            // Kick everyone from seats
            dismiss()
        }
        binding.btnEndParty.setOnClickListener {
            dismiss()
            activity?.onBackPressedDispatcher?.onBackPressed()
        }
    }

    override fun onDestroyView() { super.onDestroyView(); _binding = null }
}
