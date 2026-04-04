import { motion, AnimatePresence } from "framer-motion";
import { Button } from "@/components/ui/button";

interface ChametStyleCloseModalProps {
  isOpen: boolean;
  onCancel: () => void;
  onConfirm: () => void;
  isHost?: boolean;
}

export const ChametStyleCloseModal = ({
  isOpen,
  onCancel,
  onConfirm,
  isHost = false
}: ChametStyleCloseModalProps) => {
  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/50 z-[100]"
            onClick={onCancel}
          />

          {/* Modal */}
          <motion.div
            initial={{ opacity: 0, scale: 0.9, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.9, y: 20 }}
            transition={{ type: "spring", damping: 25, stiffness: 300 }}
            className="fixed left-4 right-4 top-1/2 -translate-y-1/2 z-[100]"
          >
            <div className="bg-white rounded-3xl shadow-2xl overflow-hidden max-w-sm mx-auto">
              {/* Content */}
              <div className="p-8 text-center">
                <h2 className="text-xl font-bold text-gray-900 mb-6">
                  {isHost ? "Are you sure to close the Party?" : "Are you sure to leave the Party?"}
                </h2>
                
                {/* Buttons */}
                <div className="flex gap-4">
                  <Button
                    variant="ghost"
                    onClick={onCancel}
                    className="flex-1 h-12 rounded-full text-gray-500 hover:text-gray-700 hover:bg-gray-100 text-lg font-medium"
                  >
                    Cancel
                  </Button>
                  <Button
                    onClick={onConfirm}
                    className="flex-1 h-12 rounded-full bg-gradient-to-r from-purple-500 to-violet-500 hover:from-purple-600 hover:to-violet-600 text-white text-lg font-medium shadow-lg shadow-purple-500/30"
                  >
                    Confirm
                  </Button>
                </div>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
};

export default ChametStyleCloseModal;
