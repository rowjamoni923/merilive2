import React from 'react';
import { motion } from 'framer-motion';

interface GiftBox3DIconProps {
  size?: number;
  className?: string;
}

const GiftBox3DIcon: React.FC<GiftBox3DIconProps> = ({ size = 64, className = '' }) => {
  const uniqueId = React.useId().replace(/:/g, '');
  
  return (
    <div 
      className={`relative inline-flex items-center justify-center ${className}`}
      style={{ width: size, height: size }}
    >
      <motion.svg 
        viewBox="0 0 128 128" 
        width={size} 
        height={size}
        className="drop-shadow-2xl"
        initial={{ rotateY: 0 }}
        animate={{ rotateY: [0, 10, -10, 0] }}
        transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
      >
        <defs>
          <linearGradient id={`boxMain${uniqueId}`} x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#FF416C" />
            <stop offset="100%" stopColor="#FF4B2B" />
          </linearGradient>
          <linearGradient id={`boxSide${uniqueId}`} x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#D4145A" />
            <stop offset="100%" stopColor="#FBB03B" />
          </linearGradient>
          <linearGradient id={`ribbon${uniqueId}`} x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#FDBE2D" />
            <stop offset="50%" stopColor="#F6D365" />
            <stop offset="100%" stopColor="#FDA085" />
          </linearGradient>
          <filter id={`shadow${uniqueId}`}>
            <feDropShadow dx="0" dy="4" stdDeviation="4" floodOpacity="0.3" />
          </filter>
        </defs>

        {/* 3D Box Body */}
        {/* Right side */}
        <path d="M64 40 L104 55 L104 95 L64 80 Z" fill={`url(#boxSide${uniqueId})`} opacity="0.9" />
        {/* Left side */}
        <path d="M64 40 L24 55 L24 95 L64 80 Z" fill={`url(#boxMain${uniqueId})`} />
        {/* Top */}
        <path d="M64 15 L104 30 L64 45 L24 30 Z" fill="#FF5F6D" />

        {/* Ribbons */}
        {/* Vertical Left */}
        <path d="M44 37 L44 91 L50 89 L50 35 Z" fill={`url(#ribbon${uniqueId})`} />
        {/* Vertical Right */}
        <path d="M78 35 L78 89 L84 91 L84 37 Z" fill={`url(#ribbon${uniqueId})`} />
        
        {/* Horizontal Top */}
        <path d="M44 22 L84 37 L78 40 L38 25 Z" fill="#FFD700" opacity="0.8" />
        <path d="M84 22 L44 37 L50 40 L90 25 Z" fill="#FFD700" opacity="0.8" />

        {/* Bow (The 3D knot) */}
        <circle cx="64" cy="22" r="8" fill={`url(#ribbon${uniqueId})`} filter={`url(#shadow${uniqueId})`} />
        <path d="M64 22 C 40 5, 20 15, 64 22" fill="none" stroke={`url(#ribbon${uniqueId})`} strokeWidth="6" strokeLinecap="round" />
        <path d="M64 22 C 88 5, 108 15, 64 22" fill="none" stroke={`url(#ribbon${uniqueId})`} strokeWidth="6" strokeLinecap="round" />
        
        {/* Shine highlight */}
        <path d="M30 60 Q40 55 50 65" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" opacity="0.4" />
      </motion.svg>
    </div>
  );
};

export default GiftBox3DIcon;
