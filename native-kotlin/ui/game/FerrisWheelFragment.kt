package com.merilive.app.ui.game

import android.animation.ObjectAnimator
import android.animation.ValueAnimator
import android.graphics.Color
import android.os.Bundle
import android.view.Gravity
import android.view.LayoutInflater
import android.view.View
import android.view.ViewGroup
import android.view.animation.DecelerateInterpolator
import android.widget.FrameLayout
import android.widget.GridLayout
import android.widget.ImageView
import android.widget.LinearLayout
import android.widget.TextView
import android.widget.Toast
import androidx.core.content.ContextCompat
import androidx.fragment.app.Fragment
import androidx.fragment.app.activityViewModels
import androidx.lifecycle.lifecycleScope
import com.merilive.app.R
import com.merilive.app.data.model.*
import dagger.hilt.android.AndroidEntryPoint
import kotlinx.coroutines.launch

@AndroidEntryPoint
class FerrisWheelFragment : Fragment() {

    private val viewModel: GameViewModel by activityViewModels()
    private var roomId: String = ""

    // UI References
    private lateinit var wheelView: FrameLayout
    private lateinit var bettingGrid: GridLayout
    private lateinit var chipSelector: LinearLayout
    private lateinit var spinButton: TextView
    private lateinit var clearButton: TextView
    private lateinit var totalBetText: TextView
    private lateinit var resultOverlay: FrameLayout

    companion object {
        fun newInstance(roomId: String): FerrisWheelFragment {
            return FerrisWheelFragment().apply {
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
        setupChipSelector()
        setupBettingGrid()
        setupButtons()
        observeState()
    }

    private fun buildUI(): View {
        val root = LinearLayout(requireContext()).apply {
            orientation = LinearLayout.VERTICAL
            setBackgroundColor(Color.parseColor("#1A0A2E"))
            layoutParams = ViewGroup.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT)
            setPadding(24, 16, 24, 16)
        }

        // Title
        root.addView(TextView(requireContext()).apply {
            text = "🎡 Ferris Wheel"
            textSize = 22f
            setTextColor(Color.parseColor("#FFD700"))
            gravity = Gravity.CENTER
            setPadding(0, 8, 0, 16)
        })

        // Wheel Area
        wheelView = FrameLayout(requireContext()).apply {
            layoutParams = LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, 280).apply {
                gravity = Gravity.CENTER_HORIZONTAL
            }
            setBackgroundColor(Color.parseColor("#2D1B69"))
        }
        buildWheelItems()
        root.addView(wheelView)

        // Total Bet Display
        totalBetText = TextView(requireContext()).apply {
            text = "Total Bet: 0"
            textSize = 16f
            setTextColor(Color.WHITE)
            gravity = Gravity.CENTER
            setPadding(0, 12, 0, 8)
        }
        root.addView(totalBetText)

        // Betting Grid (8 items)
        bettingGrid = GridLayout(requireContext()).apply {
            columnCount = 4
            rowCount = 2
            layoutParams = LinearLayout.LayoutParams(LinearLayout.LayoutParams.MATCH_PARENT, LinearLayout.LayoutParams.WRAP_CONTENT)
        }
        root.addView(bettingGrid)

        // Chip Selector
        chipSelector = LinearLayout(requireContext()).apply {
            orientation = LinearLayout.HORIZONTAL
            gravity = Gravity.CENTER
            setPadding(0, 12, 0, 12)
        }
        root.addView(chipSelector)

        // Buttons Row
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
            setPadding(48, 16, 48, 16)
        }
        spinButton = TextView(requireContext()).apply {
            text = "SPIN!"
            textSize = 18f
            setTextColor(Color.BLACK)
            setBackgroundColor(Color.parseColor("#FFD700"))
            gravity = Gravity.CENTER
            setPadding(64, 16, 64, 16)
        }
        buttonRow.addView(clearButton, LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f).apply { setMargins(0, 0, 8, 0) })
        buttonRow.addView(spinButton, LinearLayout.LayoutParams(0, LinearLayout.LayoutParams.WRAP_CONTENT, 1f).apply { setMargins(8, 0, 0, 0) })
        root.addView(buttonRow)

        // Result Overlay
        resultOverlay = FrameLayout(requireContext()).apply {
            visibility = View.GONE
            setBackgroundColor(Color.parseColor("#CC000000"))
            layoutParams = FrameLayout.LayoutParams(FrameLayout.LayoutParams.MATCH_PARENT, FrameLayout.LayoutParams.MATCH_PARENT)
        }

        val wrapper = FrameLayout(requireContext())
        wrapper.addView(root)
        wrapper.addView(resultOverlay)
        return wrapper
    }

    private fun buildWheelItems() {
        FERRIS_WHEEL_ITEMS.forEachIndexed { index, item ->
            val tv = TextView(requireContext()).apply {
                text = "${item.emoji}\n${item.name}\nx${item.multiplier}"
                textSize = 12f
                setTextColor(Color.WHITE)
                gravity = Gravity.CENTER
                setPadding(8, 8, 8, 8)
            }
            val angle = (360f / 8) * index
            val radius = 100f
            val x = (140 + radius * Math.cos(Math.toRadians(angle.toDouble()))).toFloat()
            val y = (100 + radius * Math.sin(Math.toRadians(angle.toDouble()))).toFloat()
            tv.layoutParams = FrameLayout.LayoutParams(
                FrameLayout.LayoutParams.WRAP_CONTENT,
                FrameLayout.LayoutParams.WRAP_CONTENT
            ).apply {
                leftMargin = x.toInt()
                topMargin = y.toInt()
            }
            wheelView.addView(tv)
        }
    }

    private fun setupBettingGrid() {
        bettingGrid.removeAllViews()
        FERRIS_WHEEL_ITEMS.forEach { item ->
            val cell = TextView(requireContext()).apply {
                text = "${item.emoji}\n${item.name}\nx${item.multiplier}"
                textSize = 13f
                setTextColor(Color.WHITE)
                gravity = Gravity.CENTER
                setBackgroundColor(Color.parseColor("#3D2B79"))
                setPadding(16, 12, 16, 12)
                setOnClickListener { viewModel.placeFerrisBet(item.slot) }
            }
            val params = GridLayout.LayoutParams().apply {
                width = 0
                height = GridLayout.LayoutParams.WRAP_CONTENT
                columnSpec = GridLayout.spec(GridLayout.UNDEFINED, 1f)
                setMargins(4, 4, 4, 4)
            }
            bettingGrid.addView(cell, params)
        }
    }

    private fun setupChipSelector() {
        chipSelector.removeAllViews()
        CHIP_VALUES.forEach { value ->
            val chip = TextView(requireContext()).apply {
                text = formatChipValue(value)
                textSize = 14f
                setTextColor(Color.BLACK)
                setBackgroundColor(Color.parseColor("#FFD700"))
                gravity = Gravity.CENTER
                setPadding(24, 12, 24, 12)
                setOnClickListener { viewModel.selectChip(value) }
            }
            chipSelector.addView(chip, LinearLayout.LayoutParams(
                LinearLayout.LayoutParams.WRAP_CONTENT,
                LinearLayout.LayoutParams.WRAP_CONTENT
            ).apply { setMargins(4, 0, 4, 0) })
        }
    }

    private fun setupButtons() {
        spinButton.setOnClickListener { viewModel.spinFerrisWheel(roomId) }
        clearButton.setOnClickListener { viewModel.clearFerrisBets() }
    }

    private fun observeState() {
        viewLifecycleOwner.lifecycleScope.launch {
            viewModel.ferrisBets.collect { bets ->
                val total = bets.values.sum()
                totalBetText.text = "Total Bet: ${formatChipValue(total)}"
                // Update grid cells with bet amounts
                updateBettingGridHighlights(bets)
            }
        }
        viewLifecycleOwner.lifecycleScope.launch {
            viewModel.ferrisState.collect { state ->
                when (state) {
                    is GameState.Idle -> {
                        spinButton.isEnabled = true
                        spinButton.text = "SPIN!"
                        resultOverlay.visibility = View.GONE
                    }
                    is GameState.Spinning -> {
                        spinButton.isEnabled = false
                        spinButton.text = "Spinning..."
                        animateWheel()
                    }
                    is GameState.Result -> {
                        showResult(state.result)
                    }
                    is GameState.Error -> {
                        Toast.makeText(requireContext(), state.message, Toast.LENGTH_SHORT).show()
                    }
                }
            }
        }
    }

    private fun updateBettingGridHighlights(bets: Map<Int, Long>) {
        for (i in 0 until bettingGrid.childCount) {
            val cell = bettingGrid.getChildAt(i) as? TextView ?: continue
            val item = FERRIS_WHEEL_ITEMS.getOrNull(i) ?: continue
            val bet = bets[item.slot] ?: 0
            if (bet > 0) {
                cell.setBackgroundColor(Color.parseColor("#6B3FA0"))
                cell.text = "${item.emoji}\n${item.name}\n${formatChipValue(bet)}"
            } else {
                cell.setBackgroundColor(Color.parseColor("#3D2B79"))
                cell.text = "${item.emoji}\n${item.name}\nx${item.multiplier}"
            }
        }
    }

    private fun animateWheel() {
        val animator = ObjectAnimator.ofFloat(wheelView, View.ROTATION, 0f, 360f * 5).apply {
            duration = 3000
            interpolator = DecelerateInterpolator(2f)
            repeatCount = 0
        }
        animator.start()
    }

    private fun showResult(result: GameResult) {
        resultOverlay.removeAllViews()
        val item = FERRIS_WHEEL_ITEMS.getOrNull(result.winning_slot)
        val resultText = TextView(requireContext()).apply {
            text = "${item?.emoji ?: "🎡"}\n${result.winning_item}\n\n" +
                    if (result.total_payout > 0) "🎉 Won: ${formatChipValue(result.total_payout)}!"
                    else "Better luck next time!"
            textSize = 24f
            setTextColor(if (result.total_payout > 0) Color.parseColor("#FFD700") else Color.WHITE)
            gravity = Gravity.CENTER
        }
        resultOverlay.addView(resultText, FrameLayout.LayoutParams(
            FrameLayout.LayoutParams.WRAP_CONTENT,
            FrameLayout.LayoutParams.WRAP_CONTENT,
            Gravity.CENTER
        ))
        resultOverlay.visibility = View.VISIBLE
    }
}
