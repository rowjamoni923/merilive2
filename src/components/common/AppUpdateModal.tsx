import { motion, AnimatePresence } from 'framer-motion';
import { Download, X, Sparkles, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';

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

/**
 * Professional, compact update prompt.
 * — No full-screen takeover. Centered card, max-w-[320px], auto height.
 * — No giant hero image; small gradient icon badge in the header.
 * — Reads cleanly on a 360–390px phone without scrolling.
 */
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
        transition={{ duration: 0.18 }}
        className="fixed inset-0 z-[100] flex items-center justify-center bg-black/55 backdrop-blur-sm p-4"
        onClick={forceUpdate ? undefined : onDismiss}
        role="dialog"
        aria-modal="true"
        aria-labelledby="app-update-title"
      >
        <motion.div
          initial={{ scale: 0.94, opacity: 0, y: 12 }}
          animate={{ scale: 1, opacity: 1, y: 0 }}
          exit={{ scale: 0.94, opacity: 0, y: 8 }}
          transition={{ type: 'spring', damping: 26, stiffness: 320 }}
          className="relative w-full max-w-[320px] rounded-2xl bg-card border border-border shadow-2xl overflow-hidden"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Close button (only when optional update) */}
          {!forceUpdate && (
            <button
              onClick={onDismiss}
              aria-label="Dismiss update"
              className="absolute top-2.5 right-2.5 p-1.5 rounded-full text-muted-foreground hover:text-foreground hover:bg-muted/60 transition-colors z-10"
            >
              <X className="w-4 h-4" />
            </button>
          )}

          <div className="px-5 pt-5 pb-4">
            {/* Header — compact icon badge */}
            <div className="flex items-start gap-3 mb-3">
              <div
                className={`flex-shrink-0 w-11 h-11 rounded-xl flex items-center justify-center ${
                  forceUpdate
                    ? 'bg-gradient-to-br from-red-500 to-orange-500'
                    : 'bg-gradient-to-br from-primary to-accent'
                } shadow-md`}
              >
                {forceUpdate ? (
                  <AlertTriangle className="w-5 h-5 text-white" />
                ) : (
                  <Sparkles className="w-5 h-5 text-white" />
                )}
              </div>
              <div className="min-w-0 flex-1 pr-6">
                <h2
                  id="app-update-title"
                  className="text-[15px] font-semibold text-foreground leading-tight"
                >
                  {forceUpdate ? 'Update required' : 'Update available'}
                </h2>
                <p className="text-[12px] text-muted-foreground mt-0.5 leading-snug line-clamp-2">
                  {updateMessage || 'A new version is live on Play Store.'}
                </p>
              </div>
            </div>

            {/* Version row — single compact line */}
            <div className="flex items-center justify-between bg-muted/50 rounded-lg px-3 py-2 mb-4">
              <span className="text-[11px] text-muted-foreground tabular-nums">
                v{currentVersion}
              </span>
              <span className="text-[11px] text-muted-foreground">→</span>
              <span className="text-[12px] font-semibold text-primary tabular-nums">
                v{availableVersion}
              </span>
            </div>

            {/* Actions */}
            <div className="flex flex-col gap-2">
              <Button
                onClick={onOpenStore}
                className={`w-full h-10 rounded-lg text-[13px] font-semibold ${
                  forceUpdate
                    ? 'bg-gradient-to-r from-red-500 to-orange-500 hover:opacity-95 text-white'
                    : 'bg-gradient-to-r from-primary to-accent hover:opacity-95 text-primary-foreground'
                }`}
              >
                <Download className="w-4 h-4 mr-1.5" />
                Update now
              </Button>

              {!forceUpdate && (
                <button
                  onClick={onDismiss}
                  className="w-full h-8 text-[12px] text-muted-foreground hover:text-foreground transition-colors"
                >
                  Later
                </button>
              )}
            </div>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
};

export default AppUpdateModal;
