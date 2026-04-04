package com.merilive.app.ui.invitation.adapter

import android.graphics.Color
import android.view.LayoutInflater
import android.view.ViewGroup
import androidx.recyclerview.widget.RecyclerView
import com.merilive.app.data.repository.InvitationTierData
import com.merilive.app.databinding.ItemInvitationTierBinding

class InvitationTierAdapter(
    private val onClaim: (tierId: String) -> Unit,
) : RecyclerView.Adapter<InvitationTierAdapter.ViewHolder>() {

    private var tiers: List<InvitationTierData> = emptyList()
    private var claimedIds: Set<String> = emptySet()
    private var myInvites: Int = 0
    private var claimingId: String? = null

    fun submitList(
        newTiers: List<InvitationTierData>,
        newClaimedIds: Set<String>,
        inviteCount: Int,
        claimingTierId: String? = null,
    ) {
        tiers = newTiers
        claimedIds = newClaimedIds
        myInvites = inviteCount
        claimingId = claimingTierId
        notifyDataSetChanged()
    }

    inner class ViewHolder(val binding: ItemInvitationTierBinding) : RecyclerView.ViewHolder(binding.root) {
        fun bind(tier: InvitationTierData) {
            binding.tvTierName.text = tier.tier_name ?: "Tier"
            binding.tvMinInvites.text = "Min: ${tier.min_invites ?: 0} invites"

            val rewardParts = mutableListOf<String>()
            tier.reward_beans?.let { if (it > 0) rewardParts.add("+$it Beans") }
            tier.reward_coins?.let { if (it > 0) rewardParts.add("+$it 💎") }
            tier.bonus_percentage?.let { if (it > 0) rewardParts.add("+${it.toInt()}%") }
            binding.tvReward.text = rewardParts.joinToString(" ")

            try {
                val color = Color.parseColor(tier.badge_color ?: "#9333EA")
                binding.cardTier.setCardBackgroundColor(color)
            } catch (_: Exception) {}

            val isClaimed = claimedIds.contains(tier.id)
            val isEligible = myInvites >= (tier.min_invites ?: Int.MAX_VALUE)
            val isClaiming = claimingId == tier.id

            when {
                isClaimed -> {
                    binding.btnClaimTier.text = "✓ Claimed"
                    binding.btnClaimTier.isEnabled = false
                }
                isEligible -> {
                    binding.btnClaimTier.text = if (isClaiming) "..." else "Claim"
                    binding.btnClaimTier.isEnabled = !isClaiming
                    binding.btnClaimTier.setOnClickListener { onClaim(tier.id) }
                }
                else -> {
                    binding.btnClaimTier.text = "Locked"
                    binding.btnClaimTier.isEnabled = false
                }
            }
        }
    }

    override fun onCreateViewHolder(parent: ViewGroup, viewType: Int): ViewHolder {
        val binding = ItemInvitationTierBinding.inflate(LayoutInflater.from(parent.context), parent, false)
        return ViewHolder(binding)
    }

    override fun onBindViewHolder(holder: ViewHolder, position: Int) = holder.bind(tiers[position])
    override fun getItemCount() = tiers.size
}
