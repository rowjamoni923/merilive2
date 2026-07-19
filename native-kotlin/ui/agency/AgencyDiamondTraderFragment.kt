package com.merilive.app.ui.agency

import android.os.Bundle
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import android.widget.Toast
import androidx.fragment.app.Fragment
import androidx.fragment.app.viewModels
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import androidx.lifecycle.lifecycleScope
import androidx.navigation.fragment.findNavController
import androidx.recyclerview.widget.LinearLayoutManager
import androidx.recyclerview.widget.RecyclerView
import com.merilive.app.databinding.FragmentAgencyDiamondTraderBinding
import dagger.hilt.android.AndroidEntryPoint
import dagger.hilt.android.lifecycle.HiltViewModel
import io.github.jan.supabase.auth.Auth
import io.github.jan.supabase.postgrest.Postgrest
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put
import javax.inject.Inject

@AndroidEntryPoint
class AgencyDiamondTraderFragment : Fragment() {

    private var _binding: FragmentAgencyDiamondTraderBinding? = null
    private val binding get() = _binding!!
    private val viewModel: AgencyDiamondTraderViewModel by viewModels()

    override fun onCreateView(
        inflater: LayoutInflater, container: ViewGroup?, savedInstanceState: Bundle?
    ): View {
        _binding = FragmentAgencyDiamondTraderBinding.inflate(inflater, container, false)
        return binding.root
    }

    override fun onViewCreated(view: View, savedInstanceState: Bundle?) {
        super.onViewCreated(view, savedInstanceState)

        binding.btnBack.setOnClickListener { findNavController().navigateUp() }
        binding.rvTraders.layoutManager = LinearLayoutManager(requireContext())

        viewLifecycleOwner.lifecycleScope.launchWhenStarted {
            viewModel.traders.collect { list ->
                binding.tvEmpty.visibility = if (list.isEmpty()) View.VISIBLE else View.GONE
                binding.rvTraders.adapter = DiamondTraderAdapter(list) { trader ->
                    viewModel.showTopUpNotice(trader.displayName)
                }
            }
        }

        viewLifecycleOwner.lifecycleScope.launchWhenStarted {
            viewModel.tradeResult.collect { msg ->
                if (msg.isNotEmpty()) {
                    Toast.makeText(requireContext(), msg, Toast.LENGTH_SHORT).show()
                }
            }
        }

        viewModel.loadTraders()
    }

    override fun onDestroyView() {
        super.onDestroyView()
        _binding = null
    }
}

@HiltViewModel
class AgencyDiamondTraderViewModel @Inject constructor(
    private val auth: Auth,
    private val postgrest: Postgrest,
) : ViewModel() {

    private val _traders = MutableStateFlow<List<DiamondTrader>>(emptyList())
    val traders = _traders.asStateFlow()

    private val _tradeResult = MutableStateFlow("")
    val tradeResult = _tradeResult.asStateFlow()

    fun loadTraders() {
        viewModelScope.launch {
            try {
                val result = postgrest.from("topup_helpers")
                    .select(columns = io.github.jan.supabase.postgrest.query.Columns.raw("*, profiles(display_name, avatar_url, app_uid)")) {
                        filter {
                            eq("is_active", true)
                            eq("is_verified", true)
                        }
                    }
                    .decodeList<DiamondTraderResponse>()

                _traders.value = result.map {
                    DiamondTrader(
                        id = it.id,
                        displayName = it.profiles?.display_name ?: "Trader",
                        avatarUrl = it.profiles?.avatar_url,
                        walletBalance = it.wallet_balance ?: 0.0,
                        buyRate = it.buy_rate ?: 0.0,
                        sellRate = it.sell_rate ?: 0.0,
                    )
                }
            } catch (_: Exception) {
                _traders.value = emptyList()
            }
        }
    }

    fun showTopUpNotice(traderName: String) {
        _tradeResult.value = "Open Recharge to submit a Diamond top-up order with $traderName."
    }
}

data class DiamondTrader(
    val id: String,
    val displayName: String,
    val avatarUrl: String?,
    val walletBalance: Double,
    val buyRate: Double,
    val sellRate: Double,
)

@Serializable
data class DiamondTraderResponse(
    val id: String,
    val wallet_balance: Double? = null,
    val buy_rate: Double? = null,
    val sell_rate: Double? = null,
    val is_active: Boolean? = null,
    val is_verified: Boolean? = null,
    val profiles: DiamondTraderProfileRef? = null,
)

@Serializable
data class DiamondTraderProfileRef(
    val display_name: String? = null,
    val avatar_url: String? = null,
    val app_uid: String? = null,
)

class DiamondTraderAdapter(
    private val items: List<DiamondTrader>,
    private val onTrade: (DiamondTrader) -> Unit,
) : RecyclerView.Adapter<DiamondTraderAdapter.VH>() {
    inner class VH(itemView: View) : RecyclerView.ViewHolder(itemView)
    override fun onCreateViewHolder(parent: ViewGroup, viewType: Int): VH {
        val tv = android.widget.TextView(parent.context).apply {
            setPadding(32, 20, 32, 20)
            textSize = 14f
        }
        return VH(tv)
    }
    override fun onBindViewHolder(holder: VH, position: Int) {
        val t = items[position]
        (holder.itemView as android.widget.TextView).text =
            "💎 ${t.displayName} — Buy: ${t.buyRate} | Sell: ${t.sellRate}"
        holder.itemView.setOnClickListener { onTrade(t) }
    }
    override fun getItemCount() = items.size
}
