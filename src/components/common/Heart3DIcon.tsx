import React from 'react';

interface Heart3DIconProps {
  size?: number;
  className?: string;
}

const Heart3DIcon: React.FC<Heart3DIconProps> = ({ size = 24, className = '' }) => {
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
          <linearGradient id={`heartRed${uniqueId}`} x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#FF6B6B" />
            <stop offset="50%" stopColor="#FF4B4B" />
            <stop offset="100%" stopColor="#D83131" />
          </linearGradient>
          <radialGradient id={`heartShine${uniqueId}`} cx="35%" cy="30%" r="50%">
            <stop offset="0%" stopColor="#FFFFFF" stopOpacity="0.8" />
            <stop offset="100%" stopColor="#FFFFFF" stopOpacity="0" />
          </radialGradient>
        </defs>
        <path 
          d="M 32 56 C 32 56 6 40 6 22 C 6 12 14 6 22 6 C 26 6 30 8 32 12 C 34 8 38 6 42 6 C 50 6 58 12 58 22 C 58 40 32 56 32 56 Z" 
          fill={`url(#heartRed${uniqueId})`}
        />
        <path 
          d="M 22 10 C 16 10 10 15 10 22 C 10 28 15 35 22 42" 
          fill="none" 
          stroke={`url(#heartShine${uniqueId})`} 
          strokeWidth="4" 
          strokeLinecap="round" 
          opacity="0.6"
        />
      </svg>
    </div>
  );
};

export default Heart3DIcon;
