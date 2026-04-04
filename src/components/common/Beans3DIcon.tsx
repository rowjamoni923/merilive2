import React from 'react';

interface Beans3DIconProps {
  size?: number;
  className?: string;
}

const Beans3DIcon: React.FC<Beans3DIconProps> = ({ size = 24, className = '' }) => {
  // Generate unique IDs for this instance to avoid conflicts when multiple icons are rendered
  const uniqueId = React.useId().replace(/:/g, '');
  
  return (
    <div 
      className={`relative inline-flex items-center justify-center ${className}`}
      style={{ width: size, height: size }}
    >
      {/* Premium 3D Golden Bean - Chamet/Poppo Style */}
      <svg 
        viewBox="0 0 64 64" 
        width={size} 
        height={size}
        className="drop-shadow-lg"
      >
        <defs>
          {/* Premium metallic gold gradient */}
          <linearGradient id={`beanGold${uniqueId}`} x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#FFE55C" />
            <stop offset="15%" stopColor="#FFD700" />
            <stop offset="35%" stopColor="#FFC107" />
            <stop offset="50%" stopColor="#FFB300" />
            <stop offset="70%" stopColor="#FF9800" />
            <stop offset="100%" stopColor="#E65100" />
          </linearGradient>
          
          {/* Shine/highlight gradient */}
          <linearGradient id={`beanShine${uniqueId}`} x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#FFFFFF" stopOpacity="0.9" />
            <stop offset="30%" stopColor="#FFFACD" stopOpacity="0.6" />
            <stop offset="100%" stopColor="#FFD700" stopOpacity="0" />
          </linearGradient>
          
          {/* Inner glow for depth */}
          <radialGradient id={`beanInner${uniqueId}`} cx="40%" cy="35%" r="60%">
            <stop offset="0%" stopColor="#FFEB3B" />
            <stop offset="40%" stopColor="#FFC107" />
            <stop offset="100%" stopColor="#FF8F00" />
          </radialGradient>
          
          {/* 3D shadow gradient */}
          <linearGradient id={`beanShadowGrad${uniqueId}`} x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#B8860B" stopOpacity="0.2" />
            <stop offset="100%" stopColor="#8B4513" stopOpacity="0.6" />
          </linearGradient>
          
          {/* Enhanced drop shadow filter */}
          <filter id={`premiumShadow${uniqueId}`} x="-30%" y="-30%" width="160%" height="160%">
            <feDropShadow dx="1" dy="2" stdDeviation="2" floodColor="#B8860B" floodOpacity="0.5"/>
            <feDropShadow dx="2" dy="4" stdDeviation="3" floodColor="#8B4513" floodOpacity="0.3"/>
          </filter>
          
          {/* Glow effect */}
          <filter id={`beanGlow${uniqueId}`} x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="2" result="blur"/>
            <feFlood floodColor="#FFD700" floodOpacity="0.4"/>
            <feComposite in2="blur" operator="in"/>
            <feMerge>
              <feMergeNode/>
              <feMergeNode in="SourceGraphic"/>
            </feMerge>
          </filter>
        </defs>
        
        {/* Base shadow ellipse */}
        <ellipse 
          cx="33" 
          cy="50" 
          rx="16" 
          ry="6" 
          fill="#8B4513"
          opacity="0.25"
        />
        
        {/* Main bean group with filters */}
        <g filter={`url(#premiumShadow${uniqueId})`}>
          {/* Back/shadow bean layer */}
          <ellipse 
            cx="33" 
            cy="34" 
            rx="19" 
            ry="21" 
            fill={`url(#beanShadowGrad${uniqueId})`}
          />
          
          {/* Main bean body - premium kidney shape */}
          <path 
            d="M 18 14 
               C 6 16, 4 32, 12 44 
               C 18 54, 30 56, 38 50 
               C 32 44, 30 36, 32 28 
               C 34 20, 42 16, 50 20 
               C 54 12, 34 8, 18 14 Z"
            fill={`url(#beanInner${uniqueId})`}
            stroke="#D4A800"
            strokeWidth="0.5"
          />
          
          {/* Second bean lobe with metallic finish */}
          <path 
            d="M 32 28 
               C 30 36, 32 44, 38 50 
               C 46 56, 58 52, 56 40 
               C 54 28, 50 20, 50 20 
               C 42 16, 34 20, 32 28 Z"
            fill={`url(#beanGold${uniqueId})`}
            stroke="#D4A800"
            strokeWidth="0.5"
          />
          
          {/* Center crease for 3D depth */}
          <path 
            d="M 33 26 Q 30 36, 38 50"
            fill="none"
            stroke="#B8860B"
            strokeWidth="1.5"
            strokeLinecap="round"
            opacity="0.5"
          />
          
          {/* Premium top highlight - left lobe */}
          <ellipse 
            cx="22" 
            cy="22" 
            rx="9" 
            ry="7" 
            fill={`url(#beanShine${uniqueId})`}
          />
          
          {/* Premium top highlight - right lobe */}
          <ellipse 
            cx="44" 
            cy="26" 
            rx="7" 
            ry="6" 
            fill={`url(#beanShine${uniqueId})`}
            opacity="0.8"
          />
          
          {/* Sharp white shine spots for metallic effect */}
          <circle cx="17" cy="18" r="2.5" fill="white" opacity="0.95" />
          <circle cx="24" cy="21" r="1.5" fill="white" opacity="0.7" />
          <circle cx="42" cy="23" r="2" fill="white" opacity="0.85" />
          <circle cx="48" cy="28" r="1" fill="white" opacity="0.6" />
          
          {/* Subtle reflection lines */}
          <path 
            d="M 14 24 Q 18 20, 26 22"
            fill="none"
            stroke="white"
            strokeWidth="1"
            strokeLinecap="round"
            opacity="0.4"
          />
          <path 
            d="M 40 22 Q 46 20, 52 26"
            fill="none"
            stroke="white"
            strokeWidth="0.8"
            strokeLinecap="round"
            opacity="0.35"
          />
        </g>
      </svg>
    </div>
  );
};

export default Beans3DIcon;
