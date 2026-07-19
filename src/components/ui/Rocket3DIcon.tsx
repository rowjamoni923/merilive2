 import { motion } from "framer-motion";
 
 interface Rocket3DIconProps {
   className?: string;
 }
 
 export const Rocket3DIcon = ({ className = "" }: Rocket3DIconProps) => {
   return (
     <motion.div 
       className={`relative ${className}`}
       animate={{ 
         y: [-2, 2, -2],
       }}
       transition={{ 
         duration: 2, 
         repeat: Infinity, 
         ease: "easeInOut" 
       }}
       style={{ perspective: "1000px" }}
     >
       {/* 3D Rocket SVG with gradients and shadows */}
       <svg 
         viewBox="0 0 64 64" 
         className="w-full h-full drop-shadow-[0_4px_8px_rgba(168,85,247,0.5)]"
         style={{ 
           filter: "drop-shadow(0 2px 4px rgba(0,0,0,0.3))",
           transform: "rotateY(-10deg) rotateX(5deg)"
         }}
       >
         <defs>
           {/* Rocket body gradient - metallic purple */}
           <linearGradient id="rocketBody3D" x1="0%" y1="0%" x2="100%" y2="100%">
             <stop offset="0%" stopColor="#c084fc" />
             <stop offset="30%" stopColor="#a855f7" />
             <stop offset="70%" stopColor="#7c3aed" />
             <stop offset="100%" stopColor="#5b21b6" />
           </linearGradient>
           
           {/* Rocket tip gradient - pink/rose */}
           <linearGradient id="rocketTip3D" x1="0%" y1="0%" x2="100%" y2="100%">
             <stop offset="0%" stopColor="#f472b6" />
             <stop offset="50%" stopColor="#ec4899" />
             <stop offset="100%" stopColor="#be185d" />
           </linearGradient>
           
           {/* Window gradient - cyan glow */}
           <radialGradient id="rocketWindow3D" cx="40%" cy="40%" r="60%">
             <stop offset="0%" stopColor="#ffffff" />
             <stop offset="30%" stopColor="#67e8f9" />
             <stop offset="100%" stopColor="#0891b2" />
           </radialGradient>
           
           {/* Flame gradient - orange to yellow */}
           <linearGradient id="rocketFlame3D" x1="50%" y1="0%" x2="50%" y2="100%">
             <stop offset="0%" stopColor="#fbbf24" />
             <stop offset="40%" stopColor="#f97316" />
             <stop offset="80%" stopColor="#ef4444" />
             <stop offset="100%" stopColor="#dc2626" />
           </linearGradient>
           
           {/* Highlight gradient */}
           <linearGradient id="rocketHighlight" x1="0%" y1="0%" x2="100%" y2="0%">
             <stop offset="0%" stopColor="rgba(255,255,255,0.4)" />
             <stop offset="100%" stopColor="rgba(255,255,255,0)" />
           </linearGradient>
         </defs>
         
         {/* Flame - animated */}
         <motion.path
           d="M28 52 L32 62 L36 52 L34 54 L32 58 L30 54 Z"
           fill="url(#rocketFlame3D)"
           animate={{ 
             scaleY: [1, 1.3, 1],
             opacity: [0.9, 1, 0.9]
           }}
           transition={{ 
           }}
           style={{ transformOrigin: "center top" }}
         />
         
         {/* Rocket fins - left */}
         <path
           d="M22 42 L18 52 L26 48 Z"
           fill="url(#rocketTip3D)"
           stroke="#be185d"
           strokeWidth="0.5"
         />
         
         {/* Rocket fins - right */}
         <path
           d="M42 42 L46 52 L38 48 Z"
           fill="url(#rocketTip3D)"
           stroke="#be185d"
           strokeWidth="0.5"
         />
         
         {/* Rocket body - main */}
         <ellipse
           cx="32"
           cy="32"
           rx="10"
           ry="22"
           fill="url(#rocketBody3D)"
           stroke="#5b21b6"
           strokeWidth="0.5"
         />
         
         {/* Body highlight - 3D effect */}
         <ellipse
           cx="28"
           cy="30"
           rx="4"
           ry="16"
           fill="url(#rocketHighlight)"
         />
         
         {/* Rocket tip/nose cone */}
         <path
           d="M32 6 C32 6 26 14 26 18 L32 10 L38 18 C38 14 32 6 32 6 Z"
           fill="url(#rocketTip3D)"
           stroke="#be185d"
           strokeWidth="0.5"
         />
         
         {/* Window - with glow effect */}
         <circle
           cx="32"
           cy="26"
           r="5"
           fill="url(#rocketWindow3D)"
           stroke="#0891b2"
           strokeWidth="1"
         />
         
         {/* Window reflection */}
         <circle
           cx="30"
           cy="24"
           r="1.5"
           fill="rgba(255,255,255,0.8)"
         />
         
         {/* Decorative ring */}
         <ellipse
           cx="32"
           cy="46"
           rx="8"
           ry="2"
           fill="#7c3aed"
           stroke="#5b21b6"
           strokeWidth="0.5"
         />
       </svg>
       
       {/* Glow effect behind rocket */}
       <div 
         className="absolute inset-0 -z-10 blur-lg opacity-50"
         style={{
           background: "radial-gradient(circle, rgba(168,85,247,0.6) 0%, transparent 70%)"
         }}
       />
     </motion.div>
   );
 };
 
 export default Rocket3DIcon;