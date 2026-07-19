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
import com.merilive.app.databinding.FragmentAgencyCoinTraderBinding
import dagger.hilt.android.AndroidEntryPoint
import dagger.hilt.android.lifecycle.HiltViewModel
import io.github.jan.supabase.auth.Auth
import io.github.jan.supabase.postgrest.Postgrest
import io.github.jan.supabase.functions.Functions
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put
import javax.inject.Inject

@AndroidEntryPoint
class AgencyCoinTraderFragment : Fragment() {

    private var _binding: FragmentAgencyCoinTraderBinding? = null
    private val binding get() = _binding!!
    private val viewModel: AgencyCoinTraderViewModel by viewModels()

    override fun onCreateView(
        inflater: LayoutInflater, container: ViewGroup?, savedInstanceState: Bundle?
    ): View {
        _binding = FragmentAgencyCoinTraderBinding.inflate(inflater, container, false)
        return binding.root
    }

    override fun onViewCreated(view: View, savedInstanceState: Bundle?) {
        super.onViewCreated(view, savedInstanceState)

        binding.btnBack.setOnClickListener { findNavController().navigateUp() }
        binding.rvTraders.layoutManager = LinearLayoutManager(requireContext())

        viewLifecycleOwner.lifecycleScope.launchWhenStarted {
            viewModel.traders.collect { list ->
                binding.tvEmpty.visibility = if (list.isEmpty()) View.VISIBLE else View.GONE
                binding.rvTraders.adapter = CoinTraderAdapter(list) { trader ->
                    viewModel.initiateTrade(trader.id)
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
class AgencyCoinTraderViewModel @Inject constructor(
    private val auth: Auth,
    private val postgrest: Postgrest,
    private val functions: Functions,
) : ViewModel() {

    private val _traders = MutableStateFlow<List<CoinTrader>>(emptyList())
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
                    .decodeList<CoinTraderResponse>()

                _traders.value = result.map {
                    CoinTrader(
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

    fun initiateTrade(traderId: String) {
        viewModelScope.launch {
            try {
                val userId = auth.currentSessionOrNull()?.user?.id ?: return@launch
                val body = buildJsonObject {
                    put("trader_id", traderId)
                    put("user_id", userId)
                    put("trade_type", "buy")
                }
                functions.invoke("initiate-coin-trade", body)
                _tradeResult.value = "✅ Trade request sent!"
            } catch (e: Exception) {
                _tradeResult.value = "❌ ${e.message}"
            }
        }
    }
}

data class CoinTrader(
    val id: String,
    val displayName: String,
    val avatarUrl: String?,
    val walletBalance: Double,
    val buyRate: Double,
    val sellRate: Double,
)

@Serializable
data class CoinTraderResponse(
    val id: String,
    val wallet_balance: Double? = null,
    val buy_rate: Double? = null,
    val sell_rate: Double? = null,
    val is_active: Boolean? = null,
    val is_verified: Boolean? = null,
    val profiles: CoinTraderProfileRef? = null,
)

@Serializable
data class CoinTraderProfileRef(
    val display_name: String? = null,
    val avatar_url: String? = null,
    val app_uid: String? = null,
)

class CoinTraderAdapter(
    private val items: List<CoinTrader>,
    private val onTrade: (CoinTrader) -> Unit,
) : RecyclerView.Adapter<CoinTraderAdapter.VH>() {
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
            "💰 ${t.displayName} — Buy: ${t.buyRate} | Sell: ${t.sellRate}"
        holder.itemView.setOnClickListener { onTrade(t) }
    }
    override fun getItemCount() = items.size
}
