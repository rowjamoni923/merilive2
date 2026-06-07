import { motion, AnimatePresence } from 'framer-motion';
import { Download, X, Sparkles, Rocket, AlertTriangle, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import updateBanner3D from '@/assets/update-banner-3d.jpg';

interface AppUpdateModalProps {
  isOpen: boolean;
  currentVersion: string;
  availableVersion: string;
  forceUpdate?: boolean;
  updateMessage?: string;
  onUpdate: () => void;
  onOpenStore: () => void;
  onDismiss: () => void;
}

const AppUpdateModal = ({
  isOpen,
  currentVersion,
  availableVersion,
  forceUpdate = false,
  updateMessage,
  onUpdate,
  onOpenStore,
  onDismiss,
}: AppUpdateModalProps) => {
  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-[100] flex items-center justify-center bg-white/80 backdrop-blur-sm p-4"
        onClick={forceUpdate ? undefined : onDismiss}
      >
        <motion.div
          initial={{ scale: 0.9, opacity: 0, y: 20 }}
          animate={{ scale: 1, opacity: 1, y: 0 }}
          exit={{ scale: 0.9, opacity: 0, y: 20 }}
          transition={{ type: 'spring', damping: 25, stiffness: 300 }}
          className="relative w-full max-w-sm bg-gradient-to-br from-card via-card to-card/95 rounded-3xl overflow-hidden shadow-2xl border border-primary/20"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Decorative Background */}
          <div className="absolute inset-0 overflow-hidden pointer-events-none">
            <div className="absolute -top-20 -right-20 w-40 h-40 bg-primary/20 rounded-full blur-3xl" />
            <div className="absolute -bottom-20 -left-20 w-40 h-40 bg-accent/20 rounded-full blur-3xl" />
          </div>

          {/* Close Button - Only show if not force update */}
          {!forceUpdate && (
            <button
              onClick={onDismiss}
              className="absolute top-4 right-4 p-2 rounded-full bg-muted/50 hover:bg-muted transition-colors z-10"
            >
              <X className="w-4 h-4 text-muted-foreground" />
            </button>
          )}

          {/* 3D Hero Banner */}
          <div className="relative w-full aspect-square overflow-hidden">
            <img
              src={updateBanner3D}
              alt="Update Available - New Version Live on Play Store"
              className="w-full h-full object-cover"
              width={1024}
              height={1024}
            />
            <div className="absolute inset-x-0 bottom-0 h-20 bg-gradient-to-t from-card via-card/80 to-transparent pointer-events-none" />
            <motion.div
              animate={{ scale: [1, 1.2, 1], rotate: [0, 15, 0] }}
              transition={{ duration: 2, repeat: Infinity }}
              className="absolute top-3 left-3"
            >
              <Sparkles className="w-6 h-6 text-yellow-400 drop-shadow-lg" />
            </motion.div>
          </div>

          {/* Content */}
          <div className="relative p-6 pt-2">
            {/* Title */}
            <h2 className="text-xl font-bold text-center text-foreground mb-2">
              {forceUpdate ? 'Important Update Required' : 'New Update Available!'}
            </h2>
            <p className="text-sm text-muted-foreground text-center mb-4">
              {updateMessage || 'A new version is available on Play Store'}
            </p>

            {/* Version Info */}
            <div className="bg-muted/50 rounded-xl p-4 mb-6">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm text-muted-foreground">Current Version</span>
                <span className="text-sm font-medium text-foreground">{currentVersion}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">New Version</span>
                <span className="text-sm font-bold text-primary">{availableVersion}</span>
              </div>
            </div>

            {/* Features List */}
            <div className="mb-6 space-y-2">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <div className="w-1.5 h-1.5 rounded-full bg-green-500" />
                <span>New Features & Improvements</span>
              </div>
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <div className="w-1.5 h-1.5 rounded-full bg-green-500" />
                <span>Bug Fixes & Performance Improvements</span>
              </div>
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <div className="w-1.5 h-1.5 rounded-full bg-green-500" />
                <span>Security Updates</span>
              </div>
            </div>

            {/* Force Update Warning */}
            {forceUpdate && (
              <div className="mb-4 p-3 bg-red-500/10 border border-red-500/30 rounded-xl">
                <p className="text-xs text-red-400 text-center">
                  ⚠️ This update is required to continue using the app
                </p>
              </div>
            )}

            {/* Buttons */}
            <div className="space-y-3">
              <Button
                onClick={onOpenStore}
                className={`w-full h-12 rounded-xl font-semibold ${
                  forceUpdate 
                    ? 'bg-gradient-to-r from-red-500 to-orange-500 hover:opacity-90' 
                    : 'bg-gradient-to-r from-primary to-accent hover:opacity-90'
                } transition-opacity`}
              >
                <Download className="w-5 h-5 mr-2" />
                Update Now
              </Button>
              
              {!forceUpdate && (
                <Button
                  onClick={onDismiss}
                  variant="ghost"
                  className="w-full h-10 text-muted-foreground hover:text-foreground"
                >
                  Later
                </Button>
              )}
            </div>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
};

export default AppUpdateModal;
