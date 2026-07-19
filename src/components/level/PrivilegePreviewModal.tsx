import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Lock, Sparkles, Crown, Star, Gift, Car, Image, Headphones, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import Lottie from "lottie-react";
import { useUserPrivileges } from "@/hooks/useUserPrivileges";
import { useToast } from "@/hooks/use-toast";

interface LevelPrivilege {
  id: string;
  privilege_type: string;
  name: string;
  description: string;
  unlock_level: number;
  animation_url: string | null;
  preview_url: string | null;
  icon_name: string;
  icon_bg_color: string;
  icon_color: string;
}

interface PrivilegePreviewModalProps {
  privilege: LevelPrivilege | null;
  currentLevel: number;
  isOpen: boolean;
  onClose: () => void;
  userId?: string | null;
}

const iconMap: Record<string, React.ElementType> = {
  Sparkles, Crown, Star, Gift, Car, Image, Headphones
};

const PrivilegePreviewModal = ({ privilege, currentLevel, isOpen, onClose, userId }: PrivilegePreviewModalProps) => {
  const [animationData, setAnimationData] = useState<object | null>(null);
  const [loading, setLoading] = useState(false);
  const [equipping, setEquipping] = useState(false);
  const { toast } = useToast();
  const { privileges, equipPrivilege } = useUserPrivileges(userId || null);

  const isEquipped = privileges.find(p => p.id === privilege?.id)?.is_equipped;

  useEffect(() => {
    if (privilege?.animation_url && privilege.animation_url.endsWith('.json')) {
      setLoading(true);
      fetch(privilege.animation_url)
        .then(res => res.json())
        .then(data => {
          setAnimationData(data);
          setLoading(false);
        })
        .catch(() => setLoading(false));
    } else {
      setAnimationData(null);
    }
  }, [privilege?.animation_url]);

  if (!privilege) return null;

  const isUnlocked = currentLevel >= privilege.unlock_level;
  const IconComponent = iconMap[privilege.icon_name] || Star;

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
          onClick={onClose}
        >
          <motion.div
            initial={{ scale: 0.9, opacity: 0, y: 20 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            exit={{ scale: 0.9, opacity: 0, y: 20 }}
            transition={{ type: "spring", damping: 25, stiffness: 300 }}
            className="bg-white rounded-3xl w-full max-w-sm overflow-hidden shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header with animation/preview */}
            <div className="relative h-48 bg-gradient-to-br from-blue-400 via-purple-500 to-pink-500 flex items-center justify-center overflow-hidden">
              {/* Background decoration */}
              <div className="absolute inset-0 opacity-30">
                <div className="absolute top-4 left-4 w-20 h-20 bg-white rounded-full blur-2xl" />
                <div className="absolute bottom-4 right-4 w-32 h-32 bg-yellow-300 rounded-full blur-3xl" />
              </div>

              {/* Animation/Icon display */}
              <div className="relative z-10">
                {animationData ? (
                  <Lottie 
                    animationData={animationData} 
                    loop={true}
                    className="w-32 h-32"
                  />
                ) : privilege.preview_url ? (
                  <img loading="lazy" decoding="async" 
                    src={privilege.preview_url} 
                    alt={privilege.name}
                    className="w-32 h-32 object-contain" />
                ) : privilege.animation_url && (privilege.animation_url.endsWith('.gif') || privilege.animation_url.includes('.gif')) ? (
                  <img loading="lazy" decoding="async" 
                    src={privilege.animation_url} 
                    alt={privilege.name}
                    className="w-32 h-32 object-contain" />
                ) : (
                  <motion.div 
                    className="w-24 h-24 rounded-3xl flex items-center justify-center bg-white/20 backdrop-blur-sm"
                    animate={{ 
                      scale: [1, 1.1, 1],
                      rotate: [0, 5, -5, 0]
                    }}
                    transition={{ 
                      duration: 2,
                      repeat: Infinity,
                      repeatType: "reverse"
                    }}
                  >
                    <IconComponent className="w-12 h-12 text-white" />
                  </motion.div>
                )}
              </div>

              {/* Close button */}
              <button
                onClick={onClose}
                className="absolute top-4 right-4 w-8 h-8 rounded-full bg-black/20 flex items-center justify-center text-white hover:bg-black/40 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>

              {/* Lock/Unlock badge */}
              <div className="absolute bottom-4 left-1/2 transform -translate-x-1/2">
                {isUnlocked ? (
                  <motion.div 
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    className="px-4 py-2 rounded-full bg-green-500 text-white text-sm font-medium flex items-center gap-2"
                  >
                    <Check className="w-4 h-4" />
                    Unlocked
                  </motion.div>
                ) : (
                  <div className="px-4 py-2 rounded-full bg-black/40 text-white text-sm font-medium flex items-center gap-2">
                    <Lock className="w-4 h-4" />
                    Unlocks at Lv{privilege.unlock_level}
                  </div>
                )}
              </div>
            </div>

            {/* Content */}
            <div className="p-6 text-center">
              <div 
                className="w-16 h-16 rounded-2xl mx-auto mb-4 flex items-center justify-center -mt-12 relative z-20 shadow-lg"
                style={{ backgroundColor: privilege.icon_bg_color }}
              >
                <IconComponent 
                  className="w-8 h-8" 
                  style={{ color: privilege.icon_color }}
                />
              </div>

              <h2 className="text-xl font-bold text-gray-800 mb-2">{privilege.name}</h2>
              <p className="text-gray-500 mb-6">{privilege.description}</p>

              {/* Features list based on privilege type */}
              <div className="space-y-3 text-left mb-6">
                {privilege.privilege_type === 'entrance_effect' && (
                  <>
                    <FeatureItem text="Special effects when entering party rooms" isUnlocked={isUnlocked} />
                    <FeatureItem text="Special entry to live streams" isUnlocked={isUnlocked} />
                    <FeatureItem text="Stand out and grab attention" isUnlocked={isUnlocked} />
                  </>
                )}
                {privilege.privilege_type === 'entry_bar' && (
                  <>
                    <FeatureItem text="Striking banner when entering rooms" isUnlocked={isUnlocked} />
                    <FeatureItem text="Highlight your name" isUnlocked={isUnlocked} />
                  </>
                )}
                {privilege.privilege_type === 'portrait_frame' && (
                  <>
                    <FeatureItem text="Special profile frame" isUnlocked={isUnlocked} />
                    <FeatureItem text="Noble look in chat" isUnlocked={isUnlocked} />
                  </>
                )}
                {privilege.privilege_type === 'privilege_sticker' && (
                  <>
                    <FeatureItem text="Exclusive sticker pack" isUnlocked={isUnlocked} />
                    <FeatureItem text="Premium emojis" isUnlocked={isUnlocked} />
                  </>
                )}
                {privilege.privilege_type === 'privilege_gift' && (
                  <>
                    <FeatureItem text="Send luxury gifts" isUnlocked={isUnlocked} />
                    <FeatureItem text="Special gift animations" isUnlocked={isUnlocked} />
                  </>
                )}
                {privilege.privilege_type === 'party_background' && (
                  <>
                    <FeatureItem text="Custom party room backgrounds" isUnlocked={isUnlocked} />
                    <FeatureItem text="Premium theme access" isUnlocked={isUnlocked} />
                  </>
                )}
              </div>

              {!isUnlocked ? (
                <Button
                  className="w-full h-12 rounded-xl text-white font-bold"
                  style={{
                    background: 'linear-gradient(135deg, #f97316 0%, #ec4899 100%)'
                  }}
                  onClick={() => {
                    onClose();
                    // Navigate to recharge handled by parent
                  }}
                >
                  Top Up to Unlock
                </Button>
              ) : (
                <Button
                  disabled={isEquipped || equipping}
                  className={`w-full h-12 rounded-xl font-bold transition-all ${
                    isEquipped 
                      ? 'bg-green-100 text-green-600 border-2 border-green-200' 
                      : 'text-white shadow-lg hover:shadow-xl'
                  }`}
                  style={!isEquipped ? {
                  } : {}}
                  onClick={async () => {
                    if (!privilege || !userId) return;
                    setEquipping(true);
                    const success = await equipPrivilege(privilege.id, privilege.privilege_type, 'level');
                    setEquipping(false);
                    if (success) {
                      toast({
                        title: "Success",
                        description: `${privilege.name} equipped successfully!`,
                      });
                    }
                  }}
                >
                  {equipping ? 'Equipping...' : isEquipped ? 'Equipped' : 'Equip'}
                </Button>
              )}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

const FeatureItem = ({ text, isUnlocked }: { text: string; isUnlocked: boolean }) => (
  <div className="flex items-center gap-3">
    <div className={`w-5 h-5 rounded-full flex items-center justify-center ${
      isUnlocked ? 'bg-green-100 text-green-600' : 'bg-gray-100 text-slate-500'
    }`}>
      <Check className="w-3 h-3" />
    </div>
    <span className={`text-sm ${isUnlocked ? 'text-gray-700' : 'text-slate-500'}`}>
      {text}
    </span>
  </div>
);

export default PrivilegePreviewModal;
