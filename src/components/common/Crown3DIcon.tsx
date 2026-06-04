import React from 'react';

interface Crown3DIconProps {
  size?: number;
  className?: string;
}

const Crown3DIcon: React.FC<Crown3DIconProps> = ({ size = 24, className = '' }) => {
  const uniqueId = React.useId().replace(/:/g, '');
  
  return (
    <div 
      className={`relative inline-flex items-center justify-center ${className}`}
      style={{ width: size, height: size }}
    >
      <svg 
        viewBox="0 0 64 64" 
        width={size} 
        height={size}
        className="drop-shadow-lg"
      >
        <defs>
          <linearGradient id={`crownGold${uniqueId}`} x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#FFD54F" />
            <stop offset="50%" stopColor="#FFB300" />
            <stop offset="100%" stopColor="#F57C00" />
          </linearGradient>
        </defs>
        <path 
          d="M 10 50 L 54 50 L 60 20 L 45 35 L 32 10 L 19 35 L 4 20 Z" 
          fill={`url(#crownGold${uniqueId})`}
          stroke="#E65100"
          strokeWidth="0.5"
        />
        <rect x="10" y="50" width="44" height="6" rx="2" fill="#E65100" />
        <circle cx="32" cy="10" r="3" fill="#FFEE58" />
        <circle cx="4" cy="20" r="3" fill="#FFEE58" />
        <circle cx="60" cy="20" r="3" fill="#FFEE58" />
      </svg>
    </div>
  );
};

export default Crown3DIcon;
