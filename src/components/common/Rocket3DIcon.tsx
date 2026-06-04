import React from 'react';

interface Rocket3DIconProps {
  size?: number;
  className?: string;
}

const Rocket3DIcon: React.FC<Rocket3DIconProps> = ({ size = 64, className = '' }) => {
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
        className="drop-shadow-xl"
      >
        <defs>
          {/* Main Body Gradient */}
          <linearGradient id={`rocketBody${uniqueId}`} x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#FFFFFF" />
            <stop offset="50%" stopColor="#E0E0E0" />
            <stop offset="100%" stopColor="#BDBDBD" />
          </linearGradient>
          
          {/* Accent Red Gradient */}
          <linearGradient id={`rocketAccent${uniqueId}`} x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#FF5252" />
            <stop offset="100%" stopColor="#D32F2F" />
          </linearGradient>
          
          {/* Window/Glass Gradient */}
          <radialGradient id={`rocketWindow${uniqueId}`} cx="40%" cy="40%" r="60%">
            <stop offset="0%" stopColor="#81D4FA" />
            <stop offset="100%" stopColor="#0288D1" />
          </radialGradient>
          
          {/* Flame Gradient */}
          <linearGradient id={`rocketFlame${uniqueId}`} x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="#FFEB3B" />
            <stop offset="40%" stopColor="#FF9800" />
            <stop offset="100%" stopColor="#F44336" stopOpacity="0" />
          </linearGradient>

          {/* 3D Highlight */}
          <linearGradient id={`rocketShine${uniqueId}`} x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#FFFFFF" stopOpacity="0.8" />
            <stop offset="50%" stopColor="#FFFFFF" stopOpacity="0" />
          </linearGradient>
          
          <filter id={`rocketGlow${uniqueId}`} x="-20%" y="-20%" width="140%" height="140%">
            <feGaussianBlur stdDeviation="2" result="blur"/>
            <feComposite in="SourceGraphic" in2="blur" operator="over"/>
          </filter>
        </defs>

        {/* Flame */}
        <path 
          d="M 32 48 Q 24 56, 32 64 Q 40 56, 32 48" 
          fill={`url(#rocketFlame${uniqueId})`}
          filter={`url(#rocketGlow${uniqueId})`}
        >
          <animate 
            attributeName="d" 
            values="M 32 48 Q 24 56, 32 64 Q 40 56, 32 48; M 32 48 Q 20 58, 32 62 Q 44 58, 32 48; M 32 48 Q 24 56, 32 64 Q 40 56, 32 48" 
            dur="0.5s" 
            repeatCount="indefinite" 
          />
        </path>

        {/* Fins */}
        <path d="M 32 40 L 16 52 L 20 40 Z" fill={`url(#rocketAccent${uniqueId})`} />
        <path d="M 32 40 L 48 52 L 44 40 Z" fill={`url(#rocketAccent${uniqueId})`} />
        
        {/* Main Body */}
        <path 
          d="M 32 4 C 20 12, 18 36, 18 44 L 46 44 C 46 36, 44 12, 32 4 Z" 
          fill={`url(#rocketBody${uniqueId})`}
          stroke="#9E9E9E"
          strokeWidth="0.5"
        />
        
        {/* Nose Cone */}
        <path d="M 32 4 C 24 10, 22 18, 22 22 L 42 22 C 42 18, 40 10, 32 4 Z" fill={`url(#rocketAccent${uniqueId})`} />
        
        {/* Window */}
        <circle cx="32" cy="30" r="5" fill={`url(#rocketWindow${uniqueId})`} stroke="#455A64" strokeWidth="1" />
        <circle cx="30" cy="28" r="1.5" fill="white" opacity="0.6" />
        
        {/* Shine/Reflection */}
        <path 
          d="M 24 15 C 22 25, 22 35, 22 42" 
          fill="none" 
          stroke={`url(#rocketShine${uniqueId})`} 
          strokeWidth="2" 
          strokeLinecap="round" 
        />
        
        {/* Bottom nozzle */}
        <rect x="24" y="44" width="16" height="4" rx="1" fill="#424242" />
      </svg>
    </div>
  );
};

export default Rocket3DIcon;
