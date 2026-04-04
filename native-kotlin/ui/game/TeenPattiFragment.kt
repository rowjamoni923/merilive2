package com.merilive.app.ui.game

import android.graphics.Color
import android.os.Bundle
import android.view.Gravity
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import android.widget.FrameLayout
import android.widget.LinearLayout
import android.widget.TextView
import android.widget.Toast
import androidx.fragment.app.Fragment
import androidx.fragment.app.activityViewModels
import androidx.lifecycle.lifecycleScope
import com.merilive.app.data.model.*
import dagger.hilt.android.AndroidEntryPoint
import kotlinx.coroutines.launch

@AndroidEntryPoint
class TeenPattiFragment : Fragment() {

    private val viewModel: GameViewModel by activityViewModels()
    private var roomId: String = ""

    private lateinit var playerCards: LinearLayout
    private lateinit var dealerCards: LinearLayout
    private lateinit var betDisplay: TextView
    private lateinit var dealButton: TextView
    private lateinit var chipSelector: LinearLayout
    private lateinit var resultOverlay: FrameLayout
    private lateinit var statusText: TextView

    companion object {
        fun newInstance(roomId: String): TeenPattiFragment {
            return TeenPattiFragment().apply {
                arguments = Bundle().apply { putString("roomId", roomId) }
            }
        }
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        roomId = arguments?.getString("roomId") ?: ""
    }

    override fun onCreateView(inflater: LayoutInflater, container: ViewGroup?, savedInstanceState: Bundle?): View {
        return buildUI()
    }

    override fun onViewCreated(view: View, savedInstanceState: Bundle?) {
        super.onViewCreated(view, savedInstanceState)
        setupChips()
        observeState()
    }

    private fun buildUI(): View {
        val root = LinearLayout(requireContext()).apply {
            orientation = LinearLayout.VERTICAL
            setBackgroundColor(Color.parseColor("#0D4F1C"))
            setPadding(24, 16, 24, 16)
            layoutParams = ViewGroup.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT)
        }

        // Title
        root.addView(TextView(requireContext()).apply {
            text = "🃏 Teen Patti"
            textSize = 22f
            setTextColor(Color.parseColor("#FFD700"))
            gravity = Gravity.CENTER
            setPadding(0, 8, 0, 16)
        })

        // Dealer Label
        root.addView(TextView(requireContext()).apply {
            text = "Dealer"
            textSize = 14f
            setTextColor(Color.parseColor("#AAAAAA"))
            gravity = Gravity.CENTER
        })

        // Dealer Cards
        dealerCards = LinearLayout(requireContext()).apply {
            orientation = LinearLayout.HORIZONTAL
            gravity = Gravity.CENTER
            setPadding(0, 8, 0, 16)
        }
        repeat(3) { addCardBack(dealerCards) }
        root.addView(dealerCards)

        // Status
        statusText = TextView(requireContext()).apply {
            text = "Place your bet!"
            textSize = 16f
            setTextColor(Color.WHITE)
            gravity = Gravity.CENTER
            setPadding(0, 16, 0, 16)
        }
        root.addView(statusText)

        // Player Label
        root.addView(TextView(requireContext()).apply {
            text = "Your Hand"
            textSize = 14f
            setTextColor(Color.parseColor("#AAAAAA"))
            gravity = Gravity.CENTER
        })

        // Player Cards
        playerCards = LinearLayout(requireContext()).apply {
            orientation = LinearLayout.HORIZONTAL
            gravity = Gravity.CENTER
            setPadding(0, 8, 0, 16)
        }
        repeat(3) { addCardBack(playerCards) }
        root.addView(playerCards)

        // Bet Display
        betDisplay = TextView(requireContext()).apply {
            text = "Bet: 1K"
            textSize = 18f
            setTextColor(Color.parseColor("#FFD700"))
            gravity = Gravity.CENTER
            setPadding(0, 16, 0, 8)
        }
        root.addView(betDisplay)

        // Chip Selector
        chipSelector = LinearLayout(requireContext()).apply {
            orientation = LinearLayout.HORIZONTAL
            gravity = Gravity.CENTER
            setPadding(0, 8, 0, 16)
        }
        root.addView(chipSelector)

        // Deal Button
        dealButton = TextView(requireContext()).apply {
            text = "DEAL!"
            textSize = 20f
            setTextColor(Color.BLACK)
            setBackgroundColor(Color.parseColor("#FFD700"))
            gravity = Gravity.CENTER
            setPadding(64, 16, 64, 16)
            setOnClickListener { viewModel.playTeenPatti(roomId) }
        }
        root.addView(dealButton, LinearLayout.LayoutParams(
            LinearLayout.LayoutParams.MATCH_PARENT,
            LinearLayout.LayoutParams.WRAP_CONTENT
        ))

        // Result overlay
        resultOverlay = FrameLayout(requireContext()).apply {
            visibility = View.GONE
            setBackgroundColor(Color.parseColor("#CC000000"))
        }

        val wrapper = FrameLayout(requireContext())
        wrapper.addView(root)
        wrapper.addView(resultOverlay, FrameLayout.LayoutParams(
            FrameLayout.LayoutParams.MATCH_PARENT, FrameLayout.LayoutParams.MATCH_PARENT
        ))
        return wrapper
    }

    private fun addCardBack(parent: LinearLayout) {
        parent.addView(TextView(requireContext()).apply {
            text = "🂠"
            textSize = 36f
            setTextColor(Color.WHITE)
            gravity = Gravity.CENTER
            setPadding(16, 8, 16, 8)
        })
    }

    private fun setupChips() {
        chipSelector.removeAllViews()
        CHIP_VALUES.forEach { value ->
            val chip = TextView(requireContext()).apply {
                text = formatChipValue(value)
                textSize = 14f
                setTextColor(Color.BLACK)
                setBackgroundColor(Color.parseColor("#FFD700"))
                gravity = Gravity.CENTER
                setPadding(20, 10, 20, 10)
                setOnClickListener {
                    viewModel.setTeenPattiBet(value)
                    betDisplay.text = "Bet: ${formatChipValue(value)}"
                }
            }
            chipSelector.addView(chip, LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.WRAP_CONTENT,
                LinearLayout.LayoutParams.WRAP_CONTENT
            ).apply { setMargins(4, 0, 4, 0) })
        }
    }

    private fun observeState() {
        viewLifecycleOwner.lifecycleScope.launch {
            viewModel.teenPattiState.collect { state ->
                when (state) {
                    is TeenPattiState.Idle -> {
                        dealButton.isEnabled = true
                        dealButton.text = "DEAL!"
                        statusText.text = "Place your bet!"
                        resultOverlay.visibility = View.GONE
                        resetCards()
                    }
                    is TeenPattiState.Dealing -> {
                        dealButton.isEnabled = false
                        dealButton.text = "Dealing..."
                        statusText.text = "Dealing cards..."
                    }
                    is TeenPattiState.Result -> {
                        showCards(state.playerHand, state.dealerHand, state.payout)
                    }
                    is TeenPattiState.Error -> {
                        Toast.makeText(requireContext(), state.message, Toast.LENGTH_SHORT).show()
                    }
                }
            }
        }
    }

    private fun resetCards() {
        playerCards.removeAllViews()
        dealerCards.removeAllViews()
        repeat(3) { addCardBack(playerCards) }
        repeat(3) { addCardBack(dealerCards) }
    }

    private fun showCards(player: TeenPattiHand, dealer: TeenPattiHand, payout: Long) {
        playerCards.removeAllViews()
        dealerCards.removeAllViews()

        player.cards.forEach { card ->
            playerCards.addView(createCardView(card, player.is_winner))
        }
        dealer.cards.forEach { card ->
            dealerCards.addView(createCardView(card, dealer.is_winner))
        }

        statusText.text = if (payout > 0)
            "🎉 You Won ${formatChipValue(payout)}! (${player.hand_rank})"
        else
            "Dealer wins with ${dealer.hand_rank}"
        statusText.setTextColor(if (payout > 0) Color.parseColor("#FFD700") else Color.parseColor("#FF5555"))
    }

    private fun createCardView(card: PlayingCard, isWinner: Boolean): TextView {
        return TextView(requireContext()).apply {
            text = card.displayName
            textSize = 28f
            setTextColor(if (card.suit == "hearts" || card.suit == "diamonds") Color.RED else Color.BLACK)
            setBackgroundColor(Color.WHITE)
            gravity = Gravity.CENTER
            setPadding(16, 12, 16, 12)
            val lp = LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.WRAP_CONTENT,
                LinearLayout.LayoutParams.WRAP_CONTENT
            ).apply { setMargins(4, 0, 4, 0) }
            layoutParams = lp
        }
    }
}
