const TreasureChestIcon = ({ size = 64 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 200 200" fill="none" xmlns="http://www.w3.org/2000/svg">
    <defs>
      {/* Chest body gradient - deep royal purple/blue */}
      <linearGradient id="chestBody" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor="#4A2D8B" />
        <stop offset="30%" stopColor="#2D1B69" />
        <stop offset="70%" stopColor="#1A0E45" />
        <stop offset="100%" stopColor="#0D0726" />
      </linearGradient>
      {/* Chest lid gradient */}
      <linearGradient id="chestLid" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor="#6B3FA0" />
        <stop offset="40%" stopColor="#4A2D8B" />
        <stop offset="100%" stopColor="#2D1B69" />
      </linearGradient>
      {/* Gold trim */}
      <linearGradient id="goldTrim" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stopColor="#FFE87C" />
        <stop offset="25%" stopColor="#FFD700" />
        <stop offset="50%" stopColor="#FFF8DC" />
        <stop offset="75%" stopColor="#FFD700" />
        <stop offset="100%" stopColor="#DAA520" />
      </linearGradient>
      {/* Gold trim dark */}
      <linearGradient id="goldDark" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor="#FFD700" />
        <stop offset="100%" stopColor="#B8860B" />
      </linearGradient>
      {/* Inner magical glow */}
      <radialGradient id="magicGlow" cx="50%" cy="20%" r="80%">
        <stop offset="0%" stopColor="#FFE87C" stopOpacity="1" />
        <stop offset="30%" stopColor="#FFD700" stopOpacity="0.7" />
        <stop offset="60%" stopColor="#FF8C00" stopOpacity="0.3" />
        <stop offset="100%" stopColor="#4A2D8B" stopOpacity="0" />
      </radialGradient>
      {/* Gem colors */}
      <linearGradient id="gemCyan" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stopColor="#E0FFFF" />
        <stop offset="50%" stopColor="#00CED1" />
        <stop offset="100%" stopColor="#008B8B" />
      </linearGradient>
      <linearGradient id="gemRuby" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stopColor="#FFB3B3" />
        <stop offset="50%" stopColor="#FF1744" />
        <stop offset="100%" stopColor="#B71C1C" />
      </linearGradient>
      <linearGradient id="gemEmerald" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stopColor="#B2FFB2" />
        <stop offset="50%" stopColor="#00E676" />
        <stop offset="100%" stopColor="#1B5E20" />
      </linearGradient>
      <linearGradient id="gemAmethyst" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stopColor="#E1BEE7" />
        <stop offset="50%" stopColor="#AB47BC" />
        <stop offset="100%" stopColor="#6A1B9A" />
      </linearGradient>
      {/* Outer glow filter */}
      <filter id="outerGlow" x="-40%" y="-40%" width="180%" height="180%">
        <feGaussianBlur stdDeviation="6" result="blur" />
        <feFlood floodColor="#FFD700" floodOpacity="0.4" />
        <feComposite in2="blur" operator="in" result="colorBlur" />
        <feMerge>
          <feMergeNode in="colorBlur" />
          <feMergeNode in="SourceGraphic" />
        </feMerge>
      </filter>
      <filter id="gemGlow" x="-60%" y="-60%" width="220%" height="220%">
        <feGaussianBlur stdDeviation="3" result="blur" />
        <feMerge>
          <feMergeNode in="blur" />
          <feMergeNode in="SourceGraphic" />
        </feMerge>
      </filter>
      <filter id="softGlow" x="-20%" y="-20%" width="140%" height="140%">
        <feGaussianBlur stdDeviation="2" />
      </filter>
      {/* Metal shine */}
      <linearGradient id="metalShine" x1="0" y1="0" x2="1" y2="0">
        <stop offset="0%" stopColor="white" stopOpacity="0" />
        <stop offset="45%" stopColor="white" stopOpacity="0" />
        <stop offset="50%" stopColor="white" stopOpacity="0.6" />
        <stop offset="55%" stopColor="white" stopOpacity="0" />
        <stop offset="100%" stopColor="white" stopOpacity="0" />
      </linearGradient>
    </defs>

    {/* Ground shadow */}
    <ellipse cx="100" cy="170" rx="65" ry="10" fill="#4A2D8B" opacity="0.3">
      <animate attributeName="rx" values="60;68;60" dur="2.5s" repeatCount="indefinite" />
    </ellipse>

    {/* ===== CHEST BODY ===== */}
    <g filter="url(#outerGlow)">
      {/* Main body */}
      <rect x="30" y="100" width="140" height="60" rx="6" fill="url(#chestBody)" stroke="url(#goldTrim)" strokeWidth="2.5" />
      
      {/* Body panels - 3D depth */}
      <rect x="32" y="102" width="136" height="56" rx="5" fill="none" stroke="#4A2D8B" strokeWidth="1" opacity="0.5" />
      
      {/* Horizontal gold bands */}
      <rect x="30" y="100" width="140" height="4" rx="2" fill="url(#goldTrim)" />
      <rect x="30" y="126" width="140" height="3" rx="1.5" fill="url(#goldDark)" opacity="0.7" />
      <rect x="30" y="156" width="140" height="4" rx="2" fill="url(#goldTrim)" />
      
      {/* Vertical gold bands */}
      <rect x="60" y="100" width="3" height="60" fill="url(#goldDark)" opacity="0.5" />
      <rect x="137" y="100" width="3" height="60" fill="url(#goldDark)" opacity="0.5" />
      
      {/* Center lock plate */}
      <rect x="88" y="108" width="24" height="30" rx="5" fill="url(#goldTrim)" stroke="#B8860B" strokeWidth="1.5" />
      <rect x="90" y="110" width="20" height="26" rx="4" fill="url(#chestBody)" stroke="#DAA520" strokeWidth="0.5" />
      {/* Keyhole */}
      <circle cx="100" cy="120" r="4" fill="url(#goldTrim)" />
      <circle cx="100" cy="120" r="2.5" fill="#1A0E45" />
      <rect x="99" y="120" width="2" height="8" rx="1" fill="#1A0E45" />
      
      {/* Corner rivets */}
      {[{x:38, y:108}, {x:162, y:108}, {x:38, y:152}, {x:162, y:152}].map((p, i) => (
        <g key={`rivet-${i}`}>
          <circle cx={p.x} cy={p.y} r="4" fill="url(#goldTrim)" stroke="#B8860B" strokeWidth="0.8" />
          <circle cx={p.x - 1} cy={p.y - 1} r="1.5" fill="white" opacity="0.4" />
        </g>
      ))}
      
      {/* Side handles */}
      <ellipse cx="20" cy="130" rx="5" ry="12" fill="none" stroke="url(#goldTrim)" strokeWidth="3" />
      <ellipse cx="180" cy="130" rx="5" ry="12" fill="none" stroke="url(#goldTrim)" strokeWidth="3" />
    </g>

    {/* ===== OPEN LID ===== */}
    <g filter="url(#outerGlow)">
      <path d="M28 100 C28 70, 45 40, 100 36 C155 40, 172 70, 172 100 Z" fill="url(#chestLid)" stroke="url(#goldTrim)" strokeWidth="2.5" />
      {/* Lid inner arc detail */}
      <path d="M34 96 C34 72, 50 48, 100 44 C150 48, 166 72, 166 96" fill="none" stroke="url(#goldDark)" strokeWidth="1.5" opacity="0.6" />
      <path d="M40 92 C40 74, 54 54, 100 50 C146 54, 160 74, 160 92" fill="none" stroke="#FFE87C" strokeWidth="0.8" opacity="0.3" />
      
      {/* Lid studs */}
      {[{x:60, y:65}, {x:100, y:52}, {x:140, y:65}].map((p, i) => (
        <g key={`stud-${i}`}>
          <circle cx={p.x} cy={p.y} r="4" fill="url(#goldTrim)" stroke="#B8860B" strokeWidth="0.8" />
          <circle cx={p.x - 1} cy={p.y - 1} r="1.5" fill="white" opacity="0.5" />
        </g>
      ))}
      
      {/* Shining sweep on lid */}
      <path d="M28 100 C28 70, 45 40, 100 36 C155 40, 172 70, 172 100 Z" fill="url(#metalShine)" opacity="0.6">
        <animate attributeName="opacity" values="0;0.6;0" dur="3s" repeatCount="indefinite" />
      </path>
    </g>

    {/* ===== MAGICAL INNER GLOW ===== */}
    <ellipse cx="100" cy="85" rx="55" ry="30" fill="url(#magicGlow)" opacity="0.9">
      <animate attributeName="opacity" values="0.7;1;0.7" dur="2s" repeatCount="indefinite" />
    </ellipse>

    {/* ===== GEMS & TREASURES ===== */}
    {/* Central large diamond - cyan */}
    <g filter="url(#gemGlow)">
      <path d="M92 70 L100 48 L108 70 L100 82 Z" fill="url(#gemCyan)" opacity="0.95">
        <animateTransform attributeName="transform" type="translate" values="0,0; 0,-4; 0,0" dur="2s" repeatCount="indefinite" />
      </path>
      <path d="M100 48 L108 70 L100 82" fill="white" opacity="0.25" />
      <path d="M96 60 L100 52 L104 60" fill="white" opacity="0.4" />
    </g>

    {/* Ruby gem left */}
    <g filter="url(#gemGlow)">
      <path d="M62 80 L68 66 L74 80 L68 90 Z" fill="url(#gemRuby)" opacity="0.9">
        <animateTransform attributeName="transform" type="translate" values="0,0; -2,-3; 0,0" dur="2.5s" repeatCount="indefinite" />
      </path>
      <path d="M65 74 L68 68 L71 74" fill="white" opacity="0.35" />
    </g>

    {/* Emerald gem right */}
    <g filter="url(#gemGlow)">
      <path d="M126 78 L132 64 L138 78 L132 89 Z" fill="url(#gemEmerald)" opacity="0.9">
        <animateTransform attributeName="transform" type="translate" values="0,0; 2,-3; 0,0" dur="3s" repeatCount="indefinite" />
      </path>
      <path d="M129 72 L132 66 L135 72" fill="white" opacity="0.35" />
    </g>

    {/* Amethyst gem */}
    <g filter="url(#gemGlow)">
      <path d="M80 86 L84 78 L88 86 L84 92 Z" fill="url(#gemAmethyst)" opacity="0.85">
        <animateTransform attributeName="transform" type="translate" values="0,0; -1,-2; 0,0" dur="1.8s" repeatCount="indefinite" />
      </path>
    </g>

    {/* Small golden gem */}
    <path d="M114 84 L118 76 L122 84 L118 91 Z" fill="#FFD700" opacity="0.85">
      <animateTransform attributeName="transform" type="translate" values="0,0; 1,-2; 0,0" dur="2.2s" repeatCount="indefinite" />
    </path>

    {/* Gold coins pile */}
    {[
      {cx:48, cy:94, rx:7, ry:3.5},
      {cx:152, cy:94, rx:7, ry:3.5},
      {cx:72, cy:96, rx:6, ry:3},
      {cx:128, cy:96, rx:6, ry:3},
      {cx:56, cy:98, rx:5, ry:2.5},
      {cx:144, cy:98, rx:5, ry:2.5},
    ].map((c, i) => (
      <g key={`coin-${i}`}>
        <ellipse cx={c.cx} cy={c.cy} rx={c.rx} ry={c.ry} fill="url(#goldDark)" stroke="#B8860B" strokeWidth="0.5" opacity={0.9 - i * 0.05} />
        <ellipse cx={c.cx} cy={c.cy - 0.5} rx={c.rx - 1.5} ry={c.ry - 1} fill="url(#goldTrim)" opacity="0.4" />
      </g>
    ))}

    {/* ===== LIGHT RAYS from chest ===== */}
    <g opacity="0.5">
      {[0, 30, 60, 90, 120, 150, 180].map((angle, i) => (
        <line
          key={`ray-${i}`}
          x1="100"
          y1="75"
          x2={100 + Math.cos((angle - 90) * Math.PI / 180) * 50}
          y2={75 + Math.sin((angle - 90) * Math.PI / 180) * 35}
          stroke="#FFD700"
          strokeWidth="1"
          strokeLinecap="round"
          opacity="0.4"
        >
          <animate attributeName="opacity" values="0.1;0.5;0.1" dur={`${1.5 + i * 0.3}s`} repeatCount="indefinite" />
        </line>
      ))}
    </g>

    {/* ===== SPARKLE STARS ===== */}
    {[
      {x:50, y:35, r:2.5, color:"#FFD700", dur:"2s"},
      {x:150, y:30, r:2, color:"#00CED1", dur:"2.5s"},
      {x:100, y:22, r:3, color:"#FF1744", dur:"1.7s"},
      {x:75, y:42, r:1.8, color:"#AB47BC", dur:"2.2s"},
      {x:130, y:38, r:2, color:"#00E676", dur:"1.9s"},
      {x:60, y:28, r:1.5, color:"#FFE87C", dur:"2.8s"},
      {x:140, y:25, r:1.5, color:"#FF69B4", dur:"2.1s"},
    ].map((s, i) => (
      <g key={`sparkle-${i}`}>
        {/* Star cross */}
        <line x1={s.x} y1={s.y - s.r * 2} x2={s.x} y2={s.y + s.r * 2} stroke={s.color} strokeWidth="1.5" strokeLinecap="round">
          <animate attributeName="opacity" values="0.2;1;0.2" dur={s.dur} repeatCount="indefinite" />
        </line>
        <line x1={s.x - s.r * 2} y1={s.y} x2={s.x + s.r * 2} y2={s.y} stroke={s.color} strokeWidth="1.5" strokeLinecap="round">
          <animate attributeName="opacity" values="0.2;1;0.2" dur={s.dur} repeatCount="indefinite" />
        </line>
        {/* Center dot */}
        <circle cx={s.x} cy={s.y} r={s.r * 0.6} fill={s.color}>
          <animate attributeName="r" values={`${s.r * 0.3};${s.r * 0.8};${s.r * 0.3}`} dur={s.dur} repeatCount="indefinite" />
          <animate attributeName="opacity" values="0.4;1;0.4" dur={s.dur} repeatCount="indefinite" />
        </circle>
      </g>
    ))}

    {/* ===== FLOATING PARTICLES ===== */}
    {[
      {x:45, y:60, color:"#FFD700"},
      {x:155, y:55, color:"#FFD700"},
      {x:80, y:45, color:"#FFE87C"},
      {x:120, y:42, color:"#FFE87C"},
      {x:65, y:50, color:"#FFA500"},
      {x:135, y:48, color:"#FFA500"},
    ].map((p, i) => (
      <circle key={`particle-${i}`} cx={p.x} cy={p.y} r="1.5" fill={p.color}>
        <animateTransform attributeName="transform" type="translate" 
          values={`0,0; ${(Math.random()-0.5)*10},-${10+Math.random()*10}; 0,0`} 
          dur={`${2+Math.random()*2}s`} repeatCount="indefinite" />
        <animate attributeName="opacity" values="0;0.8;0" dur={`${2+Math.random()*2}s`} repeatCount="indefinite" />
      </circle>
    ))}
  </svg>
);

export default TreasureChestIcon;
