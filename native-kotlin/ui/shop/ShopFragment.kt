package com.merilive.app.ui.shop

import android.os.Bundle
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import androidx.fragment.app.Fragment
import androidx.fragment.app.viewModels
import androidx.lifecycle.lifecycleScope
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import androidx.navigation.fragment.findNavController
import androidx.recyclerview.widget.GridLayoutManager
import com.merilive.app.R
import com.merilive.app.databinding.FragmentShopBinding
import dagger.hilt.android.AndroidEntryPoint
import dagger.hilt.android.lifecycle.HiltViewModel
import io.github.jan.supabase.auth.Auth
import io.github.jan.supabase.postgrest.Postgrest
import io.github.jan.supabase.postgrest.query.Order
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import kotlinx.serialization.Serializable
import javax.inject.Inject

@AndroidEntryPoint
class ShopFragment : Fragment() {

    private var _binding: FragmentShopBinding? = null
    private val binding get() = _binding!!
    private val viewModel: ShopViewModel by viewModels()

    override fun onCreateView(
        inflater: LayoutInflater, container: ViewGroup?, savedInstanceState: Bundle?
    ): View {
        _binding = FragmentShopBinding.inflate(inflater, container, false)
        return binding.root
    }

    override fun onViewCreated(view: View, savedInstanceState: Bundle?) {
        super.onViewCreated(view, savedInstanceState)

        binding.btnBack.setOnClickListener { findNavController().navigateUp() }

        val tabs = listOf("Frames", "Vehicles", "Chat Bubbles", "Entry Effects")
        binding.chipGroup.removeAllViews()
        tabs.forEachIndexed { index, tab ->
            val chip = com.google.android.material.chip.Chip(requireContext()).apply {
                text = tab
                isCheckable = true
                isChecked = index == 0
                setOnClickListener { viewModel.loadCategory(tab.lowercase().replace(" ", "_")) }
            }
            binding.chipGroup.addView(chip)
        }

        binding.rvShopItems.layoutManager = GridLayoutManager(requireContext(), 3)

        viewModel.loadCategory("frames")
        observeState()
    }

    private fun observeState() {
        viewLifecycleOwner.lifecycleScope.launchWhenStarted {
            viewModel.items.collect { items ->
                binding.rvShopItems.adapter = ShopItemAdapter(items) { item ->
                    viewModel.purchaseItem(item)
                }
            }
        }
    }

    override fun onDestroyView() {
        super.onDestroyView()
        _binding = null
    }
}

@HiltViewModel
class ShopViewModel @Inject constructor(
    private val postgrest: Postgrest,
    private val auth: Auth,
) : ViewModel() {

    private val _items = MutableStateFlow<List<ShopItem>>(emptyList())
    val items = _items.asStateFlow()

    fun loadCategory(category: String) {
        viewModelScope.launch {
            try {
                val tableName = when (category) {
                    "frames" -> "avatar_frames"
                    "vehicles" -> "avatar_frames"
                    "chat_bubbles" -> "avatar_frames"
                    "entry_effects" -> "avatar_frames"
                    else -> "avatar_frames"
                }
                val result = postgrest.from(tableName)
                    .select {
                        filter {
                            eq("is_active", true)
                            if (category != "frames") eq("category", category)
                        }
                        order("display_order", Order.ASCENDING)
                    }
                    .decodeList<ShopItemResponse>()

                _items.value = result.map {
                    ShopItem(
                        id = it.id,
                        name = it.name,
                        previewUrl = it.preview_url ?: it.frame_url,
                        priceDiamonds = it.price_diamonds ?: 0,
                        isPremium = it.is_premium ?: false,
                        minLevel = it.min_level ?: 0,
                    )
                }
            } catch (e: Exception) {
                _items.value = emptyList()
            }
        }
    }

    fun purchaseItem(item: ShopItem) {
        viewModelScope.launch {
            try {
                val userId = auth.currentSessionOrNull()?.user?.id ?: return@launch
                postgrest.rpc("purchase_shop_item", mapOf(
                    "p_user_id" to userId,
                    "p_item_id" to item.id,
                    "p_item_type" to "frame",
                    "p_price" to item.priceDiamonds,
                ))
            } catch (e: Exception) {
                // Handle insufficient balance etc
            }
        }
    }
}

data class ShopItem(
    val id: String,
    val name: String,
    val previewUrl: String?,
    val priceDiamonds: Int,
    val isPremium: Boolean,
    val minLevel: Int,
)

@Serializable
data class ShopItemResponse(
    val id: String,
    val name: String,
    val frame_url: String,
    val preview_url: String? = null,
    val price_diamonds: Int? = null,
    val is_premium: Boolean? = null,
    val min_level: Int? = null,
)