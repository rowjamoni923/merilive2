import { motion, AnimatePresence } from "framer-motion";
import { Radio, Home, PhoneOff } from "lucide-react";

interface HostCallReturnModalProps {
  open: boolean;
  onBackToLive: () => void;
  onBackToHome: () => void;
  hostName?: string;
}

/**
 * Shown to the HOST after a private call (accepted while broadcasting) ends.
 * Industry pattern (Chamet/Bigo): host chooses to resume the live stream
 * OR end it and return to home.
 */
const HostCallReturnModal = ({ open, onBackToLive, onBackToHome, hostName }: HostCallReturnModalProps) => {
  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[200] flex items-center justify-center bg-black/80 backdrop-blur-sm px-6"
        >
          <motion.div
            initial={{ scale: 0.9, y: 20 }}
            animate={{ scale: 1, y: 0 }}
            exit={{ scale: 0.9, y: 20 }}
            transition={{ type: "spring", damping: 22, stiffness: 280 }}
            className="w-full max-w-sm rounded-3xl overflow-hidden"
            style={{
              background:
                "linear-gradient(145deg, rgba(15,5,30,0.96) 0%, rgba(45,27,105,0.94) 50%, rgba(15,5,30,0.96) 100%)",
              border: "1px solid rgba(168,85,247,0.35)",
              boxShadow: "0 20px 60px rgba(0,0,0,0.6), 0 0 30px rgba(168,85,247,0.2)",
            }}
          >
            <div className="px-6 pt-7 pb-2 text-center">
              <div className="mx-auto w-14 h-14 rounded-2xl bg-gradient-to-br from-fuchsia-500 to-purple-600 flex items-center justify-center mb-3 shadow-lg">
                <PhoneOff className="w-7 h-7 text-white" />
              </div>
              <h3 className="text-white text-lg font-bold">Call Ended</h3>
              <p className="text-white/55 text-sm mt-1">
                Your live stream is still running. What would you like to do?
              </p>
            </div>

            <div className="px-6 pb-6 pt-4 space-y-2.5">
              <button
                onClick={onBackToLive}
                className="w-full py-3 rounded-2xl font-bold text-white flex items-center justify-center gap-2 transition active:scale-[0.98]"
                style={{
                  background: "linear-gradient(135deg, #a855f7, #ec4899)",
                  boxShadow: "0 6px 20px rgba(168,85,247,0.35), inset 0 1px 0 rgba(255,255,255,0.18)",
                }}
              >
                <Radio className="w-4 h-4" />
                Back to Live
              </button>
              <button
                onClick={onBackToHome}
                className="w-full py-3 rounded-2xl font-bold text-white/85 flex items-center justify-center gap-2 transition active:scale-[0.98] bg-white/5 border border-white/10 hover:bg-white/10"
              >
                <Home className="w-4 h-4" />
                Back to Home
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

export default HostCallReturnModal;
