package com.merilive.app.ui.parcels

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
import com.merilive.app.databinding.FragmentParcelsBinding
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
class ParcelsFragment : Fragment() {

    private var _binding: FragmentParcelsBinding? = null
    private val binding get() = _binding!!
    private val viewModel: ParcelsViewModel by viewModels()

    override fun onCreateView(
        inflater: LayoutInflater, container: ViewGroup?, savedInstanceState: Bundle?
    ): View {
        _binding = FragmentParcelsBinding.inflate(inflater, container, false)
        return binding.root
    }

    override fun onViewCreated(view: View, savedInstanceState: Bundle?) {
        super.onViewCreated(view, savedInstanceState)

        binding.btnBack.setOnClickListener { findNavController().navigateUp() }
        binding.rvParcels.layoutManager = LinearLayoutManager(requireContext())

        viewLifecycleOwner.lifecycleScope.launchWhenStarted {
            viewModel.parcels.collect { parcels ->
                binding.tvEmpty.visibility = if (parcels.isEmpty()) View.VISIBLE else View.GONE
                binding.rvParcels.adapter = ParcelAdapter(parcels) { parcel ->
                    viewModel.claimParcel(parcel.id)
                }
            }
        }

        viewLifecycleOwner.lifecycleScope.launchWhenStarted {
            viewModel.claimResult.collect { msg ->
                if (msg.isNotEmpty()) {
                    Toast.makeText(requireContext(), msg, Toast.LENGTH_SHORT).show()
                    viewModel.loadParcels()
                }
            }
        }

        viewModel.loadParcels()
    }

    override fun onDestroyView() {
        super.onDestroyView()
        _binding = null
    }
}

@HiltViewModel
class ParcelsViewModel @Inject constructor(
    private val auth: Auth,
    private val postgrest: Postgrest,
    private val functions: Functions,
) : ViewModel() {

    private val _parcels = MutableStateFlow<List<ParcelItem>>(emptyList())
    val parcels = _parcels.asStateFlow()

    private val _claimResult = MutableStateFlow("")
    val claimResult = _claimResult.asStateFlow()

    fun loadParcels() {
        viewModelScope.launch {
            try {
                val userId = auth.currentSessionOrNull()?.user?.id ?: return@launch
                val result = postgrest.from("user_parcels")
                    .select(columns = io.github.jan.supabase.postgrest.query.Columns.raw("*, parcel_templates(*)")) {
                        filter {
                            eq("user_id", userId)
                            eq("status", "available")
                        }
                    }
                    .decodeList<ParcelResponse>()

                _parcels.value = result.map {
                    ParcelItem(
                        id = it.id,
                        templateName = it.parcel_templates?.name ?: "Gift Parcel",
                        templateIcon = it.parcel_templates?.icon_url,
                        parcelType = it.parcel_templates?.parcel_type ?: "standard",
                        rewardDiamonds = it.parcel_templates?.reward_diamonds ?: 0,
                        rewardBeans = it.parcel_templates?.reward_beans ?: 0,
                        expiresAt = it.expires_at,
                    )
                }
            } catch (e: Exception) {
                _parcels.value = emptyList()
            }
        }
    }

    fun claimParcel(parcelId: String) {
        viewModelScope.launch {
            try {
                val userId = auth.currentSessionOrNull()?.user?.id ?: return@launch
                val body = buildJsonObject {
                    put("parcel_id", parcelId)
                    put("user_id", userId)
                }
                functions.invoke("claim-parcel", body)
                _claimResult.value = "🎉 Parcel claimed!"
            } catch (e: Exception) {
                _claimResult.value = "❌ ${e.message}"
            }
        }
    }
}

data class ParcelItem(
    val id: String,
    val templateName: String,
    val templateIcon: String?,
    val parcelType: String,
    val rewardDiamonds: Int,
    val rewardBeans: Int,
    val expiresAt: String?,
)

@Serializable
data class ParcelResponse(
    val id: String,
    val user_id: String,
    val status: String? = null,
    val expires_at: String? = null,
    val parcel_templates: ParcelTemplateResponse? = null,
)

@Serializable
data class ParcelTemplateResponse(
    val id: String? = null,
    val name: String? = null,
    val icon_url: String? = null,
    val parcel_type: String? = null,
    val reward_diamonds: Int? = null,
    val reward_beans: Int? = null,
)

// Simple adapter
class ParcelAdapter(
    private val items: List<ParcelItem>,
    private val onClaim: (ParcelItem) -> Unit,
) : RecyclerView.Adapter<ParcelAdapter.VH>() {

    inner class VH(itemView: View) : RecyclerView.ViewHolder(itemView)

    override fun onCreateViewHolder(parent: ViewGroup, viewType: Int): VH {
        val tv = android.widget.TextView(parent.context).apply {
            setPadding(32, 24, 32, 24)
            textSize = 15f
        }
        return VH(tv)
    }

    override fun onBindViewHolder(holder: VH, position: Int) {
        val item = items[position]
        (holder.itemView as android.widget.TextView).text =
            "🎁 ${item.templateName} — 💎${item.rewardDiamonds} 🫘${item.rewardBeans}"
        holder.itemView.setOnClickListener { onClaim(item) }
    }

    override fun getItemCount() = items.size
}
