import React from 'react';

interface GiftBox3DIconProps {
  size?: number;
  className?: string;
}

const GiftBox3DIcon: React.FC<GiftBox3DIconProps> = ({ size = 24, className = '' }) => {
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
          <linearGradient id={`boxRed${uniqueId}`} x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#FF5252" />
            <stop offset="100%" stopColor="#D32F2F" />
          </linearGradient>
          <linearGradient id={`ribbonGold${uniqueId}`} x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#FFD54F" />
            <stop offset="100%" stopColor="#FFB300" />
          </linearGradient>
        </defs>
        <rect x="12" y="24" width="40" height="32" rx="2" fill={`url(#boxRed${uniqueId})`} />
        <rect x="10" y="20" width="44" height="8" rx="2" fill="#FF5252" />
        <rect x="28" y="20" width="8" height="36" fill={`url(#ribbonGold${uniqueId})`} />
        <path d="M 32 20 C 24 10, 16 10, 16 20 C 24 20, 32 20, 32 20 Z" fill={`url(#ribbonGold${uniqueId})`} stroke="#E65100" strokeWidth="0.5" />
        <path d="M 32 20 C 40 10, 48 10, 48 20 C 40 20, 32 20, 32 20 Z" fill={`url(#ribbonGold${uniqueId})`} stroke="#E65100" strokeWidth="0.5" />
      </svg>
    </div>
  );
};

export default GiftBox3DIcon;
