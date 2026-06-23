// Premium 3D animated golden trophy for leaderboard button
// Pure inline SVG — no extra deps. Uses radial/linear gradients,
// specular highlights, gem, ribbon and a slow idle rotation + sheen sweep.
export const Trophy3D = ({ size = 44 }: { size?: number }) => {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      xmlns="http://www.w3.org/2000/svg"
      className="trophy3d-root"
      aria-hidden
    >
      <defs>
        {/* Cup body gold */}
        <radialGradient id="t3d-cup" cx="35%" cy="28%" r="80%">
          <stop offset="0%" stopColor="#fff6c9" />
          <stop offset="18%" stopColor="#ffe079" />
          <stop offset="48%" stopColor="#f4ad24" />
          <stop offset="78%" stopColor="#b06a13" />
          <stop offset="100%" stopColor="#5a3208" />
        </radialGradient>
        {/* Rim ring */}
        <linearGradient id="t3d-rim" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#fff4b8" />
          <stop offset="50%" stopColor="#f6c43a" />
          <stop offset="100%" stopColor="#8a4d0c" />
        </linearGradient>
        {/* Base */}
        <linearGradient id="t3d-base" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#ffe282" />
          <stop offset="55%" stopColor="#cf8516" />
          <stop offset="100%" stopColor="#3d1f04" />
        </linearGradient>
        {/* Handle */}
        <linearGradient id="t3d-handle" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#fff0a6" />
          <stop offset="60%" stopColor="#dd9418" />
          <stop offset="100%" stopColor="#5a3208" />
        </linearGradient>
        {/* Gem */}
        <radialGradient id="t3d-gem" cx="35%" cy="30%" r="80%">
          <stop offset="0%" stopColor="#ffffff" />
          <stop offset="25%" stopColor="#ff8fb8" />
          <stop offset="70%" stopColor="#c3155a" />
          <stop offset="100%" stopColor="#5a0726" />
        </radialGradient>
        {/* Sheen sweep mask path region */}
        <linearGradient id="t3d-sheen" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%" stopColor="#ffffff" stopOpacity="0" />
          <stop offset="50%" stopColor="#ffffff" stopOpacity="0.85" />
          <stop offset="100%" stopColor="#ffffff" stopOpacity="0" />
        </linearGradient>
        <clipPath id="t3d-cup-clip">
          <path d="M18 14 H46 V20 C46 32 41 40 32 41 C23 40 18 32 18 20 Z" />
        </clipPath>
      </defs>

      {/* soft ground shadow */}
      <ellipse cx="32" cy="58" rx="16" ry="2.4" fill="rgba(0,0,0,0.35)" />

      {/* Handles */}
      <path
        d="M18 18 C10 18 8 28 16 32 L18 28 C13 26 14 22 18 22 Z"
        fill="url(#t3d-handle)"
        stroke="#3a1f05"
        strokeWidth="0.6"
      />
      <path
        d="M46 18 C54 18 56 28 48 32 L46 28 C51 26 50 22 46 22 Z"
        fill="url(#t3d-handle)"
        stroke="#3a1f05"
        strokeWidth="0.6"
      />

      {/* Cup body */}
      <path
        d="M18 14 H46 V20 C46 32 41 40 32 41 C23 40 18 32 18 20 Z"
        fill="url(#t3d-cup)"
        stroke="#3a1f05"
        strokeWidth="0.7"
      />
      {/* Rim band */}
      <rect x="17" y="12.5" width="30" height="4" rx="1.5" fill="url(#t3d-rim)" stroke="#3a1f05" strokeWidth="0.5" />
      {/* inner shadow inside cup top */}
      <ellipse cx="32" cy="15" rx="13" ry="1.6" fill="rgba(0,0,0,0.45)" />
      {/* left highlight on cup */}
      <path
        d="M22 17 C20.5 24 22 31 26 36"
        stroke="rgba(255,255,255,0.55)"
        strokeWidth="1.4"
        fill="none"
        strokeLinecap="round"
      />

      {/* Gem on the cup */}
      <g>
        <circle cx="32" cy="26" r="3.2" fill="url(#t3d-gem)" stroke="#3a0414" strokeWidth="0.5" />
        <circle cx="30.8" cy="24.6" r="0.9" fill="#ffffff" opacity="0.9" />
      </g>

      {/* Sheen sweep over the cup (animated) */}
      <g clipPath="url(#t3d-cup-clip)">
        <rect className="t3d-sheen" x="-30" y="10" width="18" height="40" fill="url(#t3d-sheen)" transform="skewX(-18)" />
      </g>

      {/* Stem */}
      <path d="M29 41 H35 V47 H29 Z" fill="url(#t3d-base)" stroke="#3a1f05" strokeWidth="0.5" />
      {/* Pedestal */}
      <path d="M23 47 H41 L43 51 H21 Z" fill="url(#t3d-base)" stroke="#3a1f05" strokeWidth="0.6" />
      {/* Base plate */}
      <rect x="20" y="51" width="24" height="4" rx="1.2" fill="url(#t3d-base)" stroke="#3a1f05" strokeWidth="0.6" />
      {/* base highlight */}
      <rect x="21.5" y="51.6" width="21" height="0.8" rx="0.4" fill="rgba(255,255,255,0.55)" />

      {/* sparkles */}
      <g className="t3d-spark1">
        <path d="M12 10 l1 2 l2 1 l-2 1 l-1 2 l-1 -2 l-2 -1 l2 -1 z" fill="#fff7c2" />
      </g>
      <g className="t3d-spark2">
        <path d="M52 8 l0.7 1.5 l1.5 0.7 l-1.5 0.7 l-0.7 1.5 l-0.7 -1.5 l-1.5 -0.7 l1.5 -0.7 z" fill="#fff7c2" />
      </g>
    </svg>
  );
};

export default Trophy3D;
