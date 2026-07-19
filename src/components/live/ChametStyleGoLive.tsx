import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";

import { X, UserPlus, Check, Smile, ScanLine, RefreshCcw, Mic, MicOff, Sparkles, Share2, MessageSquare, Gift, Diamond, ListTodo, Music, Settings, Sword, ChevronRight, AlertCircle, ShieldCheck } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import { useNavigate } from "react-router-dom";
import { useToast } from "@/hooks/use-toast";

interface CoHostSlot {
  id: string;
  userId?: string;
  displayName?: string;
  avatarUrl?: string;
  isVerified?: boolean;
}

interface ChametFaceVerificationModalProps {
  isOpen: boolean;
  onClose: () => void;
  onStartVerification: () => void;
}

// Face Verification Modal - Chamet Style
export const ChametFaceVerificationModal = ({ 
  isOpen, 
  onClose, 
  onStartVerification 
}: ChametFaceVerificationModalProps) => {
  const [agreed, setAgreed] = useState(true);

  if (!isOpen) return null;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[70] flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.7)' }}
    >
      <motion.div
        initial={{ scale: 0.9, y: 20 }}
        animate={{ scale: 1, y: 0 }}
        exit={{ scale: 0.9, y: 20 }}
        className="bg-white rounded-3xl max-w-sm w-full overflow-hidden"
      >
        {/* Decorative circles */}
        <div className="relative pt-8 pb-4 flex flex-col items-center">
          <div className="absolute top-4 left-8 w-6 h-6 rounded-full bg-purple-100/80" />
          <div className="absolute top-12 right-12 w-4 h-4 rounded-full bg-purple-100/60" />
          <div className="absolute bottom-8 left-16 w-3 h-3 rounded-full bg-orange-100/70" />
          
          {/* Icon */}
          <motion.div
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            transition={{ type: "spring", delay: 0.1 }}
            className="w-24 h-24 rounded-2xl bg-gradient-to-br from-orange-400 to-amber-500 flex items-center justify-center shadow-lg shadow-orange-200 relative"
          >
            <div className="w-12 h-12 bg-white rounded-xl flex items-center justify-center">
              <ScanLine className="w-8 h-8 text-orange-500" />
            </div>
            <div className="absolute -bottom-1 -right-1 w-8 h-8 bg-white rounded-lg flex items-center justify-center shadow-md">
              <Check className="w-5 h-5 text-orange-500" />
            </div>
          </motion.div>
        </div>

        {/* Content */}
        <div className="px-6 pb-6">
          <h2 className="text-xl font-bold text-gray-800 text-center mb-2">Face Verification</h2>
          <p className="text-gray-500 text-sm text-center mb-6">
            Follow these requirements to make you easily pass verification
          </p>

          {/* Requirements */}
          <div className="flex justify-center gap-4 mb-6">
            {[
              { label: "No cover", icon: "🙆‍♀️" },
              { label: "Not in dark light", icon: "💡" },
              { label: "No shake", icon: "📱" },
            ].map((item, index) => (
              <div key={index} className="flex flex-col items-center gap-2">
                <div className="relative w-16 h-16 rounded-full bg-gradient-to-br from-gray-100 to-gray-200 flex items-center justify-center">
                  <span className="text-2xl">{item.icon}</span>
                  <div className="absolute -bottom-0.5 -right-0.5 w-5 h-5 bg-red-500 rounded-full flex items-center justify-center">
                    <X className="w-3 h-3 text-white" />
                  </div>
                </div>
                <span className="text-xs text-gray-600 text-center leading-tight">{item.label}</span>
              </div>
            ))}
          </div>

          {/* Start Button */}
          <motion.button
            whileTap={{ scale: 0.98 }}
            onClick={onStartVerification}
            className="w-full py-4 rounded-full bg-gradient-to-r from-purple-400 to-purple-500 text-white font-semibold text-lg mb-4"
          >
            Start verification
          </motion.button>

          {/* Privacy Notice */}
          <p className="text-gray-400 text-xs text-center mb-3">
            This is only for the purpose of verifying real individuals and will not be used for any other purposes
          </p>

          {/* Agreement */}
          <div className="flex items-start gap-2">
            <button 
              onClick={() => setAgreed(!agreed)}
              className={cn(
                "w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0 mt-0.5",
                agreed ? "bg-purple-500 border-purple-500" : "border-gray-300"
              )}
            >
              {agreed && <Check className="w-3 h-3 text-white" />}
            </button>
            <p className="text-gray-500 text-xs">
              Please agree to the <span className="text-purple-500">User Agreement</span> and <span className="text-purple-500">Privacy Policy</span> first!
            </p>
          </div>
        </div>
      </motion.div>

      {/* Close button */}
      <button
        onClick={onClose}
        className="absolute top-8 right-4 w-10 h-10 rounded-full bg-white/10 flex items-center justify-center"
      >
        <X className="w-5 h-5 text-white" />
      </button>
    </motion.div>
  );
};

// Settings Panel - Chamet Style (without games)
interface ChametSettingsPanelProps {
  isOpen: boolean;
  onClose: () => void;
  mirrorMode: boolean;
  onMirrorToggle: () => void;
  isFrontCamera: boolean;
  onCameraSwitch: () => void;
  isMicEnabled: boolean;
  onMicToggle: () => void;
  onStickerClick: () => void;
  onBeautyClick: () => void;
}

export const ChametSettingsPanel = ({
  isOpen,
  onClose,
  mirrorMode,
  onMirrorToggle,
  isFrontCamera,
  onCameraSwitch,
  isMicEnabled,
  onMicToggle,
  onStickerClick,
  onBeautyClick,
}: ChametSettingsPanelProps) => {
  // Auto-record feature removed per product decision.


  if (!isOpen) return null;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.22, ease: [0.32, 0.72, 0, 1] }}
      className="fixed inset-0 z-[59] bg-black/65 backdrop-blur-md"
      onClick={onClose}
    >
      <motion.div
        initial={{ y: "100%" }}
        animate={{ y: 0 }}
        exit={{ y: "100%" }}
        transition={{ type: "spring", damping: 28, stiffness: 320 }}
        className="fixed bottom-0 left-0 right-0 z-[60] rounded-t-[28px] pb-safe overflow-hidden border-t border-white/10 shadow-[0_-20px_60px_-10px_rgba(0,0,0,0.6)]"
        style={{
          background: 'linear-gradient(180deg, rgba(20,15,35,0.97) 0%, rgba(12,8,24,0.98) 100%)',
          backdropFilter: 'blur(24px)',
          WebkitBackdropFilter: 'blur(24px)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Aurora overlay */}
        <div
          className="pointer-events-none absolute inset-0 opacity-[0.35]"
          style={{
            background:
              'radial-gradient(60% 40% at 15% 0%, rgba(168,85,247,0.22), transparent 70%), radial-gradient(50% 35% at 90% 10%, rgba(244,114,182,0.18), transparent 70%)',
          }}
        />

        {/* Drag handle */}
        <div className="relative mx-auto mt-2 mb-1 h-1 w-10 rounded-full bg-white/25" />

        <div className="relative py-2">
          {(() => {
            const rows: Array<{
              kind: 'link' | 'toggle';
              key: string;
              label: string;
              sub?: string;
              icon: any;
              iconGrad: string;
              iconShadow: string;
              onClick?: () => void;
              checked?: boolean;
              disabled?: boolean;
              onChange?: (v: boolean) => void;
            }> = [
              {
                kind: 'link',
                key: 'sticker',
                label: 'Sticker',
                icon: Smile,
                iconGrad: 'linear-gradient(135deg, #f59e0b 0%, #f97316 100%)',
                iconShadow: '0 6px 18px -4px rgba(245,158,11,0.55)',
                onClick: () => { onStickerClick(); onClose(); },
              },
              {
                kind: 'link',
                key: 'beauty',
                label: 'Beauty',
                icon: Sparkles,
                iconGrad: 'linear-gradient(135deg, #ec4899 0%, #a855f7 100%)',
                iconShadow: '0 6px 18px -4px rgba(168,85,247,0.55)',
                onClick: () => { onBeautyClick(); onClose(); },
              },
              {
                kind: 'toggle',
                key: 'mirror',
                label: 'Mirror Mode',
                icon: RefreshCcw,
                iconGrad: 'linear-gradient(135deg, #22d3ee 0%, #3b82f6 100%)',
                iconShadow: '0 6px 18px -4px rgba(59,130,246,0.55)',
                checked: mirrorMode,
                onChange: onMirrorToggle,
              },
              {
                kind: 'toggle',
                key: 'cam',
                label: 'Switch the Camera',
                icon: RefreshCcw,
                iconGrad: 'linear-gradient(135deg, #34d399 0%, #10b981 100%)',
                iconShadow: '0 6px 18px -4px rgba(16,185,129,0.55)',
                checked: !isFrontCamera,
                onChange: onCameraSwitch,
              },
              {
                kind: 'toggle',
                key: 'mic',
                label: 'Microphone',
                icon: Mic,
                iconGrad: 'linear-gradient(135deg, #a78bfa 0%, #8b5cf6 100%)',
                iconShadow: '0 6px 18px -4px rgba(139,92,246,0.55)',
                checked: isMicEnabled,
                onChange: onMicToggle,
              },
            ];


            return rows.map((r, idx) => {
              const Icon = r.icon;
              const inner = (
                <div className="flex items-center gap-3 w-full">
                  <div
                    className="relative w-11 h-11 rounded-2xl flex items-center justify-center overflow-hidden flex-shrink-0"
                    style={{
                      background: r.iconGrad,
                      boxShadow: `${r.iconShadow}, inset 0 1px 0 rgba(255,255,255,0.30)`,
                    }}
                  >
                    <Icon className="w-5 h-5 text-white relative z-10" />
                    <div
                      className="absolute inset-0 pointer-events-none"
                      style={{
                        background: 'linear-gradient(115deg, transparent 40%, rgba(255,255,255,0.35) 50%, transparent 60%)',
                        animation: 'giftSendShine 3.2s ease-in-out infinite',
                      }}
                    />
                  </div>
                  <div className="flex-1 min-w-0 text-left">
                    <div className="text-white font-medium text-[15px]">{r.label}</div>
                    {r.sub && <div className="text-[11px] text-white/55 mt-0.5">{r.sub}</div>}
                  </div>
                  {r.kind === 'link' ? (
                    <ChevronRight className="w-5 h-5 text-white/40 flex-shrink-0" />
                  ) : (
                    <Switch
                      checked={!!r.checked}
                      disabled={r.disabled}
                      onCheckedChange={r.onChange}
                      className="data-[state=checked]:bg-gradient-to-r data-[state=checked]:from-pink-500 data-[state=checked]:to-purple-500"
                    />
                  )}
                </div>
              );

              return (
                <motion.div
                  key={r.key}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ type: 'spring', damping: 24, stiffness: 360, delay: Math.min(idx * 0.03, 0.18) }}
                  className="px-4 py-1.5"
                >
                  {r.kind === 'link' ? (
                    <motion.button
                      whileTap={{ scale: 0.985 }}
                      onClick={r.onClick}
                      className="w-full px-3 py-3 rounded-2xl border border-white/06 text-left"
                      style={{
                        background: 'linear-gradient(135deg, rgba(255,255,255,0.05) 0%, rgba(255,255,255,0.02) 100%)',
                        borderColor: 'rgba(255,255,255,0.06)',
                        boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.04)',
                      }}
                    >
                      {inner}
                    </motion.button>
                  ) : (
                    <div
                      className="w-full px-3 py-3 rounded-2xl border"
                      style={{
                        background: 'linear-gradient(135deg, rgba(255,255,255,0.05) 0%, rgba(255,255,255,0.02) 100%)',
                        borderColor: 'rgba(255,255,255,0.06)',
                        boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.04)',
                      }}
                    >
                      {inner}
                    </div>
                  )}
                </motion.div>
              );
            });
          })()}
        </div>
      </motion.div>
    </motion.div>
  );
};

// More Options Menu - Chamet Style (for hosts, includes Call option)
interface ChametLiveMoreMenuProps {
  isOpen: boolean;
  onClose: () => void;
  onPKClick: () => void;
  onGiftClick: () => void;
  onMessagesClick: () => void;
  onShareClick: () => void;
  onTasksClick: () => void;
  onTopUpClick: () => void;
  onMusicClick: () => void;
  onSettingsClick: () => void;
  messageCount?: number;
}

export const ChametLiveMoreMenu = ({
  isOpen,
  onClose,
  onPKClick,
  onGiftClick,
  onMessagesClick,
  onShareClick,
  onTasksClick,
  onTopUpClick,
  onMusicClick,
  onSettingsClick,
  messageCount = 0,
}: ChametLiveMoreMenuProps) => {
  if (!isOpen) return null;

  const menuItems = [
    { id: 'pk', label: 'PK', icon: Sword, onClick: onPKClick, gradient: 'from-red-400 to-red-500' },
    { id: 'gifts', label: 'Send gifts', icon: Gift, onClick: onGiftClick, gradient: 'from-pink-400 to-pink-500' },
    { id: 'messages', label: 'Messages', icon: MessageSquare, onClick: onMessagesClick, gradient: 'from-rose-400 to-rose-500', badge: messageCount },
    { id: 'share', label: 'Share', icon: Share2, onClick: onShareClick, gradient: 'from-blue-400 to-blue-500' },
    { id: 'tasks', label: 'Tasks', icon: ListTodo, onClick: onTasksClick, gradient: 'from-yellow-400 to-amber-500' },
    { id: 'topup', label: 'Top Up', icon: Diamond, onClick: onTopUpClick, gradient: 'from-cyan-400 to-blue-500' },
    { id: 'music', label: 'Music', icon: Music, onClick: onMusicClick, gradient: 'from-purple-400 to-violet-500' },
    { id: 'settings', label: 'Settings', icon: Settings, onClick: onSettingsClick, gradient: 'from-indigo-400 to-purple-500' },
  ];

  return (
    <>
      {/* Backdrop */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-50"
        onClick={onClose}
      />
      
      {/* Menu Panel */}
      <motion.div
        initial={{ y: "100%" }}
        animate={{ y: 0 }}
        exit={{ y: "100%" }}
        transition={{ type: "spring", damping: 25, stiffness: 300 }}
        className="fixed bottom-0 left-0 right-0 z-50 pb-safe"
      >
        <div className="bg-gradient-to-br from-purple-50/95 to-pink-50/95 backdrop-blur-xl rounded-t-3xl p-5">
          <div className="grid grid-cols-4 gap-4">
            {menuItems.map((item, index) => {
              const Icon = item.icon;
              return (
                <motion.button
                  key={item.id}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: index * 0.03 }}
                  onClick={() => {
                    item.onClick();
                    onClose();
                  }}
                  className="flex flex-col items-center gap-2 py-2"
                >
                  <div className={cn(
                    "relative w-14 h-14 rounded-2xl flex items-center justify-center shadow-lg bg-gradient-to-br",
                    item.gradient
                  )}>
                    <Icon className="w-6 h-6 text-white" />
                    {item.badge && item.badge > 0 && (
                      <div className="absolute -top-1 -right-1 min-w-5 h-5 px-1.5 bg-red-500 rounded-full flex items-center justify-center">
                        <span className="text-white text-[10px] font-bold">{item.badge}</span>
                      </div>
                    )}
                  </div>
                  <span className="text-gray-700 text-xs font-medium">{item.label}</span>
                </motion.button>
              );
            })}
          </div>
        </div>
      </motion.div>
    </>
  );
};

// Co-Host Slot Component
interface CoHostSlotProps {
  slot: CoHostSlot;
  isEmpty: boolean;
  onInviteClick: () => void;
}

export const CoHostSlotComponent = ({ slot, isEmpty, onInviteClick }: CoHostSlotProps) => {
  if (isEmpty) {
    return (
      <motion.button
        whileTap={{ scale: 0.95 }}
        onClick={onInviteClick}
        className="w-20 h-24 rounded-xl bg-gray-800/50 backdrop-blur-sm border border-white/10 flex flex-col items-center justify-center gap-1"
      >
        <div className="w-10 h-10 rounded-full bg-gray-700/50 flex items-center justify-center">
          <UserPlus className="w-5 h-5 text-gray-400" />
        </div>
      </motion.button>
    );
  }

  return (
    <div className="relative w-20 h-24 rounded-xl overflow-hidden">
      <Avatar className="w-full h-full rounded-xl">
        <AvatarImage src={slot.avatarUrl} className="object-contain" />
        <AvatarFallback className="bg-gradient-to-br from-purple-600 to-pink-500 text-white text-lg rounded-xl">
          {slot.displayName?.[0] || 'U'}
        </AvatarFallback>
      </Avatar>
      {slot.isVerified && (
        <div className="absolute bottom-1 left-1/2 -translate-x-1/2 bg-gradient-to-r from-pink-500 to-purple-500 rounded-md px-1.5 py-0.5 flex items-center gap-0.5">
          <Check className="w-2.5 h-2.5 text-white" />
        </div>
      )}
    </div>
  );
};

export default ChametFaceVerificationModal;
