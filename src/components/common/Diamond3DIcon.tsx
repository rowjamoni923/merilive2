import React from 'react';

interface Diamond3DIconProps {
  size?: number;
  className?: string;
}

const Diamond3DIcon: React.FC<Diamond3DIconProps> = ({ size = 24, className = '' }) => {
  return (
    <div 
      className={`relative inline-flex items-center justify-center ${className}`}
      style={{ width: size, height: size }}
    >
      {/* 3D Diamond Shape with realistic facets */}
      <svg 
        viewBox="0 0 64 64" 
        width={size} 
        height={size}
        className="drop-shadow-lg"
      >
        <defs>
          {/* Main diamond gradient - blue to purple */}
          <linearGradient id="diamondTop" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#E8F4FD" />
            <stop offset="30%" stopColor="#A5D8FF" />
            <stop offset="60%" stopColor="#74C0FC" />
            <stop offset="100%" stopColor="#4DABF7" />
          </linearGradient>
          
          {/* Left facet gradient */}
          <linearGradient id="diamondLeft" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#748FFC" />
            <stop offset="50%" stopColor="#5C7CFA" />
            <stop offset="100%" stopColor="#4C6EF5" />
          </linearGradient>
          
          {/* Right facet gradient */}
          <linearGradient id="diamondRight" x1="100%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="#9775FA" />
            <stop offset="50%" stopColor="#845EF7" />
            <stop offset="100%" stopColor="#7950F2" />
          </linearGradient>
          
          {/* Center facet gradient */}
          <linearGradient id="diamondCenter" x1="50%" y1="0%" x2="50%" y2="100%">
            <stop offset="0%" stopColor="#B197FC" />
            <stop offset="50%" stopColor="#9775FA" />
            <stop offset="100%" stopColor="#7C3AED" />
          </linearGradient>
          
          {/* Bottom point gradient */}
          <linearGradient id="diamondBottom" x1="50%" y1="0%" x2="50%" y2="100%">
            <stop offset="0%" stopColor="#6366F1" />
            <stop offset="100%" stopColor="#4338CA" />
          </linearGradient>
          
          {/* Highlight gradient */}
          <linearGradient id="diamondHighlight" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#FFFFFF" stopOpacity="0.9" />
            <stop offset="100%" stopColor="#FFFFFF" stopOpacity="0" />
          </linearGradient>
          
          {/* Sparkle filter */}
          <filter id="diamondGlow" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur in="SourceGraphic" stdDeviation="1" result="blur"/>
            <feMerge>
              <feMergeNode in="blur"/>
              <feMergeNode in="SourceGraphic"/>
            </feMerge>
          </filter>
          
          {/* Drop shadow */}
          <filter id="diamondShadow" x="-20%" y="-20%" width="140%" height="150%">
            <feDropShadow dx="1" dy="3" stdDeviation="2" floodColor="#4338CA" floodOpacity="0.4"/>
          </filter>
        </defs>
        
        <g filter="url(#diamondShadow)">
          {/* Diamond Crown (top part) */}
          {/* Top facet - brightest */}
          <polygon 
            points="32,6 20,20 32,20 44,20"
            fill="url(#diamondTop)"
            stroke="#A5D8FF"
            strokeWidth="0.5"
          />
          
          {/* Top left crown facet */}
          <polygon 
            points="8,20 20,20 32,6"
            fill="url(#diamondLeft)"
            stroke="#748FFC"
            strokeWidth="0.5"
          />
          
          {/* Top right crown facet */}
          <polygon 
            points="56,20 44,20 32,6"
            fill="url(#diamondRight)"
            stroke="#9775FA"
            strokeWidth="0.5"
          />
          
          {/* Girdle (middle band) */}
          {/* Left girdle section */}
          <polygon 
            points="8,20 20,20 16,26 4,26"
            fill="#5C7CFA"
            stroke="#4C6EF5"
            strokeWidth="0.3"
          />
          
          {/* Center left girdle */}
          <polygon 
            points="20,20 32,20 28,26 16,26"
            fill="#7C3AED"
            stroke="#6D28D9"
            strokeWidth="0.3"
          />
          
          {/* Center right girdle */}
          <polygon 
            points="32,20 44,20 48,26 36,26"
            fill="#8B5CF6"
            stroke="#7C3AED"
            strokeWidth="0.3"
          />
          
          {/* Right girdle section */}
          <polygon 
            points="44,20 56,20 60,26 48,26"
            fill="#9775FA"
            stroke="#845EF7"
            strokeWidth="0.3"
          />
          
          {/* Pavilion (bottom part) */}
          {/* Left pavilion main facet */}
          <polygon 
            points="4,26 16,26 32,58"
            fill="url(#diamondLeft)"
            stroke="#4C6EF5"
            strokeWidth="0.5"
          />
          
          {/* Center left pavilion facet */}
          <polygon 
            points="16,26 28,26 32,58"
            fill="url(#diamondCenter)"
            stroke="#7C3AED"
            strokeWidth="0.5"
          />
          
          {/* Center right pavilion facet */}
          <polygon 
            points="28,26 36,26 32,58"
            fill="url(#diamondBottom)"
            stroke="#6366F1"
            strokeWidth="0.5"
          />
          
          {/* Right pavilion center facet */}
          <polygon 
            points="36,26 48,26 32,58"
            fill="url(#diamondCenter)"
            stroke="#7C3AED"
            strokeWidth="0.5"
          />
          
          {/* Right pavilion main facet */}
          <polygon 
            points="48,26 60,26 32,58"
            fill="url(#diamondRight)"
            stroke="#845EF7"
            strokeWidth="0.5"
          />
          
          {/* Highlights for 3D effect */}
          {/* Top shine */}
          <polygon 
            points="32,6 28,14 36,14"
            fill="url(#diamondHighlight)"
          />
          
          {/* Left crown highlight */}
          <polygon 
            points="14,12 18,18 24,14"
            fill="white"
            opacity="0.4"
          />
          
          {/* Sparkle points */}
          <circle cx="32" cy="10" r="1.5" fill="white" opacity="0.9" filter="url(#diamondGlow)"/>
          <circle cx="22" cy="16" r="1" fill="white" opacity="0.7"/>
          <circle cx="42" cy="16" r="1" fill="white" opacity="0.6"/>
          <circle cx="16" cy="24" r="0.8" fill="white" opacity="0.5"/>
          <circle cx="48" cy="24" r="0.8" fill="white" opacity="0.5"/>
        </g>
      </svg>
    </div>
  );
};

export default Diamond3DIcon;
