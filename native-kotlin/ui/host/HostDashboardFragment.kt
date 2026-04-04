package com.merilive.app.ui.host

import android.os.Bundle
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import android.widget.TextView
import androidx.fragment.app.Fragment
import androidx.fragment.app.viewModels
import androidx.lifecycle.lifecycleScope
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import androidx.navigation.fragment.findNavController
import androidx.recyclerview.widget.LinearLayoutManager
import androidx.recyclerview.widget.RecyclerView
import com.merilive.app.R
import com.merilive.app.databinding.FragmentHostDashboardBinding
import dagger.hilt.android.AndroidEntryPoint
import dagger.hilt.android.lifecycle.HiltViewModel
import io.github.jan.supabase.auth.Auth
import io.github.jan.supabase.postgrest.Postgrest
import io.github.jan.supabase.postgrest.query.Columns
import io.github.jan.supabase.postgrest.query.Order
import kotlinx.coroutines.async
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import kotlinx.serialization.Serializable
import javax.inject.Inject

@AndroidEntryPoint
class HostDashboardFragment : Fragment() {

    private var _binding: FragmentHostDashboardBinding? = null
    private val binding get() = _binding!!
    private val viewModel: HostDashboardViewModel by viewModels()

    override fun onCreateView(
        inflater: LayoutInflater, container: ViewGroup?, savedInstanceState: Bundle?
    ): View {
        _binding = FragmentHostDashboardBinding.inflate(inflater, container, false)
        return binding.root
    }

    override fun onViewCreated(view: View, savedInstanceState: Bundle?) {
        super.onViewCreated(view, savedInstanceState)
        binding.btnBack.setOnClickListener { findNavController().navigateUp() }
        binding.btnGoLive.setOnClickListener {
            findNavController().navigate(R.id.action_hostDashboard_to_goLive)
        }
        binding.btnTransferHistory.setOnClickListener {
            findNavController().navigate(R.id.action_hostDashboard_to_transferHistory)
        }
        binding.rvEarningsHistory.layoutManager = LinearLayoutManager(requireContext())

        viewModel.loadDashboard()

        viewLifecycleOwner.lifecycleScope.launchWhenStarted {
            viewModel.state.collect { state ->
                when (state) {
                    is HostDashState.Loading -> {}
                    is HostDashState.Success -> {
                        binding.tvTodayBeans.text = formatBeans(state.todayBeans)
                        binding.tvWeeklyBeans.text = formatBeans(state.weeklyBeans)
                        binding.tvMonthlyBeans.text = formatBeans(state.monthlyBeans)
                        binding.tvTotalBeans.text = formatBeans(state.totalBeans)
                        binding.tvTodayHours.text = "⏱ ${String.format("%.1fh", state.todayHours)}"
                        binding.tvCallEarnings.text = "📞 ${state.callEarnings}"
                        binding.tvGiftEarnings.text = "🎁 ${state.giftEarnings}"
                        binding.rvEarningsHistory.adapter = EarningsHistoryAdapter(state.recentTransfers)
                    }
                }
            }
        }
    }

    private fun formatBeans(amount: Int): String = when {
        amount >= 1_000_000 -> String.format("%.1fM", amount / 1_000_000.0)
        amount >= 1_000 -> String.format("%.1fK", amount / 1_000.0)
        else -> amount.toString()
    }

    override fun onDestroyView() {
        super.onDestroyView()
        _binding = null
    }
}

// ====== Earnings History Adapter ======
class EarningsHistoryAdapter(
    private val transfers: List<TransferItem>,
) : RecyclerView.Adapter<EarningsHistoryAdapter.VH>() {

    inner class VH(view: View) : RecyclerView.ViewHolder(view) {
        val tvType: TextView = view.findViewById(R.id.tvType)
        val tvAmount: TextView = view.findViewById(R.id.tvAmount)
        val tvDate: TextView = view.findViewById(R.id.tvDate)
    }

    override fun onCreateViewHolder(parent: ViewGroup, viewType: Int): VH {
        val view = LayoutInflater.from(parent.context)
            .inflate(R.layout.item_transaction, parent, false)
        return VH(view)
    }

    override fun onBindViewHolder(holder: VH, position: Int) {
        val tx = transfers[position]
        val emoji = when (tx.type) {
            "gift" -> "🎁"
            "call" -> "📞"
            "commission" -> "💰"
            else -> "🫘"
        }
        holder.tvType.text = "$emoji ${tx.type}"
        holder.tvAmount.text = "+${tx.amount}"
        holder.tvAmount.setTextColor(holder.itemView.resources.getColor(R.color.success, null))
        holder.tvDate.text = tx.date.take(10)
    }

    override fun getItemCount() = transfers.size
}

// ====== State ======
sealed class HostDashState {
    object Loading : HostDashState()
    data class Success(
        val todayBeans: Int, val weeklyBeans: Int, val monthlyBeans: Int, val totalBeans: Int,
        val todayHours: Double, val callEarnings: Int, val giftEarnings: Int,
        val recentTransfers: List<TransferItem>,
    ) : HostDashState()
}

data class TransferItem(val id: String, val amount: Int, val type: String, val date: String, val status: String)

@HiltViewModel
class HostDashboardViewModel @Inject constructor(
    private val auth: Auth,
    private val postgrest: Postgrest,
) : ViewModel() {

    private val _state = MutableStateFlow<HostDashState>(HostDashState.Loading)
    val state = _state.asStateFlow()

    fun loadDashboard() {
        viewModelScope.launch {
            try {
                val userId = auth.currentSessionOrNull()?.user?.id ?: return@launch

                val profileDeferred = async {
                    postgrest.from("profiles")
                        .select(Columns.raw("beans, total_stream_hours")) {
                            filter { eq("id", userId) }
                        }
                        .decodeSingle<HostProfileResponse>()
                }

                val transfersDeferred = async {
                    postgrest.from("agency_earnings_transfers")
                        .select {
                            filter { eq("host_id", userId) }
                            order("created_at", Order.DESCENDING)
                            limit(20)
                        }
                        .decodeList<TransferResponse>()
                }

                // Get earnings breakdown via RPC
                val earningsDeferred = async {
                    try {
                        postgrest.rpc("get_host_earnings_summary", mapOf("p_host_id" to userId))
                            .decodeSingle<HostEarningsSummary>()
                    } catch (_: Exception) {
                        HostEarningsSummary()
                    }
                }

                val profile = profileDeferred.await()
                val transfers = transfersDeferred.await()
                val earnings = earningsDeferred.await()

                _state.value = HostDashState.Success(
                    todayBeans = earnings.today_beans ?: 0,
                    weeklyBeans = earnings.weekly_beans ?: 0,
                    monthlyBeans = earnings.monthly_beans ?: 0,
                    totalBeans = profile.beans ?: 0,
                    todayHours = profile.total_stream_hours ?: 0.0,
                    callEarnings = earnings.call_earnings ?: 0,
                    giftEarnings = earnings.gift_earnings ?: 0,
                    recentTransfers = transfers.map {
                        TransferItem(
                            it.id,
                            it.amount ?: 0,
                            it.transfer_type ?: "",
                            it.created_at ?: "",
                            it.status ?: ""
                        )
                    }
                )
            } catch (_: Exception) {}
        }
    }
}

@Serializable data class HostProfileResponse(val beans: Int? = null, val total_stream_hours: Double? = null)
@Serializable
data class TransferResponse(
    val id: String, val amount: Int? = null, val transfer_type: String? = null,
    val created_at: String? = null, val status: String? = null,
)
@Serializable
data class HostEarningsSummary(
    val today_beans: Int? = null,
    val weekly_beans: Int? = null,
    val monthly_beans: Int? = null,
    val call_earnings: Int? = null,
    val gift_earnings: Int? = null,
)
