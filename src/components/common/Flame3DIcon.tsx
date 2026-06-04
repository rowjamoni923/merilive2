import React from 'react';

interface Flame3DIconProps {
  size?: number;
  className?: string;
}

const Flame3DIcon: React.FC<Flame3DIconProps> = ({ size = 24, className = '' }) => {
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
          <linearGradient id={`flameGrad${uniqueId}`} x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="#FFEB3B" />
            <stop offset="40%" stopColor="#FF9800" />
            <stop offset="100%" stopColor="#F44336" />
          </linearGradient>
        </defs>
        <path 
          d="M 32 4 C 32 4, 12 24, 12 42 C 12 52, 21 60, 32 60 C 43 60, 52 52, 52 42 C 52 24, 32 4 Z" 
          fill={`url(#flameGrad${uniqueId})`}
        />
        <path 
          d="M 32 20 C 32 20, 20 32, 20 44 C 20 50, 25 54, 32 54 C 39 54, 44 50, 44 44 C 44 32, 32 20 Z" 
          fill="#FFF176" 
          opacity="0.6"
        />
      </svg>
    </div>
  );
};

export default Flame3DIcon;
