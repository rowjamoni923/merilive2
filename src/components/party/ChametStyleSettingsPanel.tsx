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
      id: 'background',
      icon: Image,
      label: 'Background',
      description: 'Change room background',
      type: 'link' as const,
      onClick: onBackgroundClick,
      gradient: 'from-cyan-400 to-blue-500'
    },
    // NEW: Music Player
    {
      id: 'music',
      icon: Music,
      label: 'Music',
      description: 'Play background music',
      type: 'link' as const,
      onClick: onMusicClick,
      gradient: 'from-pink-500 to-purple-600'
    },
    {
      id: 'mirror',
      icon: FlipHorizontal,
      label: 'Mirror Mode',
      type: 'toggle' as const,
      value: isMirrorMode,
      onToggle: onMirrorModeToggle
    },
    {
      id: 'camera',
      icon: Camera,
      label: 'Camera',
      type: 'toggle' as const,
      value: isCameraOn,
      onToggle: onCameraToggle
    },
    {
      id: 'switch-camera',
      icon: SwitchCamera,
      label: 'Switch the Camera',
      type: 'toggle' as const,
      value: !isFrontCamera,
      onToggle: onSwitchCamera
    },
    {
      id: 'microphone',
      icon: Mic,
      label: 'Microphone',
      type: 'toggle' as const,
      value: isMicOn,
      onToggle: onMicToggle
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
            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50"
            onClick={onClose}
          />

          {/* Settings Panel - Professional Design */}
          <motion.div
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={{ type: "spring", damping: 25, stiffness: 300 }}
            className="fixed bottom-0 left-0 right-0 z-50 bg-gradient-to-b from-white to-gray-50 rounded-t-[28px] overflow-hidden shadow-2xl"
          >
            {/* Premium Header */}
            <div className="relative px-5 pt-4 pb-3 border-b border-gray-100">
              {/* Drag Handle */}
              <div className="flex justify-center mb-3">
                <div className="w-12 h-1 bg-gray-300 rounded-full" />
              </div>
              
              {/* Title with Close */}
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-bold text-gray-900">Room Settings</h2>
                <motion.button
                  whileTap={{ scale: 0.9 }}
                  onClick={onClose}
                  className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center"
                >
                  <X className="w-4 h-4 text-gray-600" />
                </motion.button>
              </div>
            </div>

            {/* Settings List - Professional Layout */}
            <div className="px-4 py-2 max-h-[60vh] overflow-y-auto">
              {settingsItems.map((item, index) => {
                const Icon = item.icon;
                
                return (
                  <motion.div
                    key={item.id}
                    initial={{ opacity: 0, x: -20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: index * 0.05 }}
                    className={cn(
                      "flex items-center justify-between py-3.5 border-b border-gray-100 last:border-0",
                      item.type === 'link' && "cursor-pointer active:bg-gray-50 rounded-xl -mx-2 px-2"
                    )}
                    onClick={item.type === 'link' ? item.onClick : undefined}
                  >
                    <div className="flex items-center gap-4">
                      {/* Icon with Gradient Background for Links */}
                      {item.type === 'link' && 'gradient' in item ? (
                        <div className={cn(
                          "w-12 h-12 rounded-2xl flex items-center justify-center shadow-lg",
                          `bg-gradient-to-br ${item.gradient}`
                        )}>
                          <Icon className="w-6 h-6 text-white" />
                        </div>
                      ) : (
                        <div className="w-12 h-12 rounded-2xl bg-gray-100 flex items-center justify-center">
                          <Icon className="w-6 h-6 text-gray-700" />
                        </div>
                      )}
                      
                      {/* Label & Description */}
                      <div>
                        <span className="text-gray-900 font-semibold text-[15px] block">
                          {item.label}
                        </span>
                        {item.type === 'link' && 'description' in item && (
                          <span className="text-gray-500 text-xs">
                            {item.description}
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Right Side - Toggle or Arrow */}
                    {item.type === 'toggle' ? (
                      <Switch
                        checked={item.value}
                        onCheckedChange={item.onToggle}
                        className="data-[state=checked]:bg-purple-500"
                      />
                    ) : (
                      <div className="flex items-center gap-1">
                        <ChevronRight className="w-5 h-5 text-gray-400" />
                      </div>
                    )}
                  </motion.div>
                );
              })}
            </div>

            {/* Safe Area Padding */}
            <div className="h-6 pb-safe" />
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

export default ChametStyleSettingsPanel;
