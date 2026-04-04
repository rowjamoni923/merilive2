/**
 * Network Status Bar Component
 * Shows a notification bar when network is disconnected
 */

import { forwardRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { WifiOff } from 'lucide-react';
import { useNetworkStatus } from '@/hooks/useNetworkStatus';

const NetworkStatusBar = forwardRef<HTMLDivElement>((_, ref) => {
  const { connected } = useNetworkStatus(false); // Don't show toast, we show bar instead

  return (
    <div ref={ref}>
      <AnimatePresence>
        {!connected && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="fixed top-0 left-0 right-0 z-[200] bg-destructive text-destructive-foreground safe-area-top"
          >
            <div className="flex items-center justify-center gap-2 py-2 px-4 text-sm font-medium">
              <WifiOff className="w-4 h-4" />
              <span>No Internet Connection</span>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
});

NetworkStatusBar.displayName = 'NetworkStatusBar';

export { NetworkStatusBar };
export default NetworkStatusBar;
