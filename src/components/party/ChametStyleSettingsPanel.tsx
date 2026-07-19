import { motion, AnimatePresence } from "framer-motion";
import { 
  X, 
  Camera, 
  Mic, 
  FlipHorizontal, 
  SwitchCamera, 
  Image,
  Armchair,
  Music,
  ChevronRight
} from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";

interface ChametStyleSettingsPanelProps {
  isOpen: boolean;
  onClose: () => void;
  // Camera Settings
  isCameraOn: boolean;
  onCameraToggle: () => void;
  // Microphone Settings
  isMicOn: boolean;
  onMicToggle: () => void;
  // Mirror Mode
  isMirrorMode: boolean;
  onMirrorModeToggle: () => void;
  // Switch Camera (front/back)
  isFrontCamera: boolean;
  onSwitchCamera: () => void;
  // NEW: Seat Management
  onSeatClick?: () => void;
  // NEW: Background
  onBackgroundClick?: () => void;
  // NEW: Music
  onMusicClick?: () => void;
  // Legacy (optional for backward compatibility)
  onBeautyClick?: () => void;
  onStickerClick?: () => void;
}

export function ChametStyleSettingsPanel({
  isOpen,
  onClose,
  isCameraOn,
  onCameraToggle,
  isMicOn,
  onMicToggle,
  isMirrorMode,
  onMirrorModeToggle,
  isFrontCamera,
  onSwitchCamera,
  onSeatClick,
  onBackgroundClick,
  onMusicClick
}: ChametStyleSettingsPanelProps) {
  const settingsItems = [
    // NEW: Seat Management - replaces Sticker
    {
      id: 'seat',
      icon: Armchair,
      label: 'Seat',
      description: 'Manage seats & participants',
      type: 'link' as const,
      onClick: onSeatClick,
      gradient: 'from-green-400 to-emerald-500'
    },
    // NEW: Background - replaces Beauty
    {
    },
    // NEW: Music Player
    {
    },
    {
      value: isMirrorMode,
      onToggle: onMirrorModeToggle
    },
    // Camera + Switch Camera toggles removed per request (no video icons in call/live/party)
    {
    }
  ];

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/55 backdrop-blur-sm z-50"
            onClick={onClose}
          />

          {/* Settings Panel — premium glass dark sheet (Pkg164-parity) */}
          <motion.div
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={{ type: "spring", damping: 28, stiffness: 320, mass: 0.7 }}
            className="fixed bottom-0 left-0 right-0 z-50 rounded-t-[28px] overflow-hidden"
            style={{
              background: 'linear-gradient(180deg, rgba(20,15,35,0.97) 0%, rgba(12,8,24,0.98) 100%)',
              boxShadow: '0 -20px 60px -10px rgba(168,85,247,0.25), inset 0 1px 0 rgba(255,255,255,0.08)',
              backdropFilter: 'blur(24px)',
              WebkitBackdropFilter: 'blur(24px)',
              willChange: 'transform',
              transform: 'translateZ(0)',
            }}
          >
            {/* Premium Header */}
            <div className="relative px-5 pt-2.5 pb-3 border-b border-white/5">
              {/* Drag Handle */}
              <div className="flex justify-center mb-2.5">
                <div className="w-10 h-1 bg-white/25 rounded-full" />
              </div>

              {/* Title with Close */}
              <div className="flex items-center justify-between">
                <h2 className="text-[17px] font-bold bg-clip-text text-transparent bg-gradient-to-r from-white via-purple-100 to-pink-100 tracking-wide">
                  Room Settings
                </h2>
                <motion.button
                  whileTap={{ scale: 0.88 }}
                  onClick={onClose}
                  className="w-8 h-8 rounded-full bg-white/8 hover:bg-white/15 border border-white/10 flex items-center justify-center transition-colors"
                >
                  <X className="w-4 h-4 text-white/70" />
                </motion.button>
              </div>
            </div>

            {/* Settings List */}
            <div
              className="px-3 py-2 max-h-[60vh] overflow-y-auto overscroll-contain"
              style={{ scrollBehavior: 'smooth', WebkitOverflowScrolling: 'touch' }}
            >
              {settingsItems.map((item, index) => {
                const Icon = item.icon;
                const hasGradient = item.type === 'link' && 'gradient' in item;

                return (
                  <motion.div
                    key={item.id}
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: Math.min(index * 0.035, 0.18), type: 'spring', damping: 24, stiffness: 360 }}
                    whileTap={item.type === 'link' ? { scale: 0.985 } : undefined}
                    className={cn(
                      "relative flex items-center justify-between my-1 p-2.5 rounded-2xl transition-colors",
                      item.type === 'link'
                        ? "cursor-pointer active:bg-white/8 hover:bg-white/5"
                        : ""
                    )}
                    style={{
                        ? 'linear-gradient(135deg, rgba(255,255,255,0.04), rgba(255,255,255,0.02))'
                        : 'transparent',
                      border: item.type === 'link' ? '1px solid rgba(255,255,255,0.06)' : '1px solid transparent',
                    }}
                    onClick={item.type === 'link' ? item.onClick : undefined}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      {/* Icon */}
                      {hasGradient ? (
                        <div
                          className={cn(
                            "relative w-11 h-11 rounded-2xl flex items-center justify-center overflow-hidden",
                            `bg-gradient-to-br ${(item as any).gradient}`
                          )}
                          style={{ boxShadow: '0 6px 18px -4px rgba(168,85,247,0.45), inset 0 1px 0 rgba(255,255,255,0.18)' }}
                        >
                          {/* shine sweep */}
                          <span
                            aria-hidden
                            className="pointer-events-none absolute inset-y-0 left-0 w-1/2 animate-[giftSendShine_3.2s_ease-in-out_infinite]"
                            style={{ background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.28), transparent)' }}
                          />
                          <Icon className="w-5 h-5 text-white relative z-10" />
                        </div>
                      ) : (
                        <div
                          className="w-11 h-11 rounded-2xl flex items-center justify-center"
                          style={{ background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.08)' }}
                        >
                          <Icon className="w-5 h-5 text-white/80" />
                        </div>
                      )}

                      {/* Label & Description */}
                      <div className="min-w-0">
                        <span className="text-white font-semibold text-[14px] block leading-tight">
                          {item.label}
                        </span>
                        {item.type === 'link' && 'description' in item && (
                          <span className="text-white/55 text-[11px] block mt-0.5">
                            {(item as any).description}
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Right side */}
                    {item.type === 'toggle' ? (
                      <Switch
                        checked={item.value}
                        onCheckedChange={item.onToggle}
                        className="data-[state=checked]:bg-gradient-to-r data-[state=checked]:from-pink-500 data-[state=checked]:to-purple-500"
                      />
                    ) : (
                      <ChevronRight className="w-5 h-5 text-white/35" />
                    )}
                  </motion.div>
                );
              })}
            </div>

            {/* Safe Area Padding */}
            <div className="h-5 pb-safe" />
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

export default ChametStyleSettingsPanel;
