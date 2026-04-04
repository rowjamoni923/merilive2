package com.merilive.app.ui.live

import android.os.Bundle
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import androidx.fragment.app.viewModels
import androidx.lifecycle.ViewModel
import androidx.lifecycle.lifecycleScope
import androidx.lifecycle.viewModelScope
import androidx.recyclerview.widget.GridLayoutManager
import coil.load
import com.google.android.material.bottomsheet.BottomSheetDialogFragment
import com.merilive.app.databinding.BottomSheetGiftsBinding
import com.merilive.app.databinding.ItemGiftBinding
import com.merilive.app.data.repository.*
import dagger.hilt.android.AndroidEntryPoint
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import javax.inject.Inject

@AndroidEntryPoint
open class GiftBottomSheet : BottomSheetDialogFragment() {

    private var _binding: BottomSheetGiftsBinding? = null
    private val binding get() = _binding!!
    private val viewModel: GiftViewModel by viewModels()

    override fun onCreateView(inflater: LayoutInflater, container: ViewGroup?, savedInstanceState: Bundle?): View {
        _binding = BottomSheetGiftsBinding.inflate(inflater, container, false)
        return binding.root
    }

    override fun onViewCreated(view: View, savedInstanceState: Bundle?) {
        super.onViewCreated(view, savedInstanceState)
        binding.rvGifts.layoutManager = GridLayoutManager(requireContext(), 4)
        viewModel.loadGifts()

        viewLifecycleOwner.lifecycleScope.launch {
            viewModel.gifts.collect { gifts ->
                binding.rvGifts.adapter = GiftAdapter(gifts) { gift ->
                    val streamId = arguments?.getString("streamId") ?: ""
                    val receiverId = arguments?.getString("receiverId") ?: ""
                    viewModel.sendGift(gift.id, receiverId, streamId)
                }
            }
        }
    }

    override fun onDestroyView() { super.onDestroyView(); _binding = null }

    companion object {
        fun newInstance(streamId: String, receiverId: String) = GiftBottomSheet().apply {
            arguments = Bundle().apply {
                putString("streamId", streamId)
                putString("receiverId", receiverId)
            }
        }
    }
}

@HiltViewModel
class GiftViewModel @Inject constructor(
    private val giftRepository: GiftRepository,
) : ViewModel() {
    private val _gifts = MutableStateFlow<List<GiftResponse>>(emptyList())
    val gifts = _gifts.asStateFlow()

    fun loadGifts() {
        viewModelScope.launch {
            try { _gifts.value = giftRepository.getGifts() } catch (_: Exception) {}
        }
    }

    fun sendGift(giftId: String, receiverId: String, streamId: String) {
        viewModelScope.launch {
            giftRepository.sendGift(giftId, receiverId, streamId, 1)
        }
    }
}

// Gift Adapter — uses Coil singleton (no memory leak)
class GiftAdapter(
    private val gifts: List<GiftResponse>,
    private val onClick: (GiftResponse) -> Unit,
) : androidx.recyclerview.widget.RecyclerView.Adapter<GiftAdapter.VH>() {

    inner class VH(val binding: ItemGiftBinding) :
        androidx.recyclerview.widget.RecyclerView.ViewHolder(binding.root)

    override fun onCreateViewHolder(parent: ViewGroup, viewType: Int): VH {
        return VH(ItemGiftBinding.inflate(LayoutInflater.from(parent.context), parent, false))
    }

    override fun onBindViewHolder(holder: VH, position: Int) {
        val gift = gifts[position]
        holder.binding.apply {
            ivGiftIcon.load(gift.icon_url) { crossfade(true) }
            tvGiftName.text = gift.name
            tvGiftPrice.text = "${gift.coin_price} 💎"
            root.setOnClickListener { onClick(gift) }
        }
    }

    override fun getItemCount() = gifts.size
}
