import { motion } from 'framer-motion';
import { Monitor, MonitorOff } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

interface ScreenShareButtonProps {
  isSharing: boolean;
  onStartShare: () => Promise<void>;
  onStopShare: () => Promise<void>;
  disabled?: boolean;
  className?: string;
}

export function ScreenShareButton({
  isSharing,
  onStartShare,
  onStopShare,
  disabled = false,
  className,
}: ScreenShareButtonProps) {
  const handleClick = async () => {
    try {
      if (isSharing) {
        await onStopShare();
        toast.success('Screen share stopped');
      } else {
        await onStartShare();
        toast.success('Screen share started');
      }
    } catch (error: any) {
      if (error.message?.includes('Permission') || error.code === 'PERMISSION_DENIED') {
        // User cancelled - no need to show error
        return;
      }
      toast.error('Failed to share screen');
    }
  };

  return (
    <motion.div whileTap={{ scale: 0.95 }}>
      <Button
        variant="ghost"
        size="icon"
        onClick={handleClick}
        disabled={disabled}
        className={cn(
          "rounded-full relative overflow-hidden",
          isSharing
            ? "bg-blue-500 text-white hover:bg-blue-600"
            : "bg-black/40 text-white hover:bg-black/60",
          className
        )}
      >
        {isSharing ? (
          <>
            <MonitorOff className="w-5 h-5" />
            <motion.div
              className="absolute inset-0 bg-blue-400/30"
              animate={{ opacity: [0.3, 0.6, 0.3] }}
              transition={{ duration: 1.5, repeat: Infinity }}
            />
          </>
        ) : (
          <Monitor className="w-5 h-5" />
        )}
      </Button>
    </motion.div>
  );
}

// Floating indicator when screen sharing is active
export function ScreenShareIndicator({ isSharing }: { isSharing: boolean }) {
  if (!isSharing) return null;

  return (
    <motion.div
      initial={{ opacity: 0, y: -20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      className="absolute top-24 left-1/2 -translate-x-1/2 z-50"
    >
      <div className="flex items-center gap-2 px-4 py-2 bg-blue-500/90 backdrop-blur-sm rounded-full shadow-lg">
        <motion.div
          className="w-2 h-2 bg-white rounded-full"
          animate={{ opacity: [1, 0.5, 1] }}
          transition={{ duration: 1, repeat: Infinity }}
        />
        <Monitor className="w-4 h-4 text-white" />
        <span className="text-white text-sm font-medium">Screen Share Active</span>
      </div>
    </motion.div>
  );
}
