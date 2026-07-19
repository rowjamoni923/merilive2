export interface PolicySection {
  title: string;
  icon?: string;
  items: string[];
}

export interface PolicyDetail {
  id: string;
  title: string;
  subtitle: string;
  accentColor: string;
  sections: PolicySection[];
}

export const policyDetails: Record<string, PolicyDetail> = {
  "host-policy": {
    id: "host-policy",
    title: "Host Policy & Benefits",
    subtitle: "Complete guide for MeriLive hosts",
    accentColor: "from-purple-500 to-indigo-600",
    sections: [
      {
        title: "Who Can Become a Host?",
        icon: "👤",
        items: [
          "Must be 18 years or older",
          "Valid government-issued ID required",
          "Must pass face verification",
          "Must join through an approved agency",
          "Clean record — no prior bans or violations",
        ],
      },
      {
        title: "Host Benefits",
        icon: "🎁",
        items: [
          "Earn diamonds from video calls and gifts",
          "Weekly withdrawal (every Wednesday)",
          "Access to beauty filters & AR stickers",
          "Priority support from your agency",
          "Performance bonuses for top hosts",
          "Level-up rewards and exclusive badges",
        ],
      },
      {
        title: "Host Responsibilities",
        icon: "📋",
        items: [
          "Maintain a minimum of 2 hours daily online time",
          "Respond to calls within 30 seconds",
          "Keep profile photo updated and approved",
          "Follow all platform content guidelines",
          "No sharing of personal contact information",
          "No inappropriate or explicit content",
        ],
      },
      {
        title: "Earnings Structure",
        icon: "💰",
        items: [
          "1 Diamond = 1 Bin (internal currency unit)",
          "Video call earnings: Based on call duration",
          "Gift earnings: 100% of received gift value",
          "Minimum withdrawal: $10 USD equivalent",
          "Settlement: Every Wednesday (IST 12:00 PM)",
        ],
      },
    ],
  },

  "party-room": {
    id: "party-room",
    title: "Party Room Policy",
    subtitle: "Rules and guidelines for party rooms",
    accentColor: "from-pink-500 to-rose-600",
    sections: [
      {
        title: "Party Room Rules",
        icon: "🎉",
        items: [
          "Maximum 9 seats per party room",
          "Room owner controls mic and seat access",
          "No hate speech, abuse, or harassment",
          "Background music must not violate copyright",
          "Gambling and betting discussions are prohibited",
        ],
      },
      {
        title: "Room Owner Benefits",
        icon: "👑",
        items: [
          "Earn diamonds from gifts sent in your room",
          "Custom room themes and decorations",
          "Ability to assign co-hosts and moderators",
          "Priority listing for active rooms",
          "Special room owner badge on profile",
        ],
      },
      {
        title: "Prohibited Activities",
        icon: "🚫",
        items: [
          "No sharing of external links or apps",
          "No promoting other platforms",
          "No religious or political discussions",
          "No adult or explicit content",
          "No begging for gifts or diamonds",
          "No impersonation of staff or officials",
        ],
      },
    ],
  },

  "host-registration": {
    id: "host-registration",
    title: "Host Registration Policy",
    subtitle: "Step-by-step registration process",
    accentColor: "from-blue-500 to-cyan-600",
    sections: [
      {
        title: "Registration Steps",
        icon: "📝",
        items: [
          "Step 1: Download MeriLive app from Play Store",
          "Step 2: Create account with phone number",
          "Step 3: Contact an approved agency for invitation",
          "Step 4: Submit profile photo for approval",
          "Step 5: Complete face verification",
          "Step 6: Upload government-issued ID",
          "Step 7: Wait for admin approval (24-48 hours)",
        ],
      },
      {
        title: "Required Documents",
        icon: "📄",
        items: [
          "Clear selfie photo (no filters)",
          "Government-issued ID (NID/Passport/Driving License)",
          "ID must match face verification",
          "Photo must meet quality standards",
        ],
      },
      {
        title: "After Approval",
        icon: "✅",
        items: [
          "You'll receive host badge on your profile",
          "Access to host dashboard and earnings tracker",
          "Start receiving video calls immediately",
          "Your agency will guide you on best practices",
          "First withdrawal available after 7 days",
        ],
      },
    ],
  },

  "photo-approval": {
    id: "photo-approval",
    title: "Photo Approval Standards",
    subtitle: "Guidelines for profile photo approval",
    accentColor: "from-amber-500 to-orange-600",
    sections: [
      {
        title: "Approved Photo Requirements",
        icon: "📸",
        items: [
          "Clear, well-lit face photo",
          "No heavy filters or face-altering effects",
          "Face must be clearly visible (no masks/sunglasses)",
          "Minimum resolution: 500x500 pixels",
          "Recent photo (taken within last 6 months)",
          "Single person only — no group photos",
        ],
      },
      {
        title: "Reasons for Rejection",
        icon: "❌",
        items: [
          "Blurry or low-quality image",
          "Heavy beauty filters applied",
          "Face not clearly visible",
          "Inappropriate or revealing clothing",
          "Using someone else's photo",
          "Text or watermarks on photo",
          "Landscape or scenery photos",
        ],
      },
      {
        title: "Re-submission Policy",
        icon: "🔄",
        items: [
          "You can re-submit up to 3 times per day",
          "Wait at least 1 hour between submissions",
          "Read rejection reason before re-submitting",
          "Contact your agency if repeatedly rejected",
        ],
      },
    ],
  },

  "number-sharing-penalty": {
    id: "number-sharing-penalty",
    title: "Number Sharing Penalties",
    subtitle: "Strict policy against sharing personal numbers",
    accentColor: "from-red-500 to-red-700",
    sections: [
      {
        title: "What is Number Sharing?",
        icon: "📱",
        items: [
          "Sharing your phone number with users during calls",
          "Asking users for their phone numbers",
          "Displaying phone number on screen or in chat",
          "Using coded language to share contact info",
          "Writing numbers on paper and showing on camera",
        ],
      },
      {
        title: "Penalties",
        icon: "⚠️",
        items: [
          "1st Offense: Warning + 7-day diamond freeze",
          "2nd Offense: 30-day suspension from platform",
          "3rd Offense: Permanent ban + diamond forfeiture",
          "All pending withdrawals will be held during investigation",
          "Agency will be notified of all violations",
        ],
      },
      {
        title: "Detection Methods",
        icon: "🔍",
        items: [
          "AI-powered chat monitoring system",
          "User reports and complaints",
          "Random call auditing by moderators",
          "Screenshot analysis technology",
          "Voice-to-text detection for spoken numbers",
        ],
      },
    ],
  },

  "contact-sharing-rules": {
    id: "contact-sharing-rules",
    title: "Contact Sharing Rules",
    subtitle: "Policies for protecting user privacy",
    accentColor: "from-orange-500 to-amber-600",
    sections: [
      {
        title: "Prohibited Sharing",
        icon: "🚫",
        items: [
          "Phone numbers (yours or users')",
          "Social media accounts (Facebook, Instagram, etc.)",
          "WhatsApp or Telegram numbers",
          "Email addresses",
          "Physical addresses or locations",
          "Any external messaging app IDs",
        ],
      },
      {
        title: "Why This Rule Exists",
        icon: "🛡️",
        items: [
          "Protects user safety and privacy",
          "Prevents harassment outside the platform",
          "Ensures fair earnings through the platform",
          "Maintains platform integrity and trust",
          "Required by international privacy regulations",
        ],
      },
      {
        title: "Reporting Violations",
        icon: "📢",
        items: [
          "Use the in-app report button during calls",
          "Screenshot evidence will strengthen your report",
          "Reports are reviewed within 24 hours",
          "Anonymous reporting is available",
          "False reports may result in penalties",
        ],
      },
    ],
  },

  "agency-policy": {
    id: "agency-policy",
    title: "Agency Policy & Commission",
    subtitle: "Complete agency management guide",
    accentColor: "from-indigo-500 to-purple-600",
    sections: [
      {
        title: "Agency Requirements",
        icon: "🏢",
        items: [
          "Minimum 5 active hosts to maintain agency status",
          "Agency owner must have valid identity verification",
          "Must maintain at least 80% host activity rate",
          "Weekly performance reports required",
          "Comply with all platform policies",
        ],
      },
      {
        title: "Commission Structure",
        icon: "💎",
        items: [
          "Agency earns commission from all host earnings",
          "Commission rate depends on agency level (A1-A5)",
          "Higher levels = higher commission rates",
          "Commission is calculated weekly",
          "Paid every Wednesday with host settlements",
        ],
      },
      {
        title: "Agency Responsibilities",
        icon: "📋",
        items: [
          "Recruit and train new hosts",
          "Monitor host performance and compliance",
          "Handle host issues and disputes",
          "Ensure hosts follow platform guidelines",
          "Report violations to platform admin",
          "Provide ongoing support to hosts",
        ],
      },
    ],
  },

  "agency-commission": {
    id: "agency-commission",
    title: "Agency Commission Tiers (A1-A5)",
    subtitle: "Detailed breakdown of commission levels",
    accentColor: "from-emerald-500 to-teal-600",
    sections: [
      {
        title: "Commission Tiers",
        icon: "📊",
        items: [
          "A1 (Bronze): 3% commission — Weekly income $50–$200",
          "A2 (Silver): 5% commission — Weekly income $201–$1,000",
          "A3 (Gold): 10% commission — Weekly income $1,001–$2,000",
          "A4 (Platinum): 15% commission — Weekly income $2,001–$3,500",
          "A5 (Diamond): 20% commission — Weekly income above $4,000",
        ],
      },
      {
        title: "How to Level Up",
        icon: "📈",
        items: [
          "Increase total host count with active members",
          "Maintain high host engagement rates",
          "Achieve consistent weekly income targets",
          "Zero policy violations for 30+ days",
          "Levels are evaluated every Monday",
        ],
      },
      {
        title: "Bonus Rewards",
        icon: "🏆",
        items: [
          "A3+ agencies get priority support",
          "A4+ agencies can create sub-agencies",
          "A5 agencies get featured in agency directory",
          "Monthly top agency awards with cash prizes",
          "Exclusive access to beta features",
        ],
      },
    ],
  },

  "sub-agency": {
    id: "sub-agency",
    title: "Sub-Agency Commission",
    subtitle: "Earn from your sub-agency network",
    accentColor: "from-violet-500 to-purple-600",
    sections: [
      {
        title: "Sub-Agency System",
        icon: "🌐",
        items: [
          "A4+ agencies can invite sub-agencies",
          "Earn 3-5% commission from sub-agency earnings",
          "No limit on number of sub-agencies",
          "Sub-agencies operate independently",
          "Parent agency provides guidance and support",
        ],
      },
      {
        title: "Commission Flow",
        icon: "💸",
        items: [
          "Host earns diamonds → Agency gets commission",
          "Sub-agency commission → Parent agency gets share",
          "All commissions calculated automatically",
          "Transparent tracking in agency dashboard",
          "Weekly settlement with main agency payment",
        ],
      },
      {
        title: "Requirements",
        icon: "✅",
        items: [
          "Parent agency must be level A4 or higher",
          "Sub-agency owner must complete verification",
          "Minimum 3 active hosts in sub-agency",
          "Must follow all platform policies",
          "Performance reviewed monthly",
        ],
      },
    ],
  },

  "payroll-policy": {
    id: "payroll-policy",
    title: "Payroll Helper Program",
    subtitle: "Become a trusted payment facilitator",
    accentColor: "from-sky-500 to-blue-600",
    sections: [
      {
        title: "What is a Payroll Helper?",
        icon: "🤝",
        items: [
          "Payroll Helpers process local currency payments for hosts",
          "They bridge the gap between platform and local banking",
          "Available in 15+ countries worldwide",
          "Earn diamond rewards for every transaction processed",
          "Trusted position with strict vetting process",
        ],
      },
      {
        title: "How to Become a Helper",
        icon: "📋",
        items: [
          "Must have 300,000+ diamonds in account",
          "Complete advanced identity verification",
          "Pass background check and interview",
          "Deposit security collateral",
          "Training completion required",
          "Admin approval needed",
        ],
      },
      {
        title: "Helper Responsibilities",
        icon: "⚡",
        items: [
          "Process withdrawal requests within 24 hours",
          "Maintain sufficient local currency balance",
          "Upload payment proof screenshots",
          "Respond to admin queries promptly",
          "Follow all financial compliance rules",
        ],
      },
    ],
  },

  "helper-benefits": {
    id: "helper-benefits",
    title: "Payroll Helper Benefits",
    subtitle: "Rewards and perks for helpers",
    accentColor: "from-amber-500 to-yellow-600",
    sections: [
      {
        title: "Diamond Rewards",
        icon: "💎",
        items: [
          "Earn 1 Diamond for every 1 Bin processed",
          "Bonus diamonds for high-volume processing",
          "Monthly performance bonuses",
          "Priority access to premium features",
          "Exclusive helper badge on profile",
        ],
      },
      {
        title: "Financial Benefits",
        icon: "💰",
        items: [
          "Competitive exchange rates",
          "No platform fees on helper transactions",
          "Weekly bonus for 100% completion rate",
          "Referral bonus for new helper recruitment",
          "Annual performance awards",
        ],
      },
      {
        title: "Special Perks",
        icon: "⭐",
        items: [
          "Dedicated helper support channel",
          "Direct communication with admin team",
          "Early access to new features",
          "Helper community events",
          "VIP status on platform",
        ],
      },
    ],
  },

  "helper-diamond-recharge": {
    id: "helper-diamond-recharge",
    title: "Helper Diamond Recharge System",
    subtitle: "How diamond recharging works for helpers",
    accentColor: "from-cyan-500 to-teal-600",
    sections: [
      {
        title: "Recharge Process",
        icon: "🔄",
        items: [
          "Helpers can recharge diamonds for agencies/hosts",
          "Recharge requests come through admin dashboard",
          "Process payment and confirm in system",
          "Diamonds credited automatically after confirmation",
          "All transactions are logged and auditable",
        ],
      },
      {
        title: "Recharge Limits",
        icon: "📊",
        items: [
          "Daily limit based on helper level",
          "Level 1: Up to $500/day",
          "Level 2: Up to $1,000/day",
          "Level 3: Up to $2,500/day",
          "Level 5+: Up to $10,000/day",
        ],
      },
      {
        title: "Security Measures",
        icon: "🔒",
        items: [
          "Two-factor authentication required",
          "Transaction verification via SMS/Email",
          "Suspicious activity auto-flagged",
          "24/7 monitoring by security team",
          "Instant freeze capability for suspicious accounts",
        ],
      },
    ],
  },

  "helper-withdrawal-processing": {
    id: "helper-withdrawal-processing",
    title: "Helper Withdrawal Processing",
    subtitle: "How to process host withdrawals",
    accentColor: "from-green-500 to-emerald-600",
    sections: [
      {
        title: "Processing Steps",
        icon: "📝",
        items: [
          "Step 1: Receive withdrawal assignment notification",
          "Step 2: Verify host's payment details",
          "Step 3: Transfer local currency to host",
          "Step 4: Upload payment screenshot as proof",
          "Step 5: Mark transaction as completed",
          "Step 6: Admin verifies and closes the request",
        ],
      },
      {
        title: "Processing Timeline",
        icon: "⏰",
        items: [
          "Assignments must be processed within 24 hours",
          "Late processing may affect helper rating",
          "3 consecutive late processes = warning",
          "5 late processes in a month = temporary suspension",
          "Urgent requests marked with priority flag",
        ],
      },
      {
        title: "Dispute Resolution",
        icon: "⚖️",
        items: [
          "Host can report non-receipt within 48 hours",
          "Helper must provide payment proof",
          "Admin mediates all disputes",
          "Resolution typically within 72 hours",
          "False claims result in penalties for either party",
        ],
      },
    ],
  },

  "helper-rewards": {
    id: "helper-rewards",
    title: "Helper Reward System",
    subtitle: "1 Bin = 1 Diamond reward structure",
    accentColor: "from-yellow-500 to-amber-600",
    sections: [
      {
        title: "Reward Structure",
        icon: "💎",
        items: [
          "Every 1 Bin processed = 1 Diamond reward",
          "Rewards credited after transaction verification",
          "Diamonds can be withdrawn as cash",
          "No upper limit on daily diamond rewards",
          "Bonus multipliers during promotional periods",
        ],
      },
      {
        title: "Milestone Bonuses",
        icon: "🏅",
        items: [
          "10,000 Bins processed: +500 bonus diamonds",
          "50,000 Bins processed: +3,000 bonus diamonds",
          "100,000 Bins processed: +8,000 bonus diamonds",
          "500,000 Bins processed: +50,000 bonus diamonds",
          "1,000,000 Bins processed: Elite Helper status",
        ],
      },
      {
        title: "Monthly Rankings",
        icon: "🏆",
        items: [
          "Top 3 helpers get additional cash bonuses",
          "1st Place: $200 bonus",
          "2nd Place: $100 bonus",
          "3rd Place: $50 bonus",
          "Rankings reset on the 1st of each month",
        ],
      },
    ],
  },

  "helper-rules": {
    id: "helper-rules",
    title: "Helper Rules & Restrictions",
    subtitle: "Important guidelines for payroll helpers",
    accentColor: "from-red-500 to-rose-600",
    sections: [
      {
        title: "Mandatory Rules",
        icon: "📜",
        items: [
          "Process all assignments within 24 hours",
          "Maintain accurate transaction records",
          "Never share user financial information",
          "Always use official payment channels",
          "Report suspicious activities immediately",
          "Keep your account credentials secure",
        ],
      },
      {
        title: "Prohibited Actions",
        icon: "🚫",
        items: [
          "No direct communication with hosts about payments",
          "No accepting payments outside the platform",
          "No modifying transaction amounts",
          "No sharing helper dashboard access",
          "No processing personal transactions through the system",
          "No soliciting tips from hosts",
        ],
      },
      {
        title: "Violation Consequences",
        icon: "⚠️",
        items: [
          "Minor violation: Written warning",
          "Moderate violation: 7-day suspension",
          "Serious violation: 30-day suspension + review",
          "Critical violation: Permanent ban + legal action",
          "All violations are permanently recorded",
        ],
      },
    ],
  },

  "helper-recharge-access": {
    id: "helper-recharge-access",
    title: "Helper Recharge Number Access",
    subtitle: "Access requirements for recharge operations",
    accentColor: "from-indigo-500 to-blue-600",
    sections: [
      {
        title: "Access Requirements",
        icon: "🔑",
        items: [
          "Minimum 300,000 diamonds in account",
          "Active helper status for 90+ days",
          "Zero major violations in last 6 months",
          "Completed advanced security training",
          "Admin approval required",
        ],
      },
      {
        title: "What You Can Do",
        icon: "✨",
        items: [
          "Access host recharge number system",
          "Process bulk recharge requests",
          "View detailed transaction analytics",
          "Generate reports for admin review",
          "Priority queue for processing requests",
        ],
      },
      {
        title: "Maintaining Access",
        icon: "🔄",
        items: [
          "Maintain minimum diamond balance at all times",
          "Complete monthly security review",
          "Maintain 95%+ transaction success rate",
          "Access reviewed quarterly by admin",
          "Any violation may result in access revocation",
        ],
      },
    ],
  },

  "withdrawal": {
    id: "withdrawal",
    title: "Withdrawal System",
    subtitle: "How to withdraw your earnings",
    accentColor: "from-green-500 to-emerald-600",
    sections: [
      {
        title: "Withdrawal Overview",
        icon: "💸",
        items: [
          "All hosts and agencies can withdraw weekly",
          "Minimum withdrawal: $10 USD equivalent",
          "Two methods: USDT (Crypto) & Local Currency",
          "Processing time: 24-72 hours",
          "No hidden fees — transparent pricing",
        ],
      },
      {
        title: "Withdrawal Steps",
        icon: "📝",
        items: [
          "Step 1: Go to Wallet → Withdrawal",
          "Step 2: Enter amount to withdraw",
          "Step 3: Select payment method",
          "Step 4: Confirm your payment details",
          "Step 5: Submit withdrawal request",
          "Step 6: Receive payment within 24-72 hours",
        ],
      },
      {
        title: "Important Notes",
        icon: "📌",
        items: [
          "Withdrawals are processed every Wednesday",
          "Ensure your payment details are correct",
          "Incorrect details may cause delays",
          "Contact support for any withdrawal issues",
          "Maximum 2 withdrawal requests per week",
        ],
      },
    ],
  },

  "withdrawal-methods": {
    id: "withdrawal-methods",
    title: "Withdrawal Methods",
    subtitle: "USDT & Local Currency options",
    accentColor: "from-teal-500 to-cyan-600",
    sections: [
      {
        title: "USDT (Crypto) Withdrawal",
        icon: "🪙",
        items: [
          "Available worldwide — no country restrictions",
          "Supported networks: TRC20 (Tron) recommended",
          "Minimum: $20 USD equivalent",
          "Processing time: 12-24 hours",
          "Network fee: Covered by platform",
          "Wallet address verification required",
        ],
      },
      {
        title: "Local Currency Payment",
        icon: "🏦",
        items: [
          "Available in 15 supported countries",
          "Paid directly to your local bank/wallet",
          "Minimum: $10 USD equivalent",
          "Processing time: 24-48 hours",
          "Handled by verified Payroll Helpers",
          "Exchange rate updated daily",
        ],
      },
      {
        title: "ePay Global Withdrawal",
        icon: "🌍",
        items: [
          "Available when no local Payroll Helper exists",
          "Supports 100+ countries",
          "Processing time: 48-72 hours",
          "Minimum: $50 USD",
          "Transaction fee: 2-3%",
          "Paid to your ePay account",
        ],
      },
    ],
  },

  "weekly-withdrawal": {
    id: "weekly-withdrawal",
    title: "Weekly Withdrawal Schedule",
    subtitle: "Settlement timeline and deadlines",
    accentColor: "from-blue-500 to-indigo-600",
    sections: [
      {
        title: "Weekly Schedule",
        icon: "📅",
        items: [
          "Earning period: Thursday to Wednesday",
          "Withdrawal window: Wednesday 12:00 PM IST",
          "Request deadline: Tuesday 11:59 PM IST",
          "Processing day: Wednesday",
          "Payment received: Wednesday-Friday",
        ],
      },
      {
        title: "Settlement Details",
        icon: "💳",
        items: [
          "All earnings from the week are calculated",
          "Agency commission deducted automatically",
          "Platform fee (if any) deducted",
          "Net amount available for withdrawal",
          "Auto-withdrawal available for recurring payments",
        ],
      },
      {
        title: "Holiday Schedule",
        icon: "🗓️",
        items: [
          "Public holidays may delay processing by 1-2 days",
          "Holiday schedule published monthly in advance",
          "Emergency withdrawals available for urgent cases",
          "Contact admin for holiday-related queries",
        ],
      },
    ],
  },

  "multi-currency": {
    id: "multi-currency",
    title: "Multi-Currency Withdrawals",
    subtitle: "Supported currencies and exchange rates",
    accentColor: "from-purple-500 to-violet-600",
    sections: [
      {
        title: "Supported Currencies",
        icon: "💱",
        items: [
          "🇮🇳 INR — Indian Rupee",
          "🇵🇰 PKR — Pakistani Rupee",
          "🇵🇭 PHP — Philippine Peso",
          "🇮🇩 IDR — Indonesian Rupiah",
          "🇪🇬 EGP — Egyptian Pound",
          "🇹🇷 TRY — Turkish Lira",
          "🇳🇬 NGN — Nigerian Naira",
          "🇰🇪 KES — Kenyan Shilling",
          "🇳🇵 NPR — Nepalese Rupee",
          "🇱🇰 LKR — Sri Lankan Rupee",
          "🇬🇭 GHS — Ghanaian Cedi",
          "🇻🇳 VND — Vietnamese Dong",
          "🇹🇭 THB — Thai Baht",
          "🇿🇦 ZAR — South African Rand",
          "🇲🇾 MYR — Malaysian Ringgit",
        ],
      },
      {
        title: "Exchange Rate Policy",
        icon: "📊",
        items: [
          "Rates updated daily at 00:00 UTC",
          "Based on market rates with minimal spread",
          "Rate locked at time of withdrawal request",
          "No hidden conversion fees",
          "Rate history available in dashboard",
        ],
      },
    ],
  },
};
