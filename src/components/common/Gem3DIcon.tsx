import React from 'react';

interface Gem3DIconProps {
  size?: number;
  className?: string;
}

const Gem3DIcon: React.FC<Gem3DIconProps> = ({ size = 24, className = '' }) => {
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
          <linearGradient id={`gemBlue${uniqueId}`} x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#81D4FA" />
            <stop offset="50%" stopColor="#0288D1" />
            <stop offset="100%" stopColor="#01579B" />
          </linearGradient>
        </defs>
        <path 
          d="M 32 60 L 6 24 L 18 4 L 46 4 L 58 24 L 32 60 Z" 
          fill={`url(#gemBlue${uniqueId})`}
          stroke="#0277BD"
          strokeWidth="0.5"
        />
        <path d="M 18 4 L 46 4 L 50 18 L 14 18 Z" fill="#B3E5FC" opacity="0.4" />
        <path d="M 32 60 L 58 24 L 50 18 L 32 30 Z" fill="#01579B" opacity="0.2" />
      </svg>
    </div>
  );
};

export default Gem3DIcon;
