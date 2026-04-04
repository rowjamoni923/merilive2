package com.merilive.app.ui.game

import android.animation.ObjectAnimator
import android.graphics.Color
import android.os.Bundle
import android.view.Gravity
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import android.view.animation.DecelerateInterpolator
import android.widget.FrameLayout
import android.widget.GridLayout
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
class RouletteFragment : Fragment() {

    private val viewModel: GameViewModel by activityViewModels()
    private var roomId: String = ""

    private lateinit var wheelView: FrameLayout
    private lateinit var numberGrid: GridLayout
    private lateinit var colorBets: LinearLayout
    private lateinit var chipSelector: LinearLayout
    private lateinit var spinButton: TextView
    private lateinit var clearButton: TextView
    private lateinit var totalBetText: TextView
    private lateinit var resultOverlay: FrameLayout

    companion object {
        private val RED_NUMBERS = setOf(1,3,5,7,9,12,14,16,18,19,21,23,25,27,30,32,34,36)

        fun newInstance(roomId: String): RouletteFragment {
            return RouletteFragment().apply {
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
        setupNumberGrid()
        setupColorBets()
        setupChipSelector()
        setupButtons()
        observeState()
    }

    private fun buildUI(): View {
        val root = LinearLayout(requireContext()).apply {
            orientation = LinearLayout.VERTICAL
            setBackgroundColor(Color.parseColor("#1B3A2D"))
            setPadding(16, 12, 16, 12)
            layoutParams = ViewGroup.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT)
        }

        // Title
        root.addView(TextView(requireContext()).apply {
            text = "🎰 Roulette"
            textSize = 22f
            setTextColor(Color.parseColor("#FFD700"))
            gravity = Gravity.CENTER
            setPadding(0, 4, 0, 12)
        })

        // Wheel
        wheelView = FrameLayout(requireContext()).apply {
            layoutParams = LinearLayout.LayoutParams(200, 200).apply {
                gravity = Gravity.CENTER_HORIZONTAL
            }
            setBackgroundColor(Color.parseColor("#2D5A3D"))
        }
        wheelView.addView(TextView(requireContext()).apply {
            text = "🎡"
            textSize = 64f
            gravity = Gravity.CENTER
            layoutParams = FrameLayout.LayoutParams(
                FrameLayout.LayoutParams.MATCH_PARENT,
                FrameLayout.LayoutParams.MATCH_PARENT
            )
        })
        root.addView(wheelView)

        // Total Bet
        totalBetText = TextView(requireContext()).apply {
            text = "Total Bet: 0"
            textSize = 14f
            setTextColor(Color.WHITE)
            gravity = Gravity.CENTER
            setPadding(0, 8, 0, 4)
        }
        root.addView(totalBetText)

        // Number Grid
        numberGrid = GridLayout(requireContext()).apply {
            columnCount = 6
            layoutParams = LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT)
        }
        root.addView(numberGrid)

        // Color Bets (Red/Black/Green)
        colorBets = LinearLayout(requireContext()).apply {
            orientation = LinearLayout.HORIZONTAL
            gravity = Gravity.CENTER
            setPadding(0, 8, 0, 8)
        }
        root.addView(colorBets)

        // Chip Selector
        chipSelector = LinearLayout(requireContext()).apply {
            orientation = LinearLayout.HORIZONTAL
            gravity = Gravity.CENTER
            setPadding(0, 4, 0, 8)
        }
        root.addView(chipSelector)

        // Buttons
        val buttonRow = LinearLayout(requireContext()).apply {
            orientation = LinearLayout.HORIZONTAL
            gravity = Gravity.CENTER
        }
        clearButton = TextView(requireContext()).apply {
            text = "Clear"
            textSize = 16f
            setTextColor(Color.WHITE)
            setBackgroundColor(Color.parseColor("#666666"))
            gravity = Gravity.CENTER
            setPadding(48, 14, 48, 14)
        }
        spinButton = TextView(requireContext()).apply {
            text = "SPIN!"
            textSize = 18f
            setTextColor(Color.BLACK)
            setBackgroundColor(Color.parseColor("#FFD700"))
            gravity = Gravity.CENTER
            setPadding(64, 14, 64, 14)
        }
        buttonRow.addView(clearButton, LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f).apply { setMargins(0, 0, 8, 0) })
        buttonRow.addView(spinButton, LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f).apply { setMargins(8, 0, 0, 0) })
        root.addView(buttonRow)

        // Result Overlay
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

    private fun setupNumberGrid() {
        numberGrid.removeAllViews()

        // 0 (green)
        addNumberCell(0, Color.parseColor("#006600"))

        // 1-36
        for (n in 1..36) {
            val color = if (n in RED_NUMBERS) Color.parseColor("#CC0000") else Color.parseColor("#222222")
            addNumberCell(n, color)
        }
    }

    private fun addNumberCell(number: Int, bgColor: Int) {
        val cell = TextView(requireContext()).apply {
            text = "$number"
            textSize = 13f
            setTextColor(Color.WHITE)
            setBackgroundColor(bgColor)
            gravity = Gravity.CENTER
            setPadding(8, 8, 8, 8)
            setOnClickListener { viewModel.placeRouletteBet("n_$number") }
        }
        val params = GridLayout.LayoutParams().apply {
            width = 0
            height = GridLayout.LayoutParams.WRAP_CONTENT
            columnSpec = GridLayout.spec(GridLayout.UNDEFINED, 1f)
            setMargins(2, 2, 2, 2)
        }
        numberGrid.addView(cell, params)
    }

    private fun setupColorBets() {
        colorBets.removeAllViews()

        listOf(
            Triple("🔴 Red", Color.parseColor("#CC0000"), "red"),
            Triple("⚫ Black", Color.parseColor("#222222"), "black"),
            Triple("🟢 Green", Color.parseColor("#006600"), "green"),
        ).forEach { (label, color, key) ->
            val btn = TextView(requireContext()).apply {
                text = label
                textSize = 14f
                setTextColor(Color.WHITE)
                setBackgroundColor(color)
                gravity = Gravity.CENTER
                setPadding(24, 12, 24, 12)
                setOnClickListener { viewModel.placeRouletteBet(key) }
            }
            colorBets.addView(btn, LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f).apply { setMargins(4, 0, 4, 0) })
        }
    }

    private fun setupChipSelector() {
        chipSelector.removeAllViews()
        CHIP_VALUES.forEach { value ->
            chipSelector.addView(TextView(requireContext()).apply {
                text = formatChipValue(value)
                textSize = 13f
                setTextColor(Color.BLACK)
                setBackgroundColor(Color.parseColor("#FFD700"))
                gravity = Gravity.CENTER
                setPadding(16, 8, 16, 8)
                setOnClickListener { viewModel.selectChip(value) }
            }, LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.WRAP_CONTENT,
                LinearLayout.LayoutParams.WRAP_CONTENT
            ).apply { setMargins(3, 0, 3, 0) })
        }
    }

    private fun setupButtons() {
        spinButton.setOnClickListener { viewModel.spinRoulette(roomId) }
        clearButton.setOnClickListener { viewModel.clearRouletteBets() }
    }

    private fun observeState() {
        viewLifecycleOwner.lifecycleScope.launch {
            viewModel.rouletteBets.collect { bets ->
                totalBetText.text = "Total Bet: ${formatChipValue(bets.values.sum())}"
            }
        }
        viewLifecycleOwner.lifecycleScope.launch {
            viewModel.rouletteState.collect { state ->
                when (state) {
                    is RouletteState.Idle -> {
                        spinButton.isEnabled = true
                        spinButton.text = "SPIN!"
                        resultOverlay.visibility = View.GONE
                    }
                    is RouletteState.Spinning -> {
                        spinButton.isEnabled = false
                        spinButton.text = "Spinning..."
                        animateWheel()
                    }
                    is RouletteState.Result -> showResult(state.result)
                    is RouletteState.Error -> Toast.makeText(requireContext(), state.message, Toast.LENGTH_SHORT).show()
                }
            }
        }
    }

    private fun animateWheel() {
        ObjectAnimator.ofFloat(wheelView, View.ROTATION, 0f, 360f * 8).apply {
            duration = 4000
            interpolator = DecelerateInterpolator(2.5f)
            start()
        }
    }

    private fun showResult(result: RouletteResult) {
        resultOverlay.removeAllViews()
        val colorEmoji = when (result.color) {
            "red" -> "🔴"
            "black" -> "⚫"
            else -> "🟢"
        }
        resultOverlay.addView(TextView(requireContext()).apply {
            text = "$colorEmoji ${result.number}\n\n" +
                    if (result.payout > 0) "🎉 Won: ${formatChipValue(result.payout)}!"
                    else "Better luck next time!"
            textSize = 28f
            setTextColor(if (result.payout > 0) Color.parseColor("#FFD700") else Color.WHITE)
            gravity = Gravity.CENTER
        }, FrameLayout.LayoutParams(
            FrameLayout.LayoutParams.WRAP_CONTENT,
            FrameLayout.LayoutParams.WRAP_CONTENT,
            Gravity.CENTER
        ))
        resultOverlay.visibility = View.VISIBLE
    }
}
