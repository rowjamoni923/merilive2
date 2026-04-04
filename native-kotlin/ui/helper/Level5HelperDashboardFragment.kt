package com.merilive.app.ui.helper

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
import com.merilive.app.databinding.FragmentLevel5HelperDashboardBinding
import dagger.hilt.android.AndroidEntryPoint
import dagger.hilt.android.lifecycle.HiltViewModel
import io.github.jan.supabase.auth.Auth
import io.github.jan.supabase.postgrest.Postgrest
import io.github.jan.supabase.postgrest.query.Count
import io.github.jan.supabase.postgrest.query.Order
import io.github.jan.supabase.functions.Functions
import io.github.jan.supabase.storage.Storage
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put
import javax.inject.Inject

@AndroidEntryPoint
class Level5HelperDashboardFragment : Fragment() {

    private var _binding: FragmentLevel5HelperDashboardBinding? = null
    private val binding get() = _binding!!
    private val viewModel: Level5HelperDashboardViewModel by viewModels()

    override fun onCreateView(
        inflater: LayoutInflater, container: ViewGroup?, savedInstanceState: Bundle?
    ): View {
        _binding = FragmentLevel5HelperDashboardBinding.inflate(inflater, container, false)
        return binding.root
    }

    override fun onViewCreated(view: View, savedInstanceState: Bundle?) {
        super.onViewCreated(view, savedInstanceState)

        binding.btnBack.setOnClickListener { findNavController().navigateUp() }
        binding.rvOrders.layoutManager = LinearLayoutManager(requireContext())

        binding.tabPending.setOnClickListener {
            binding.tabPending.isSelected = true
            binding.tabProcessed.isSelected = false
            binding.tabWithdrawals.isSelected = false
            viewModel.loadOrders("pending")
        }
        binding.tabProcessed.setOnClickListener {
            binding.tabPending.isSelected = false
            binding.tabProcessed.isSelected = true
            binding.tabWithdrawals.isSelected = false
            viewModel.loadOrders("completed")
        }
        binding.tabWithdrawals.setOnClickListener {
            binding.tabPending.isSelected = false
            binding.tabProcessed.isSelected = false
            binding.tabWithdrawals.isSelected = true
            viewModel.loadWithdrawals()
        }

        viewLifecycleOwner.lifecycleScope.launchWhenStarted {
            viewModel.stats.collect { stats ->
                binding.tvWalletBalance.text = "💰 $${stats.walletBalance}"
                binding.tvTotalEarnings.text = "📈 $${stats.totalEarnings}"
                binding.tvPendingOrders.text = "⏳ ${stats.pendingCount}"
                binding.tvCompletedOrders.text = "✅ ${stats.completedCount}"
            }
        }

        viewLifecycleOwner.lifecycleScope.launchWhenStarted {
            viewModel.orders.collect { list ->
                binding.rvOrders.adapter = Level5OrderAdapter(list) { order ->
                    viewModel.processOrder(order.id)
                }
            }
        }

        viewLifecycleOwner.lifecycleScope.launchWhenStarted {
            viewModel.message.collect { msg ->
                if (msg.isNotEmpty()) {
                    Toast.makeText(requireContext(), msg, Toast.LENGTH_SHORT).show()
                }
            }
        }

        viewModel.loadStats()
        viewModel.loadOrders("pending")
    }

    override fun onDestroyView() {
        super.onDestroyView()
        _binding = null
    }
}

data class HelperStats(
    val walletBalance: Double = 0.0,
    val totalEarnings: Double = 0.0,
    val pendingCount: Int = 0,
    val completedCount: Int = 0,
)

data class HelperOrder(
    val id: String,
    val userName: String,
    val amount: Double,
    val status: String,
    val createdAt: String,
    val paymentMethod: String?,
    val screenshotUrl: String?,
)

@HiltViewModel
class Level5HelperDashboardViewModel @Inject constructor(
    private val auth: Auth,
    private val postgrest: Postgrest,
    private val functions: Functions,
) : ViewModel() {

    private val _stats = MutableStateFlow(HelperStats())
    val stats = _stats.asStateFlow()

    private val _orders = MutableStateFlow<List<HelperOrder>>(emptyList())
    val orders = _orders.asStateFlow()

    private val _message = MutableStateFlow("")
    val message = _message.asStateFlow()

    fun loadStats() {
        viewModelScope.launch {
            try {
                val userId = auth.currentSessionOrNull()?.user?.id ?: return@launch
                val helper = postgrest.from("topup_helpers")
                    .select {
                        filter { eq("user_id", userId) }
                    }
                    .decodeSingleOrNull<Level5HelperResponse>()

                if (helper != null) {
                    val pending = postgrest.from("helper_orders")
                        .select(columns = io.github.jan.supabase.postgrest.query.Columns.list("id")) {
                            filter {
                                eq("assigned_helper_id", helper.id)
                                eq("status", "pending")
                            }
                            count(Count.EXACT)
                        }

                    val completed = postgrest.from("helper_orders")
                        .select(columns = io.github.jan.supabase.postgrest.query.Columns.list("id")) {
                            filter {
                                eq("assigned_helper_id", helper.id)
                                eq("status", "completed")
                            }
                            count(Count.EXACT)
                        }

                    _stats.value = HelperStats(
                        walletBalance = helper.wallet_balance ?: 0.0,
                        totalEarnings = helper.total_earnings ?: 0.0,
                        pendingCount = pending.countOrNull()?.toInt() ?: 0,
                        completedCount = completed.countOrNull()?.toInt() ?: 0,
                    )
                }
            } catch (_: Exception) {}
        }
    }

    fun loadOrders(status: String) {
        viewModelScope.launch {
            try {
                val userId = auth.currentSessionOrNull()?.user?.id ?: return@launch
                val helper = postgrest.from("topup_helpers")
                    .select(columns = io.github.jan.supabase.postgrest.query.Columns.list("id")) {
                        filter { eq("user_id", userId) }
                    }
                    .decodeSingleOrNull<Level5HelperIdResponse>() ?: return@launch

                val result = postgrest.from("helper_orders")
                    .select(columns = io.github.jan.supabase.postgrest.query.Columns.raw("*, profiles!helper_orders_user_id_fkey(display_name)")) {
                        filter {
                            eq("assigned_helper_id", helper.id)
                            eq("status", status)
                        }
                        order("created_at", Order.DESCENDING)
                        limit(50)
                    }
                    .decodeList<Level5OrderResponse>()

                _orders.value = result.map {
                    HelperOrder(
                        id = it.id,
                        userName = it.profiles?.display_name ?: "User",
                        amount = it.amount ?: 0.0,
                        status = it.status ?: "pending",
                        createdAt = it.created_at ?: "",
                        paymentMethod = it.payment_method,
                        screenshotUrl = it.payment_screenshot_url,
                    )
                }
            } catch (_: Exception) {
                _orders.value = emptyList()
            }
        }
    }

    fun loadWithdrawals() {
        viewModelScope.launch {
            try {
                val userId = auth.currentSessionOrNull()?.user?.id ?: return@launch
                val helper = postgrest.from("topup_helpers")
                    .select(columns = io.github.jan.supabase.postgrest.query.Columns.list("id")) {
                        filter { eq("user_id", userId) }
                    }
                    .decodeSingleOrNull<Level5HelperIdResponse>() ?: return@launch

                val result = postgrest.from("helper_withdrawals")
                    .select {
                        filter { eq("helper_id", helper.id) }
                        order("created_at", Order.DESCENDING)
                        limit(50)
                    }
                    .decodeList<Level5WithdrawalResponse>()

                _orders.value = result.map {
                    HelperOrder(
                        id = it.id,
                        userName = "Withdrawal",
                        amount = it.amount ?: 0.0,
                        status = it.status ?: "pending",
                        createdAt = it.created_at ?: "",
                        paymentMethod = it.payment_method,
                        screenshotUrl = null,
                    )
                }
            } catch (_: Exception) {
                _orders.value = emptyList()
            }
        }
    }

    fun processOrder(orderId: String) {
        viewModelScope.launch {
            try {
                val userId = auth.currentSessionOrNull()?.user?.id ?: return@launch
                val body = buildJsonObject {
                    put("order_id", orderId)
                    put("helper_user_id", userId)
                    put("action", "complete")
                }
                functions.invoke("process-helper-order", body)
                _message.value = "✅ Order processed!"
                loadStats()
                loadOrders("pending")
            } catch (e: Exception) {
                _message.value = "❌ ${e.message}"
            }
        }
    }
}

@Serializable
data class Level5HelperResponse(
    val id: String,
    val user_id: String? = null,
    val wallet_balance: Double? = null,
    val total_earnings: Double? = null,
    val helper_level: Int? = null,
)

@Serializable
data class Level5HelperIdResponse(val id: String)

@Serializable
data class Level5OrderResponse(
    val id: String,
    val amount: Double? = null,
    val status: String? = null,
    val created_at: String? = null,
    val payment_method: String? = null,
    val payment_screenshot_url: String? = null,
    val profiles: Level5OrderProfileRef? = null,
)

@Serializable
data class Level5OrderProfileRef(val display_name: String? = null)

@Serializable
data class Level5WithdrawalResponse(
    val id: String,
    val amount: Double? = null,
    val status: String? = null,
    val created_at: String? = null,
    val payment_method: String? = null,
)

class Level5OrderAdapter(
    private val items: List<HelperOrder>,
    private val onProcess: (HelperOrder) -> Unit,
) : RecyclerView.Adapter<Level5OrderAdapter.VH>() {
    inner class VH(itemView: View) : RecyclerView.ViewHolder(itemView)
    override fun onCreateViewHolder(parent: ViewGroup, viewType: Int): VH {
        val tv = android.widget.TextView(parent.context).apply {
            setPadding(32, 20, 32, 20)
            textSize = 14f
        }
        return VH(tv)
    }
    override fun onBindViewHolder(holder: VH, position: Int) {
        val o = items[position]
        val icon = when (o.status) { "completed" -> "✅"; "pending" -> "⏳"; else -> "📋" }
        (holder.itemView as android.widget.TextView).text =
            "$icon ${o.userName} — $${o.amount} [${o.status}]"
        holder.itemView.setOnClickListener { if (o.status == "pending") onProcess(o) }
    }
    override fun getItemCount() = items.size
}