package com.merilive.app.ui.vip

import android.os.Bundle
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import android.widget.TextView
import android.widget.Toast
import androidx.fragment.app.Fragment
import androidx.fragment.app.viewModels
import androidx.lifecycle.lifecycleScope
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import androidx.navigation.fragment.findNavController
import androidx.recyclerview.widget.LinearLayoutManager
import androidx.recyclerview.widget.RecyclerView
import com.merilive.app.R
import com.merilive.app.databinding.FragmentVipBinding
import dagger.hilt.android.AndroidEntryPoint
import dagger.hilt.android.lifecycle.HiltViewModel
import io.github.jan.supabase.auth.Auth
import io.github.jan.supabase.postgrest.Postgrest
import io.github.jan.supabase.postgrest.query.Order
import kotlinx.coroutines.async
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import kotlinx.serialization.Serializable
import javax.inject.Inject

@AndroidEntryPoint
class VipFragment : Fragment() {

    private var _binding: FragmentVipBinding? = null
    private val binding get() = _binding!!
    private val viewModel: VipViewModel by viewModels()

    override fun onCreateView(
        inflater: LayoutInflater, container: ViewGroup?, savedInstanceState: Bundle?
    ): View {
        _binding = FragmentVipBinding.inflate(inflater, container, false)
        return binding.root
    }

    override fun onViewCreated(view: View, savedInstanceState: Bundle?) {
        super.onViewCreated(view, savedInstanceState)

        binding.btnBack.setOnClickListener { findNavController().navigateUp() }

        binding.rvVipTiers.layoutManager = LinearLayoutManager(
            requireContext(), LinearLayoutManager.HORIZONTAL, false)

        viewModel.loadVipData()
        observeState()
    }

    private fun observeState() {
        viewLifecycleOwner.lifecycleScope.launchWhenStarted {
            viewModel.state.collect { state ->
                when (state) {
                    is VipState.Loading -> binding.progressBar.visibility = View.VISIBLE
                    is VipState.Success -> {
                        binding.progressBar.visibility = View.GONE

                        // Current VIP status
                        if (state.currentVip != null) {
                            binding.currentVipSection.visibility = View.VISIBLE
                            binding.tvCurrentVipTier.text = "VIP ${state.currentVip.tier}"
                            binding.tvVipExpiry.text = "Expires: ${state.currentVip.expiresAt ?: "Never"}"
                        } else {
                            binding.currentVipSection.visibility = View.GONE
                        }

                        // VIP tiers
                        binding.rvVipTiers.adapter = VipTierAdapter(state.tiers) { tier ->
                            viewModel.purchaseVip(tier)
                        }

                        // Benefits list
                        binding.rvBenefits.layoutManager = LinearLayoutManager(requireContext())
                        binding.rvBenefits.adapter = VipBenefitAdapter(state.selectedTierBenefits)
                    }
                    is VipState.Purchased -> {
                        Toast.makeText(requireContext(),
                            "🎉 VIP ${state.tier} activated!", Toast.LENGTH_LONG).show()
                        viewModel.loadVipData()
                    }
                    is VipState.Error -> {
                        binding.progressBar.visibility = View.GONE
                        Toast.makeText(requireContext(), state.message, Toast.LENGTH_LONG).show()
                    }
                }
            }
        }
    }

    override fun onDestroyView() {
        super.onDestroyView()
        _binding = null
    }
}

// ====== VIP Tier Adapter ======
class VipTierAdapter(
    private val tiers: List<VipTierItem>,
    private val onPurchase: (VipTierItem) -> Unit,
) : RecyclerView.Adapter<VipTierAdapter.VH>() {

    inner class VH(view: View) : RecyclerView.ViewHolder(view) {
        val tvName: TextView = view.findViewById(R.id.tvTierName)
        val tvPrice: TextView = view.findViewById(R.id.tvTierPrice)
        val tvDuration: TextView = view.findViewById(R.id.tvTierDuration)
    }

    override fun onCreateViewHolder(parent: ViewGroup, viewType: Int): VH {
        val view = LayoutInflater.from(parent.context)
            .inflate(R.layout.item_vip_tier, parent, false)
        return VH(view)
    }

    override fun onBindViewHolder(holder: VH, position: Int) {
        val tier = tiers[position]
        holder.tvName.text = tier.name
        holder.tvPrice.text = "💎 ${tier.priceDiamonds}"
        holder.tvDuration.text = "${tier.durationDays} days"
        holder.itemView.setOnClickListener { onPurchase(tier) }
    }

    override fun getItemCount() = tiers.size
}

// ====== VIP Benefit Adapter ======
class VipBenefitAdapter(
    private val benefits: List<String>,
) : RecyclerView.Adapter<VipBenefitAdapter.VH>() {

    inner class VH(view: View) : RecyclerView.ViewHolder(view) {
        val tvBenefit: TextView = view.findViewById(android.R.id.text1)
    }

    override fun onCreateViewHolder(parent: ViewGroup, viewType: Int): VH {
        val view = LayoutInflater.from(parent.context)
            .inflate(android.R.layout.simple_list_item_1, parent, false)
        return VH(view)
    }

    override fun onBindViewHolder(holder: VH, position: Int) {
        holder.tvBenefit.text = "✅ ${benefits[position]}"
        holder.tvBenefit.setTextColor(holder.itemView.resources.getColor(R.color.text_primary, null))
    }

    override fun getItemCount() = benefits.size
}

// ====== State & ViewModel ======
sealed class VipState {
    object Loading : VipState()
    data class Success(
        val currentVip: CurrentVipStatus?,
        val tiers: List<VipTierItem>,
        val selectedTierBenefits: List<String>,
    ) : VipState()
    data class Purchased(val tier: Int) : VipState()
    data class Error(val message: String) : VipState()
}

@HiltViewModel
class VipViewModel @Inject constructor(
    private val auth: Auth,
    private val postgrest: Postgrest,
) : ViewModel() {

    private val _state = MutableStateFlow<VipState>(VipState.Loading)
    val state = _state.asStateFlow()

    fun loadVipData() {
        viewModelScope.launch {
            try {
                val userId = auth.currentSessionOrNull()?.user?.id ?: return@launch

                val tiersDeferred = async {
                    postgrest.from("vip_tiers")
                        .select {
                            filter { eq("is_active", true) }
                            order("tier", Order.ASCENDING)
                        }
                        .decodeList<VipTierResponse>()
                }

                val currentDeferred = async {
                    try {
                        postgrest.from("user_vip_subscriptions")
                            .select {
                                filter {
                                    eq("user_id", userId)
                                    eq("is_active", true)
                                }
                                limit(1)
                            }
                            .decodeList<UserVipResponse>()
                            .firstOrNull()
                    } catch (_: Exception) { null }
                }

                val tiers = tiersDeferred.await()
                val current = currentDeferred.await()

                _state.value = VipState.Success(
                    currentVip = current?.let {
                        CurrentVipStatus(tier = it.tier ?: 0, expiresAt = it.expires_at)
                    },
                    tiers = tiers.map {
                        VipTierItem(
                            id = it.id,
                            tier = it.tier,
                            name = it.name,
                            priceDiamonds = it.price_diamonds,
                            durationDays = it.duration_days,
                            benefits = it.benefits ?: emptyList(),
                            frameUrl = it.frame_url,
                        )
                    },
                    selectedTierBenefits = tiers.firstOrNull()?.benefits ?: emptyList(),
                )
            } catch (e: Exception) {
                _state.value = VipState.Error(e.message ?: "Failed")
            }
        }
    }

    fun purchaseVip(tier: VipTierItem) {
        viewModelScope.launch {
            try {
                val userId = auth.currentSessionOrNull()?.user?.id ?: return@launch
                postgrest.rpc("purchase_vip", mapOf(
                    "p_user_id" to userId,
                    "p_tier_id" to tier.id,
                    "p_price" to tier.priceDiamonds,
                ))
                _state.value = VipState.Purchased(tier.tier)
            } catch (e: Exception) {
                _state.value = VipState.Error(e.message ?: "Purchase failed")
            }
        }
    }
}

data class CurrentVipStatus(val tier: Int, val expiresAt: String?)
data class VipTierItem(
    val id: String, val tier: Int, val name: String,
    val priceDiamonds: Int, val durationDays: Int,
    val benefits: List<String>, val frameUrl: String?,
)

@Serializable
data class VipTierResponse(
    val id: String, val tier: Int, val name: String,
    val price_diamonds: Int, val duration_days: Int,
    val benefits: List<String>? = null, val frame_url: String? = null,
)

@Serializable
data class UserVipResponse(
    val tier: Int? = null, val expires_at: String? = null, val is_active: Boolean? = null,
)
