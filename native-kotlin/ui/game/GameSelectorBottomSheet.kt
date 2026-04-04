package com.merilive.app.ui.game

import android.os.Bundle
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import android.widget.ImageView
import android.widget.LinearLayout
import android.widget.TextView
import androidx.fragment.app.activityViewModels
import androidx.lifecycle.lifecycleScope
import com.google.android.material.bottomsheet.BottomSheetDialogFragment
import com.merilive.app.R
import com.merilive.app.data.model.GameConfig
import dagger.hilt.android.AndroidEntryPoint
import kotlinx.coroutines.flow.collectLatest
import kotlinx.coroutines.launch

@AndroidEntryPoint
class GameSelectorBottomSheet : BottomSheetDialogFragment() {

    private val gameViewModel: GameViewModel by activityViewModels()
    private var onGameSelected: ((GameConfig) -> Unit)? = null
    private var contextType: String = "party_room" // or "live_stream"

    companion object {
        fun newInstance(context: String, onSelect: (GameConfig) -> Unit): GameSelectorBottomSheet {
            return GameSelectorBottomSheet().apply {
                contextType = context
                onGameSelected = onSelect
            }
        }
    }

    override fun onCreateView(inflater: LayoutInflater, container: ViewGroup?, savedInstanceState: Bundle?): View {
        return inflater.inflate(R.layout.bottom_sheet_game_selector, container, false)
    }

    override fun onViewCreated(view: View, savedInstanceState: Bundle?) {
        super.onViewCreated(view, savedInstanceState)

        val gamesContainer = view.findViewById<LinearLayout>(R.id.gamesContainer)
        val titleText = view.findViewById<TextView>(R.id.tvTitle)
        titleText.text = "🎮 Select Game"

        // Reload configs from server
        gameViewModel.loadGameConfigs()

        viewLifecycleOwner.lifecycleScope.launch {
            gameViewModel.gameConfigs.collectLatest { configs ->
                gamesContainer.removeAllViews()
                val filteredGames = configs.filter { it.available_in.contains(contextType) && it.is_active }

                if (filteredGames.isEmpty()) {
                    val emptyText = TextView(requireContext()).apply {
                        text = "No games available"
                        textSize = 16f
                        setPadding(32, 48, 32, 48)
                    }
                    gamesContainer.addView(emptyText)
                    return@collectLatest
                }

                filteredGames.forEach { game ->
                    val itemView = inflater.inflate(R.layout.item_game_selector, gamesContainer, false)

                    itemView.findViewById<TextView>(R.id.tvGameName).text = game.game_name
                    itemView.findViewById<TextView>(R.id.tvGameType).text = game.game_type.uppercase()
                    itemView.findViewById<TextView>(R.id.tvBetRange).text =
                        "Min: ${formatBet(game.min_bet)} | Max: ${formatBet(game.max_bet)}"

                    // Premium badge
                    val premiumBadge = itemView.findViewById<TextView>(R.id.tvPremiumBadge)
                    premiumBadge.visibility = if (game.is_premium) View.VISIBLE else View.GONE

                    itemView.setOnClickListener {
                        onGameSelected?.invoke(game)
                        dismiss()
                    }

                    gamesContainer.addView(itemView)
                }
            }
        }
    }

    private fun formatBet(value: Long): String = when {
        value >= 1_000_000 -> "${value / 1_000_000}M"
        value >= 1_000 -> "${value / 1_000}K"
        else -> "$value"
    }

    private val inflater get() = LayoutInflater.from(requireContext())
}