package com.merilive.app.ui.leaderboard

import android.os.Bundle
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import androidx.fragment.app.Fragment
import androidx.fragment.app.viewModels
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import androidx.lifecycle.lifecycleScope
import androidx.navigation.fragment.findNavController
import androidx.recyclerview.widget.LinearLayoutManager
import androidx.recyclerview.widget.RecyclerView
import com.merilive.app.databinding.FragmentPkLeaderboardBinding
import dagger.hilt.android.AndroidEntryPoint
import dagger.hilt.android.lifecycle.HiltViewModel
import io.github.jan.supabase.postgrest.Postgrest
import io.github.jan.supabase.postgrest.query.Order
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import kotlinx.serialization.Serializable
import javax.inject.Inject

@AndroidEntryPoint
class PKLeaderboardFragment : Fragment() {

    private var _binding: FragmentPkLeaderboardBinding? = null
    private val binding get() = _binding!!
    private val viewModel: PKLeaderboardViewModel by viewModels()

    override fun onCreateView(
        inflater: LayoutInflater, container: ViewGroup?, savedInstanceState: Bundle?
    ): View {
        _binding = FragmentPkLeaderboardBinding.inflate(inflater, container, false)
        return binding.root
    }

    override fun onViewCreated(view: View, savedInstanceState: Bundle?) {
        super.onViewCreated(view, savedInstanceState)

        val competitionId = arguments?.getString("competitionId") ?: ""

        binding.btnBack.setOnClickListener { findNavController().navigateUp() }
        binding.rvParticipants.layoutManager = LinearLayoutManager(requireContext())

        viewLifecycleOwner.lifecycleScope.launchWhenStarted {
            viewModel.competition.collect { comp ->
                if (comp != null) {
                    binding.tvTitle.text = comp.title
                    binding.tvStatus.text = comp.status.uppercase()
                }
            }
        }

        viewLifecycleOwner.lifecycleScope.launchWhenStarted {
            viewModel.participants.collect { list ->
                binding.rvParticipants.adapter = PKParticipantAdapter(list)
            }
        }

        viewModel.loadCompetition(competitionId)
    }

    override fun onDestroyView() {
        super.onDestroyView()
        _binding = null
    }
}

@HiltViewModel
class PKLeaderboardViewModel @Inject constructor(
    private val postgrest: Postgrest,
) : ViewModel() {

    private val _competition = MutableStateFlow<PKCompetition?>(null)
    val competition = _competition.asStateFlow()

    private val _participants = MutableStateFlow<List<PKParticipant>>(emptyList())
    val participants = _participants.asStateFlow()

    fun loadCompetition(id: String) {
        viewModelScope.launch {
            try {
                val comp = postgrest.from("pk_competitions")
                    .select {
                        filter { eq("id", id) }
                    }
                    .decodeSingleOrNull<PKCompetitionResponse>()

                if (comp != null) {
                    _competition.value = PKCompetition(
                        id = comp.id,
                        title = comp.title ?: "PK Battle",
                        status = comp.status ?: "active",
                        bannerUrl = comp.banner_image_url,
                    )
                }

                val parts = postgrest.from("pk_participants")
                    .select(columns = io.github.jan.supabase.postgrest.query.Columns.raw("*, profiles(display_name, avatar_url, app_uid)")) {
                        filter { eq("competition_id", id) }
                        order("score", Order.DESCENDING)
                    }
                    .decodeList<PKParticipantResponse>()

                _participants.value = parts.mapIndexed { idx, p ->
                    PKParticipant(
                        rank = idx + 1,
                        userId = p.user_id,
                        displayName = p.profiles?.display_name ?: "User",
                        avatarUrl = p.profiles?.avatar_url,
                        score = p.score ?: 0,
                    )
                }
            } catch (_: Exception) {}
        }
    }
}

data class PKCompetition(val id: String, val title: String, val status: String, val bannerUrl: String?)
data class PKParticipant(val rank: Int, val userId: String, val displayName: String, val avatarUrl: String?, val score: Int)

@Serializable
data class PKCompetitionResponse(
    val id: String,
    val title: String? = null,
    val status: String? = null,
    val banner_image_url: String? = null,
)

@Serializable
data class PKParticipantResponse(
    val id: String,
    val user_id: String,
    val competition_id: String,
    val score: Int? = null,
    val profiles: PKProfileRef? = null,
)

@Serializable
data class PKProfileRef(
    val display_name: String? = null,
    val avatar_url: String? = null,
    val app_uid: String? = null,
)

class PKParticipantAdapter(
    private val items: List<PKParticipant>,
) : RecyclerView.Adapter<PKParticipantAdapter.VH>() {
    inner class VH(itemView: View) : RecyclerView.ViewHolder(itemView)
    override fun onCreateViewHolder(parent: ViewGroup, viewType: Int): VH {
        val tv = android.widget.TextView(parent.context).apply {
            setPadding(32, 20, 32, 20)
            textSize = 14f
        }
        return VH(tv)
    }
    override fun onBindViewHolder(holder: VH, position: Int) {
        val p = items[position]
        val medal = when (p.rank) { 1 -> "🥇"; 2 -> "🥈"; 3 -> "🥉"; else -> "#${p.rank}" }
        (holder.itemView as android.widget.TextView).text = "$medal ${p.displayName} — Score: ${p.score}"
    }
    override fun getItemCount() = items.size
}