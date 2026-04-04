import { memo } from "react";

const iconSize = "w-9 h-9";

// Each icon uses WHITE as primary color with subtle accents so they POP against any gradient background

export const HostsIcon3D = memo(() => (
  <div className="relative">
    <div className="absolute inset-0 bg-white/20 rounded-xl blur-md" />
    <svg viewBox="0 0 48 48" className={iconSize} style={{ filter: "drop-shadow(0 2px 4px rgba(0,0,0,0.4))" }}>
      <defs>
        <linearGradient id="host-white" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#ffffff" />
          <stop offset="100%" stopColor="#e0e7ff" />
        </linearGradient>
      </defs>
      {/* Person back */}
      <circle cx="17" cy="17" r="5" fill="url(#host-white)" stroke="rgba(255,255,255,0.6)" strokeWidth="0.5" />
      <path d="M10 33 Q10 26 17 25 Q24 26 24 33 L24 35 L10 35 Z" fill="url(#host-white)" stroke="rgba(255,255,255,0.6)" strokeWidth="0.5" opacity="0.7" />
      {/* Person front */}
      <circle cx="31" cy="15" r="6" fill="white" stroke="rgba(255,255,255,0.8)" strokeWidth="1" />
      <path d="M22 35 Q22 27 31 25 Q40 27 40 35 L40 37 L22 37 Z" fill="white" stroke="rgba(255,255,255,0.8)" strokeWidth="0.8" />
      {/* Plus badge */}
      <circle cx="39" cy="13" r="6" fill="#22c55e" stroke="white" strokeWidth="1.5" />
      <path d="M36 13 L42 13 M39 10 L39 16" stroke="white" strokeWidth="2" strokeLinecap="round" />
    </svg>
  </div>
));
HostsIcon3D.displayName = 'HostsIcon3D';

export const WithdrawIcon3D = memo(() => (
  <div className="relative">
    <div className="absolute inset-0 bg-white/20 rounded-xl blur-md" />
    <svg viewBox="0 0 48 48" className={iconSize} style={{ filter: "drop-shadow(0 2px 4px rgba(0,0,0,0.4))" }}>
      {/* Wallet body */}
      <rect x="6" y="12" width="32" height="24" rx="4" fill="white" stroke="rgba(255,255,255,0.8)" strokeWidth="0.8" />
      {/* Flap */}
      <path d="M6 16 Q6 12 10 12 L34 12 Q38 12 38 16 L38 20 L6 20 Z" fill="rgba(255,255,255,0.6)" />
      {/* Clasp */}
      <rect x="28" y="22" width="14" height="10" rx="3" fill="rgba(0,0,0,0.15)" />
      <circle cx="32" cy="27" r="3.5" fill="white" stroke="rgba(255,255,255,0.8)" strokeWidth="0.5" />
      {/* Dollar */}
      <text x="18" y="31" fontSize="14" fontWeight="bold" fill="rgba(0,0,0,0.3)" textAnchor="middle">$</text>
      {/* Arrow down */}
      <path d="M18 35 L18 42 M14 39 L18 43 L22 39" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  </div>
));
WithdrawIcon3D.displayName = 'WithdrawIcon3D';

export const RankingIcon3D = memo(() => (
  <div className="relative">
    <div className="absolute inset-0 bg-white/20 rounded-xl blur-md" />
    <svg viewBox="0 0 48 48" className={iconSize} style={{ filter: "drop-shadow(0 2px 4px rgba(0,0,0,0.4))" }}>
      {/* Trophy cup */}
      <path d="M14 8 L14 22 Q14 30 24 32 Q34 30 34 22 L34 8 Z" fill="white" stroke="rgba(255,255,255,0.8)" strokeWidth="0.8" />
      {/* Handles */}
      <path d="M14 12 Q6 12 6 20 Q6 26 14 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" />
      <path d="M34 12 Q42 12 42 20 Q42 26 34 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" />
      {/* Stem & Base */}
      <rect x="21" y="32" width="6" height="4" rx="1" fill="rgba(255,255,255,0.8)" />
      <rect x="16" y="36" width="16" height="4" rx="2" fill="white" stroke="rgba(255,255,255,0.6)" strokeWidth="0.5" />
      {/* Star */}
      <polygon points="24,13 26,18 31,18 27,21 28.5,26 24,23 19.5,26 21,21 17,18 22,18" fill="#fbbf24" stroke="#f59e0b" strokeWidth="0.5" />
    </svg>
  </div>
));
RankingIcon3D.displayName = 'RankingIcon3D';

export const HelperIcon3D = memo(() => (
  <div className="relative">
    <div className="absolute inset-0 bg-white/20 rounded-xl blur-md" />
    <svg viewBox="0 0 48 48" className={iconSize} style={{ filter: "drop-shadow(0 2px 4px rgba(0,0,0,0.4))" }}>
      {/* Headphone band */}
      <path d="M10 26 Q10 12 24 10 Q38 12 38 26" fill="none" stroke="white" strokeWidth="3.5" strokeLinecap="round" />
      {/* Left ear cup */}
      <rect x="5" y="24" width="9" height="14" rx="4.5" fill="white" stroke="rgba(255,255,255,0.8)" strokeWidth="0.8" />
      {/* Right ear cup */}
      <rect x="34" y="24" width="9" height="14" rx="4.5" fill="white" stroke="rgba(255,255,255,0.8)" strokeWidth="0.8" />
      {/* Mic arm */}
      <path d="M9 35 Q9 42 17 43 L19 43" stroke="rgba(255,255,255,0.8)" strokeWidth="2" fill="none" strokeLinecap="round" />
      {/* Mic head */}
      <circle cx="20" cy="43" r="3" fill="white" stroke="rgba(255,255,255,0.6)" strokeWidth="0.8" />
    </svg>
  </div>
));
HelperIcon3D.displayName = 'HelperIcon3D';

export const DiamondExchangeIcon3D = memo(() => (
  <div className="relative">
    <div className="absolute inset-0 bg-white/20 rounded-xl blur-md" />
    <svg viewBox="0 0 48 48" className={iconSize} style={{ filter: "drop-shadow(0 2px 4px rgba(0,0,0,0.4))" }}>
      {/* Back coin */}
      <circle cx="19" cy="24" r="12" fill="rgba(255,255,255,0.6)" stroke="rgba(255,255,255,0.4)" strokeWidth="0.8" />
      <circle cx="19" cy="24" r="9" fill="none" stroke="rgba(255,255,255,0.5)" strokeWidth="0.8" />
      <text x="19" y="28" fontSize="11" fontWeight="bold" fill="rgba(0,0,0,0.25)" textAnchor="middle">◆</text>
      {/* Front coin */}
      <circle cx="30" cy="22" r="12" fill="white" stroke="rgba(255,255,255,0.8)" strokeWidth="1" />
      <circle cx="30" cy="22" r="9" fill="none" stroke="rgba(0,0,0,0.1)" strokeWidth="0.8" />
      <text x="30" y="26" fontSize="12" fontWeight="bold" fill="#f59e0b" textAnchor="middle">$</text>
      {/* Exchange arrows */}
      <path d="M16 38 L28 38 M25 35 L28 38 L25 41" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M32 44 L20 44 M23 41 L20 44 L23 47" stroke="rgba(255,255,255,0.7)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  </div>
));
DiamondExchangeIcon3D.displayName = 'DiamondExchangeIcon3D';

export const PolicyIcon3D = memo(() => (
  <div className="relative">
    <div className="absolute inset-0 bg-white/20 rounded-xl blur-md" />
    <svg viewBox="0 0 48 48" className={iconSize} style={{ filter: "drop-shadow(0 2px 4px rgba(0,0,0,0.4))" }}>
      {/* Shield body */}
      <path d="M24 4 L38 12 L38 26 Q38 38 24 44 Q10 38 10 26 L10 12 Z" fill="white" stroke="rgba(255,255,255,0.8)" strokeWidth="0.8" />
      {/* Inner shield outline */}
      <path d="M24 10 L34 16 L34 26 Q34 34 24 38 Q14 34 14 26 L14 16 Z" fill="none" stroke="rgba(0,0,0,0.08)" strokeWidth="1" />
      {/* Checkmark */}
      <path d="M18 24 L22 28 L31 18" stroke="#22c55e" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" fill="none" />
    </svg>
  </div>
));
PolicyIcon3D.displayName = 'PolicyIcon3D';

export const HistoryIcon3D = memo(() => (
  <div className="relative">
    <div className="absolute inset-0 bg-white/20 rounded-xl blur-md" />
    <svg viewBox="0 0 48 48" className={iconSize} style={{ filter: "drop-shadow(0 2px 4px rgba(0,0,0,0.4))" }}>
      {/* Clock body */}
      <circle cx="24" cy="24" r="17" fill="white" stroke="rgba(255,255,255,0.8)" strokeWidth="0.8" />
      {/* Inner ring */}
      <circle cx="24" cy="24" r="14" fill="none" stroke="rgba(0,0,0,0.06)" strokeWidth="0.8" />
      {/* Hour markers */}
      {[0, 90, 180, 270].map((deg) => (
        <line key={deg} x1="24" y1="12" x2="24" y2="15" stroke="rgba(0,0,0,0.2)" strokeWidth="2" strokeLinecap="round"
          transform={`rotate(${deg} 24 24)`} />
      ))}
      {/* Clock hands */}
      <line x1="24" y1="24" x2="24" y2="15" stroke="rgba(0,0,0,0.3)" strokeWidth="2.5" strokeLinecap="round" />
      <line x1="24" y1="24" x2="31" y2="20" stroke="rgba(0,0,0,0.2)" strokeWidth="2" strokeLinecap="round" />
      {/* Center dot */}
      <circle cx="24" cy="24" r="2.5" fill="#f59e0b" />
      {/* Rewind arrow */}
      <path d="M9 9 L9 17 L17 17" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" fill="none" />
    </svg>
  </div>
));
HistoryIcon3D.displayName = 'HistoryIcon3D';
