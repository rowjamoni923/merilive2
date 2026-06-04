import React from 'react';

interface Star3DIconProps {
  size?: number;
  className?: string;
}

const Star3DIcon: React.FC<Star3DIconProps> = ({ size = 24, className = '' }) => {
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
          <linearGradient id={`starGold${uniqueId}`} x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#FFE082" />
            <stop offset="50%" stopColor="#FFC107" />
            <stop offset="100%" stopColor="#FFA000" />
          </linearGradient>
        </defs>
        <path 
          d="M 32 4 L 40 24 L 62 24 L 44 38 L 50 60 L 32 46 L 14 60 L 20 38 L 2 24 L 24 24 Z" 
          fill={`url(#starGold${uniqueId})`}
          stroke="#FFB300"
          strokeWidth="0.5"
        />
        <path 
          d="M 32 8 L 38 26 L 58 26 L 42 38 L 48 56 L 32 44" 
          fill="none" 
          stroke="white" 
          strokeWidth="1" 
          opacity="0.4"
        />
      </svg>
    </div>
  );
};

export default Star3DIcon;
