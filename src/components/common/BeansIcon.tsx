import React from 'react';

interface BeansIconProps {
  size?: number;
  className?: string;
}

/**
 * Inline Beans Icon - optimized for use in text contexts
 * Use this instead of 🫘 emoji for consistent branding
 */
const BeansIcon: React.FC<BeansIconProps> = ({ size = 16, className = '' }) => {
  const uniqueId = React.useId().replace(/:/g, '');
  
  return (
    <span 
      className={`inline-flex items-center justify-center align-middle ${className}`}
      style={{ width: size, height: size }}
    >
      <svg 
        viewBox="0 0 64 64" 
        width={size} 
        height={size}
      >
        <defs>
          <linearGradient id={`inlineGold${uniqueId}`} x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#FFE55C" />
            <stop offset="35%" stopColor="#FFC107" />
            <stop offset="70%" stopColor="#FF9800" />
            <stop offset="100%" stopColor="#E65100" />
          </linearGradient>
          <radialGradient id={`inlineInner${uniqueId}`} cx="40%" cy="35%" r="60%">
            <stop offset="0%" stopColor="#FFEB3B" />
            <stop offset="100%" stopColor="#FF8F00" />
          </radialGradient>
          <linearGradient id={`inlineShine${uniqueId}`} x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#FFFFFF" stopOpacity="0.8" />
            <stop offset="100%" stopColor="#FFD700" stopOpacity="0" />
          </linearGradient>
        </defs>
        
        <g>
          <path 
            d="M 18 14 
               C 6 16, 4 32, 12 44 
               C 18 54, 30 56, 38 50 
               C 32 44, 30 36, 32 28 
               C 34 20, 42 16, 50 20 
               C 54 12, 34 8, 18 14 Z"
            fill={`url(#inlineInner${uniqueId})`}
          />
          <path 
            d="M 32 28 
               C 30 36, 32 44, 38 50 
               C 46 56, 58 52, 56 40 
               C 54 28, 50 20, 50 20 
               C 42 16, 34 20, 32 28 Z"
            fill={`url(#inlineGold${uniqueId})`}
          />
          <path 
            d="M 33 26 Q 30 36, 38 50"
            fill="none"
            stroke="#B8860B"
            strokeWidth="1.5"
            strokeLinecap="round"
            opacity="0.5"
          />
          <ellipse 
            cx="22" cy="22" rx="8" ry="6" 
            fill={`url(#inlineShine${uniqueId})`}
          />
          <ellipse 
            cx="44" cy="26" rx="6" ry="5" 
            fill={`url(#inlineShine${uniqueId})`}
            opacity="0.7"
          />
          <circle cx="17" cy="18" r="2" fill="white" opacity="0.9" />
          <circle cx="42" cy="23" r="1.5" fill="white" opacity="0.8" />
        </g>
      </svg>
    </span>
  );
};

export default BeansIcon;
