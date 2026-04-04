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
import com.google.android.material.bottomsheet.BottomSheetDialogFragment
import com.merilive.app.databinding.BottomSheetStickersBinding
import com.merilive.app.data.repository.*
import com.merilive.app.service.DeepARManager
import dagger.hilt.android.AndroidEntryPoint
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import javax.inject.Inject

@AndroidEntryPoint
class StickerBottomSheet : BottomSheetDialogFragment() {

    private var _binding: BottomSheetStickersBinding? = null
    private val binding get() = _binding!!
    private val viewModel: StickerViewModel by viewModels()

    @Inject lateinit var deepARManager: DeepARManager

    override fun onCreateView(inflater: LayoutInflater, container: ViewGroup?, savedInstanceState: Bundle?): View {
        _binding = BottomSheetStickersBinding.inflate(inflater, container, false)
        return binding.root
    }

    override fun onViewCreated(view: View, savedInstanceState: Bundle?) {
        super.onViewCreated(view, savedInstanceState)
        binding.rvStickers.layoutManager = GridLayoutManager(requireContext(), 4)

        viewModel.loadStickers()

        viewLifecycleOwner.lifecycleScope.launch {
            viewModel.stickers.collect { stickers ->
                binding.rvStickers.adapter = StickerAdapter(stickers) { sticker ->
                    deepARManager.loadEffect(sticker.file_url)
                }
            }
        }

        binding.btnClearSticker.setOnClickListener {
            deepARManager.clearEffect()
        }
    }

    override fun onDestroyView() { super.onDestroyView(); _binding = null }
}

@HiltViewModel
class StickerViewModel @Inject constructor(
    private val liveRepository: LiveRepository,
) : ViewModel() {
    private val _stickers = MutableStateFlow<List<ArStickerResponse>>(emptyList())
    val stickers = _stickers.asStateFlow()

    fun loadStickers() {
        viewModelScope.launch {
            try { _stickers.value = liveRepository.getArStickers() } catch (_: Exception) {}
        }
    }
}

class StickerAdapter(
    private val stickers: List<ArStickerResponse>,
    private val onClick: (ArStickerResponse) -> Unit,
) : androidx.recyclerview.widget.RecyclerView.Adapter<StickerAdapter.VH>() {

    inner class VH(val binding: com.merilive.app.databinding.ItemStickerBinding) :
        androidx.recyclerview.widget.RecyclerView.ViewHolder(binding.root)

    override fun onCreateViewHolder(parent: ViewGroup, viewType: Int): VH {
        return VH(com.merilive.app.databinding.ItemStickerBinding.inflate(
            LayoutInflater.from(parent.context), parent, false))
    }

    override fun onBindViewHolder(holder: VH, position: Int) {
        val sticker = stickers[position]
        holder.binding.apply {
            tvName.text = sticker.name
            root.setOnClickListener { onClick(sticker) }
        }
    }

    override fun getItemCount() = stickers.size
}
