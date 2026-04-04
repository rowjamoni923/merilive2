package com.merilive.app.ui.recharge

import android.os.Bundle
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import android.widget.Toast
import androidx.fragment.app.Fragment
import androidx.fragment.app.viewModels
import androidx.lifecycle.lifecycleScope
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import androidx.navigation.fragment.findNavController
import androidx.recyclerview.widget.GridLayoutManager
import com.android.billingclient.api.*
import com.merilive.app.databinding.FragmentRechargeBinding
import dagger.hilt.android.AndroidEntryPoint
import dagger.hilt.android.lifecycle.HiltViewModel
import io.github.jan.supabase.auth.Auth
import io.github.jan.supabase.functions.Functions
import io.github.jan.supabase.postgrest.Postgrest
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.put
import javax.inject.Inject

@AndroidEntryPoint
class RechargeFragment : Fragment(), PurchasesUpdatedListener {

    private var _binding: FragmentRechargeBinding? = null
    private val binding get() = _binding!!
    private val viewModel: RechargeViewModel by viewModels()

    private lateinit var billingClient: BillingClient
    private var currentProductId: String? = null

    override fun onCreateView(
        inflater: LayoutInflater, container: ViewGroup?, savedInstanceState: Bundle?
    ): View {
        _binding = FragmentRechargeBinding.inflate(inflater, container, false)
        return binding.root
    }

    override fun onViewCreated(view: View, savedInstanceState: Bundle?) {
        super.onViewCreated(view, savedInstanceState)

        binding.btnBack.setOnClickListener { findNavController().navigateUp() }

        // Initialize Google Play Billing
        billingClient = BillingClient.newBuilder(requireContext())
            .setListener(this)
            .enablePendingPurchases()
            .build()

        billingClient.startConnection(object : BillingClientStateListener {
            override fun onBillingSetupFinished(result: BillingResult) {
                if (result.responseCode == BillingClient.BillingResponseCode.OK) {
                    viewModel.loadPackages()
                }
            }
            override fun onBillingServiceDisconnected() {}
        })

        binding.rvPackages.layoutManager = GridLayoutManager(requireContext(), 3)
        observeState()
    }

    private fun observeState() {
        viewLifecycleOwner.lifecycleScope.launchWhenStarted {
            viewModel.packages.collect { packages ->
                binding.rvPackages.adapter = DiamondPackageAdapter(packages) { pkg ->
                    launchPurchase(pkg)
                }
            }
        }

        viewLifecycleOwner.lifecycleScope.launchWhenStarted {
            viewModel.purchaseResult.collect { result ->
                when (result) {
                    is PurchaseResult.Success -> {
                        Toast.makeText(requireContext(),
                            "✅ ${result.diamonds} diamonds added!", Toast.LENGTH_LONG).show()
                    }
                    is PurchaseResult.Error -> {
                        Toast.makeText(requireContext(),
                            "❌ ${result.message}", Toast.LENGTH_LONG).show()
                    }
                    else -> {}
                }
            }
        }
    }

    private fun launchPurchase(pkg: DiamondPackage) {
        currentProductId = pkg.playStoreProductId

        val productList = listOf(
            QueryProductDetailsParams.Product.newBuilder()
                .setProductId(pkg.playStoreProductId)
                .setProductType(BillingClient.ProductType.INAPP)
                .build()
        )

        val params = QueryProductDetailsParams.newBuilder()
            .setProductList(productList)
            .build()

        billingClient.queryProductDetailsAsync(params) { billingResult, productDetails ->
            if (billingResult.responseCode == BillingClient.BillingResponseCode.OK && productDetails.isNotEmpty()) {
                val flowParams = BillingFlowParams.newBuilder()
                    .setProductDetailsParamsList(listOf(
                        BillingFlowParams.ProductDetailsParams.newBuilder()
                            .setProductDetails(productDetails[0])
                            .build()
                    ))
                    .build()

                billingClient.launchBillingFlow(requireActivity(), flowParams)
            }
        }
    }

    override fun onPurchasesUpdated(result: BillingResult, purchases: MutableList<Purchase>?) {
        if (result.responseCode == BillingClient.BillingResponseCode.OK && purchases != null) {
            for (purchase in purchases) {
                if (purchase.purchaseState == Purchase.PurchaseState.PURCHASED) {
                    // Verify on server
                    viewModel.verifyPurchase(
                        purchaseToken = purchase.purchaseToken,
                        productId = currentProductId ?: "",
                        orderId = purchase.orderId ?: "",
                    )

                    // Acknowledge
                    val ackParams = AcknowledgePurchaseParams.newBuilder()
                        .setPurchaseToken(purchase.purchaseToken)
                        .build()
                    billingClient.acknowledgePurchase(ackParams) {}
                }
            }
        }
    }

    override fun onDestroyView() {
        super.onDestroyView()
        billingClient.endConnection()
        _binding = null
    }
}

sealed class PurchaseResult {
    object Idle : PurchaseResult()
    data class Success(val diamonds: Int) : PurchaseResult()
    data class Error(val message: String) : PurchaseResult()
}

@HiltViewModel
class RechargeViewModel @Inject constructor(
    private val auth: Auth,
    private val postgrest: Postgrest,
    private val functions: Functions,
) : ViewModel() {

    private val _packages = MutableStateFlow<List<DiamondPackage>>(emptyList())
    val packages = _packages.asStateFlow()

    private val _purchaseResult = MutableStateFlow<PurchaseResult>(PurchaseResult.Idle)
    val purchaseResult = _purchaseResult.asStateFlow()

    fun loadPackages() {
        viewModelScope.launch {
            try {
                val result = postgrest.from("diamond_packages")
                    .select {
                        filter { eq("is_active", true) }
                        order("display_order", io.github.jan.supabase.postgrest.query.Order.ASCENDING)
                    }
                    .decodeList<DiamondPackageResponse>()

                _packages.value = result.map {
                    DiamondPackage(
                        id = it.id,
                        diamonds = it.diamonds,
                        bonusDiamonds = it.bonus_diamonds ?: 0,
                        priceDisplay = it.price_display ?: "$${it.price_usd}",
                        playStoreProductId = it.play_store_product_id ?: "diamonds_${it.diamonds}",
                        isPopular = it.is_popular ?: false,
                        discount = it.discount,
                    )
                }
            } catch (e: Exception) {
                _packages.value = emptyList()
            }
        }
    }

    fun verifyPurchase(purchaseToken: String, productId: String, orderId: String) {
        viewModelScope.launch {
            try {
                val userId = auth.currentSessionOrNull()?.user?.id ?: return@launch

                val body = buildJsonObject {
                    put("purchase_token", purchaseToken)
                    put("product_id", productId)
                    put("order_id", orderId)
                    put("user_id", userId)
                    put("platform", "android")
                }

                val response = functions.invoke("verify-google-purchase", body)
                val result = response.body.toString()

                if (result.contains("success")) {
                    val pkg = _packages.value.find { it.playStoreProductId == productId }
                    _purchaseResult.value = PurchaseResult.Success(
                        diamonds = (pkg?.diamonds ?: 0) + (pkg?.bonusDiamonds ?: 0)
                    )
                } else {
                    _purchaseResult.value = PurchaseResult.Error("Verification failed")
                }
            } catch (e: Exception) {
                _purchaseResult.value = PurchaseResult.Error(e.message ?: "Unknown error")
            }
        }
    }
}

data class DiamondPackage(
    val id: String,
    val diamonds: Int,
    val bonusDiamonds: Int,
    val priceDisplay: String,
    val playStoreProductId: String,
    val isPopular: Boolean,
    val discount: Int?,
)

@Serializable
data class DiamondPackageResponse(
    val id: String,
    val diamonds: Int,
    val bonus_diamonds: Int? = null,
    val price_usd: Double? = null,
    val price_display: String? = null,
    val play_store_product_id: String? = null,
    val is_popular: Boolean? = null,
    val discount: Int? = null,
)
