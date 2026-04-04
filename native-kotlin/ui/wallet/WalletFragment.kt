package com.merilive.app.ui.wallet

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
import com.merilive.app.databinding.FragmentWalletBinding
import dagger.hilt.android.AndroidEntryPoint
import dagger.hilt.android.lifecycle.HiltViewModel
import io.github.jan.supabase.auth.Auth
import io.github.jan.supabase.postgrest.Postgrest
import io.github.jan.supabase.postgrest.query.Columns
import io.github.jan.supabase.postgrest.query.Order
import io.github.jan.supabase.functions.Functions
import kotlinx.coroutines.async
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import kotlinx.serialization.Serializable
import javax.inject.Inject

@AndroidEntryPoint
class WalletFragment : Fragment() {

    private var _binding: FragmentWalletBinding? = null
    private val binding get() = _binding!!
    private val viewModel: WalletFragmentViewModel by viewModels()

    override fun onCreateView(
        inflater: LayoutInflater, container: ViewGroup?, savedInstanceState: Bundle?
    ): View {
        _binding = FragmentWalletBinding.inflate(inflater, container, false)
        return binding.root
    }

    override fun onViewCreated(view: View, savedInstanceState: Bundle?) {
        super.onViewCreated(view, savedInstanceState)

        binding.btnBack.setOnClickListener { findNavController().navigateUp() }
        binding.btnRecharge.setOnClickListener {
            findNavController().navigate(R.id.action_wallet_to_recharge)
        }
        binding.btnExchangeBeans.setOnClickListener {
            viewModel.exchangeBeansToDiamonds()
        }

        binding.rvTransactions.layoutManager = LinearLayoutManager(requireContext())

        viewModel.loadWallet()
        observeState()
    }

    private fun observeState() {
        viewLifecycleOwner.lifecycleScope.launchWhenStarted {
            viewModel.walletState.collect { state ->
                when (state) {
                    is WalletState.Loading -> {
                        // Show loading
                    }
                    is WalletState.Success -> {
                        binding.tvDiamonds.text = formatBalance(state.diamonds)
                        binding.tvBeans.text = formatBalance(state.beans)
                        binding.tvTraderDiamonds.text = formatBalance(state.traderDiamonds)
                        binding.rvTransactions.adapter = WalletTransactionAdapter(state.transactions)

                        // Show exchange section only for users with beans
                        binding.exchangeSection.visibility =
                            if (state.beans > 0) View.VISIBLE else View.GONE
                    }
                    is WalletState.ExchangeSuccess -> {
                        Toast.makeText(
                            requireContext(),
                            "Exchanged ${state.beansUsed} beans → ${state.diamondsReceived} diamonds!",
                            Toast.LENGTH_SHORT
                        ).show()
                        viewModel.loadWallet()
                    }
                    is WalletState.Error -> {
                        Toast.makeText(requireContext(), state.message, Toast.LENGTH_SHORT).show()
                    }
                }
            }
        }
    }

    private fun formatBalance(amount: Int): String = when {
        amount >= 1_000_000 -> String.format("%.1fM", amount / 1_000_000.0)
        amount >= 1_000 -> String.format("%.1fK", amount / 1_000.0)
        else -> amount.toString()
    }

    override fun onDestroyView() {
        super.onDestroyView()
        _binding = null
    }
}

// ====== Transaction Adapter ======
class WalletTransactionAdapter(
    private val transactions: List<TransactionItem>,
) : RecyclerView.Adapter<WalletTransactionAdapter.VH>() {

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
        val tx = transactions[position]
        val emoji = when (tx.type) {
            "gift_received" -> "🎁"
            "gift_sent" -> "🎁"
            "recharge" -> "💰"
            "exchange" -> "🔄"
            "call_earning" -> "📞"
            "withdrawal" -> "💸"
            else -> "💎"
        }
        holder.tvType.text = "$emoji ${tx.description.ifEmpty { tx.type }}"
        holder.tvAmount.text = if (tx.amount >= 0) "+${tx.amount}" else "${tx.amount}"
        holder.tvAmount.setTextColor(holder.itemView.resources.getColor(
            if (tx.amount >= 0) R.color.success else R.color.error, null))
        holder.tvDate.text = tx.createdAt.take(10)
    }

    override fun getItemCount() = transactions.size
}

// ====== States ======
sealed class WalletState {
    object Loading : WalletState()
    data class Success(
        val diamonds: Int,
        val beans: Int,
        val traderDiamonds: Int,
        val transactions: List<TransactionItem>,
    ) : WalletState()
    data class ExchangeSuccess(val beansUsed: Int, val diamondsReceived: Int) : WalletState()
    data class Error(val message: String) : WalletState()
}

@HiltViewModel
class WalletFragmentViewModel @Inject constructor(
    private val auth: Auth,
    private val postgrest: Postgrest,
    private val functions: Functions,
) : ViewModel() {

    private val _walletState = MutableStateFlow<WalletState>(WalletState.Loading)
    val walletState = _walletState.asStateFlow()

    fun loadWallet() {
        viewModelScope.launch {
            _walletState.value = WalletState.Loading
            try {
                val userId = auth.currentSessionOrNull()?.user?.id
                    ?: throw Exception("Not authenticated")

                val balanceDeferred = async {
                    postgrest.from("profiles")
                        .select(Columns.raw("coins, beans, diamonds")) {
                            filter { eq("id", userId) }
                        }
                        .decodeSingle<BalanceResponse>()
                }

                val txDeferred = async {
                    postgrest.from("diamond_transactions")
                        .select {
                            filter { eq("user_id", userId) }
                            order("created_at", Order.DESCENDING)
                            limit(50)
                        }
                        .decodeList<TransactionResponse>()
                }

                val balance = balanceDeferred.await()
                val transactions = txDeferred.await()

                _walletState.value = WalletState.Success(
                    diamonds = balance.coins ?: 0,
                    beans = balance.beans ?: 0,
                    traderDiamonds = balance.diamonds ?: 0,
                    transactions = transactions.map {
                        TransactionItem(
                            id = it.id,
                            type = it.transaction_type ?: "",
                            amount = it.amount ?: 0,
                            description = it.description ?: "",
                            createdAt = it.created_at ?: "",
                        )
                    }
                )
            } catch (e: Exception) {
                _walletState.value = WalletState.Error(e.message ?: "Failed")
            }
        }
    }

    fun exchangeBeansToDiamonds() {
        viewModelScope.launch {
            try {
                val userId = auth.currentSessionOrNull()?.user?.id ?: return@launch
                postgrest.rpc("exchange_user_beans_to_diamonds", mapOf("p_user_id" to userId))
                loadWallet()
            } catch (e: Exception) {
                _walletState.value = WalletState.Error(e.message ?: "Exchange failed")
            }
        }
    }
}

@Serializable
data class BalanceResponse(
    val coins: Int? = null,
    val beans: Int? = null,
    val diamonds: Int? = null,
)

@Serializable
data class TransactionResponse(
    val id: String,
    val transaction_type: String? = null,
    val amount: Int? = null,
    val description: String? = null,
    val created_at: String? = null,
)

data class TransactionItem(
    val id: String,
    val type: String,
    val amount: Int,
    val description: String,
    val createdAt: String,
)
