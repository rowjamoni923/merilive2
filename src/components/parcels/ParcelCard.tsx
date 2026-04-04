import { memo } from 'react';
import { motion } from 'framer-motion';
import { Gift, Lock, Sparkles, Timer } from 'lucide-react';
import { UserParcel } from '@/hooks/useParcels';
import { useCountdown } from './useCountdown';

interface ParcelCardProps {
  parcel: UserParcel;
  index: number;
  onClick: (parcel: UserParcel) => void;
}

const PARCEL_COLORS: Record<string, string> = {
  standard: 'from-purple-600/30 to-pink-600/30',
  mega: 'from-amber-500/30 to-orange-600/30',
  surprise: 'from-cyan-500/30 to-blue-600/30',
  lucky_spin: 'from-emerald-500/30 to-teal-600/30',
};

const ParcelCard = memo(({ parcel, index, onClick }: ParcelCardProps) => {
  const template = parcel.parcel_templates;
  const isLocked = parcel.status === 'locked';
  const glowColor = template.glow_color || '#a855f7';
  const expiryCountdown = useCountdown(parcel.expires_at);

  return (
    <motion.div
      initial={{ opacity: 0, y: 20, scale: 0.9 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ delay: index * 0.1, type: 'spring', stiffness: 200 }}
      whileHover={{ scale: 1.05 }}
      whileTap={{ scale: 0.95 }}
      onClick={() => onClick(parcel)}
      className="relative cursor-pointer group"
    >
      {/* Glow effect */}
      <div
        className="absolute -inset-1 rounded-2xl opacity-40 group-hover:opacity-70 blur-lg transition-opacity duration-500"
        style={{ background: `radial-gradient(circle, ${glowColor}, transparent 70%)` }}
      />

      <div className={`relative rounded-2xl border border-white/10 bg-gradient-to-br ${PARCEL_COLORS[template.parcel_type] || PARCEL_COLORS.standard} backdrop-blur-xl p-4 overflow-hidden`}>
        {/* Shimmer overlay */}
        <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/5 to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-1000" />
        
        {/* Lock overlay */}
        {isLocked && (
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm rounded-2xl flex items-center justify-center z-10">
            <Lock className="w-8 h-8 text-white/60" />
          </div>
        )}

        {/* Gift icon with shake animation */}
        <motion.div
          animate={!isLocked ? { rotate: [0, -5, 5, -5, 0] } : {}}
          transition={{ repeat: Infinity, duration: 2, repeatDelay: 3 }}
          className="flex justify-center mb-3"
        >
          <div
            className="w-16 h-16 rounded-xl flex items-center justify-center"
            style={{ background: `linear-gradient(135deg, ${glowColor}40, ${glowColor}20)` }}
          >
            {template.parcel_type === 'mega' ? (
              <Sparkles className="w-8 h-8" style={{ color: glowColor }} />
            ) : (
              <Gift className="w-8 h-8" style={{ color: glowColor }} />
            )}
          </div>
        </motion.div>

        {/* Info */}
        <h3 className="text-sm font-bold text-foreground text-center truncate">{template.name}</h3>
        <p className="text-xs text-muted-foreground text-center mt-1 truncate">
          {template.reward_label || `${template.reward_amount} ${template.reward_type}`}
        </p>

        {/* Timer / Status */}
        <div className="mt-2 flex items-center justify-center gap-1">
          {isLocked ? (
            <span className="text-[10px] text-orange-400 font-medium flex items-center gap-1">
              <Lock className="w-3 h-3" /> 
              {parcel.required_progress > 0 ? `${parcel.current_progress}/${parcel.required_progress}` : 'Locked'}
            </span>
          ) : expiryCountdown ? (
            <span className="text-[10px] text-amber-400 font-medium flex items-center gap-1">
              <Timer className="w-3 h-3" /> {expiryCountdown}
            </span>
          ) : (
            <span className="text-[10px] text-emerald-400 font-medium">Ready to open!</span>
          )}
        </div>

        {/* Type badge */}
        {template.parcel_type !== 'standard' && (
          <div className="absolute top-2 right-2">
            <span className="text-[9px] font-bold uppercase px-1.5 py-0.5 rounded-full bg-amber-500/20 text-amber-400 border border-amber-500/30">
              {template.parcel_type === 'mega' ? '⭐ MEGA' : template.parcel_type === 'lucky_spin' ? '🎰 SPIN' : '🎁 ?'}
            </span>
          </div>
        )}
      </div>
    </motion.div>
  );
});

ParcelCard.displayName = 'ParcelCard';
export default ParcelCard;
