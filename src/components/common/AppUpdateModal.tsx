import { motion, AnimatePresence } from 'framer-motion';
import { Download, X, AlertTriangle, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import rocket3d from '@/assets/update-rocket-3d.png';

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
  onUpdate: _onUpdate,
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
        className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-md p-4"
        onClick={forceUpdate ? undefined : onDismiss}
      >
        <motion.div
          initial={{ scale: 0.85, opacity: 0, y: 30 }}
          animate={{ scale: 1, opacity: 1, y: 0 }}
          exit={{ scale: 0.9, opacity: 0, y: 20 }}
          transition={{ type: 'spring', damping: 22, stiffness: 280 }}
          className="relative w-full max-w-sm rounded-[28px] overflow-hidden shadow-2xl"
          style={{
            background: 'linear-gradient(160deg, #ffffff 0%, #f8fafc 55%, #eef2ff 100%)',
            boxShadow:
              '0 30px 80px -20px rgba(79,70,229,0.45), 0 10px 30px -10px rgba(0,0,0,0.25), inset 0 1px 0 rgba(255,255,255,0.9)',
            border: '1px solid rgba(99,102,241,0.18)',
          }}
          onClick={(e) => e.stopPropagation()}
        >
          {/* Soft decorative glows */}
          <div className="absolute inset-0 overflow-hidden pointer-events-none">
            <div
              className="absolute -top-24 -right-16 w-56 h-56 rounded-full blur-3xl opacity-60"
              style={{ background: 'radial-gradient(circle, rgba(139,92,246,0.45), transparent 70%)' }}
            />
            <div
              className="absolute -bottom-24 -left-16 w-56 h-56 rounded-full blur-3xl opacity-60"
              style={{ background: 'radial-gradient(circle, rgba(34,211,238,0.40), transparent 70%)' }}
            />
          </div>

          {/* Close — hidden on force update */}
          {!forceUpdate && (
            <button
              onClick={onDismiss}
              aria-label="Close"
              className="absolute top-3 right-3 w-9 h-9 rounded-full flex items-center justify-center z-20 transition-all active:scale-90"
              style={{
                background: 'rgba(255,255,255,0.9)',
                boxShadow: '0 6px 14px -4px rgba(0,0,0,0.18), inset 0 1px 0 rgba(255,255,255,1)',
                border: '1px solid rgba(0,0,0,0.06)',
              }}
            >
              <X className="w-4 h-4 text-slate-700" strokeWidth={2.5} />
            </button>
          )}

          {/* 3D Rocket — center-aligned, floating */}
          <div className="relative pt-10 pb-2 flex items-center justify-center">
            <motion.div
              animate={{ y: [0, -10, 0], rotate: [-3, 3, -3] }}
              transition={{ duration: 3.2, repeat: Infinity, ease: 'easeInOut' }}
              className="relative"
            >
              {forceUpdate ? (
                <div
                  className="w-28 h-28 rounded-3xl flex items-center justify-center"
                  style={{
                    background: 'linear-gradient(135deg, #ef4444 0%, #f97316 100%)',
                    boxShadow: '0 20px 40px -10px rgba(239,68,68,0.55), inset 0 2px 0 rgba(255,255,255,0.4)',
                  }}
                >
                  <AlertTriangle className="w-14 h-14 text-white drop-shadow-[0_2px_4px_rgba(0,0,0,0.3)]" />
                </div>
              ) : (
                <>
                  <div
                    className="absolute inset-0 rounded-full blur-2xl opacity-70"
                    style={{
                      background: 'radial-gradient(circle, rgba(139,92,246,0.55), transparent 65%)',
                      transform: 'scale(1.15)',
                    }}
                  />
                  <img
                    src={rocket3d}
                    alt="App update"
                    width={128}
                    height={128}
                    className="relative w-32 h-32 object-contain drop-shadow-[0_18px_24px_rgba(79,70,229,0.45)]"
                  />
                </>
              )}
              <motion.div
                animate={{ scale: [1, 1.25, 1], opacity: [0.85, 1, 0.85] }}
                transition={{ duration: 1.6, repeat: Infinity }}
                className="absolute -top-1 -right-1"
              >
                <Sparkles className="w-6 h-6 text-amber-400 drop-shadow-[0_2px_4px_rgba(245,158,11,0.5)]" />
              </motion.div>
            </motion.div>
          </div>

          {/* Body */}
          <div className="relative px-6 pb-6 pt-2 text-center">
            <h2 className="text-[22px] font-extrabold tracking-tight text-slate-900 mb-2">
              {forceUpdate ? 'Important Update Required' : 'New Version Available'}
            </h2>
            <p className="text-[13.5px] leading-relaxed text-slate-600 mb-5 max-w-[280px] mx-auto">
              {updateMessage ||
                'A new version of the app is now live on Google Play. Update now to enjoy the latest features and improvements.'}
            </p>

            {/* Version pills */}
            <div
              className="flex items-stretch justify-center gap-2 mb-5 mx-auto w-fit rounded-2xl p-1"
              style={{
                background: 'rgba(99,102,241,0.06)',
                border: '1px solid rgba(99,102,241,0.15)',
              }}
            >
              <div className="px-3.5 py-2 rounded-xl bg-white/80 text-center min-w-[88px]">
                <div className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">Current</div>
                <div className="text-sm font-bold text-slate-800 mt-0.5">{currentVersion}</div>
              </div>
              <div className="flex items-center px-1">
                <div className="w-5 h-0.5 bg-gradient-to-r from-indigo-400 to-fuchsia-400 rounded-full" />
              </div>
              <div
                className="px-3.5 py-2 rounded-xl text-center min-w-[88px]"
                style={{
                  background: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
                  boxShadow: '0 6px 14px -4px rgba(99,102,241,0.55), inset 0 1px 0 rgba(255,255,255,0.35)',
                }}
              >
                <div className="text-[10px] font-semibold uppercase tracking-wider text-white/80">Latest</div>
                <div className="text-sm font-bold text-white mt-0.5">{availableVersion}</div>
              </div>
            </div>

            {/* Highlights */}
            <ul className="space-y-2 mb-6 text-left max-w-[280px] mx-auto">
              {[
                'New features and refinements',
                'Performance and stability improvements',
                'Important security updates',
              ].map((line) => (
                <li key={line} className="flex items-start gap-2.5">
                  <span
                    className="mt-1.5 w-1.5 h-1.5 rounded-full flex-shrink-0"
                    style={{ background: 'linear-gradient(135deg, #6366f1, #8b5cf6)' }}
                  />
                  <span className="text-[13px] text-slate-600 leading-snug">{line}</span>
                </li>
              ))}
            </ul>

            {forceUpdate && (
              <div
                className="mb-4 px-3 py-2.5 rounded-xl text-center"
                style={{
                  background: 'rgba(239,68,68,0.08)',
                  border: '1px solid rgba(239,68,68,0.25)',
                }}
              >
                <p className="text-[12px] font-medium text-red-600">
                  This update is required to keep using the app.
                </p>
              </div>
            )}

            <div className="space-y-2.5">
              <Button
                onClick={onOpenStore}
                className="w-full h-12 rounded-2xl font-bold text-[15px] text-white border-0 transition-all active:scale-[0.98]"
                style={{
                  background: forceUpdate
                    ? 'linear-gradient(135deg, #ef4444, #f97316)'
                    : 'linear-gradient(135deg, #6366f1 0%, #8b5cf6 50%, #d946ef 100%)',
                  boxShadow: forceUpdate
                    ? '0 12px 28px -8px rgba(239,68,68,0.55), inset 0 1px 0 rgba(255,255,255,0.35)'
                    : '0 12px 28px -8px rgba(139,92,246,0.6), inset 0 1px 0 rgba(255,255,255,0.35)',
                }}
              >
                <Download className="w-5 h-5 mr-2" />
                Update on Play Store
              </Button>

              {!forceUpdate && (
                <button
                  onClick={onDismiss}
                  className="w-full h-10 rounded-2xl text-[13.5px] font-semibold text-slate-500 hover:text-slate-800 transition-colors"
                >
                  Maybe later
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
