import { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Wifi, WifiOff, RefreshCw } from 'lucide-react';
import { formatLastUpdate } from '@/hooks/useRealtimeData';

interface RealtimeIndicatorProps {
  lastUpdate: Date;
  isConnected?: boolean;
  onRefresh?: () => void;
  showTime?: boolean;
}

export function RealtimeIndicator({ 
  lastUpdate, 
  isConnected = true, 
  onRefresh,
  showTime = true 
}: RealtimeIndicatorProps) {
  const [timeAgo, setTimeAgo] = useState(formatLastUpdate(lastUpdate));
  const [pulse, setPulse] = useState(false);

  // Update time ago every second
  useEffect(() => {
    const interval = setInterval(() => {
      setTimeAgo(formatLastUpdate(lastUpdate));
    }, 1000);

    return () => clearInterval(interval);
  }, [lastUpdate]);

  // Pulse effect when data updates
  useEffect(() => {
    setPulse(true);
    const timeout = setTimeout(() => setPulse(false), 500);
    return () => clearTimeout(timeout);
  }, [lastUpdate]);

  return (
    <div className="flex items-center gap-2 text-xs">
      <AnimatePresence mode="wait">
        {isConnected ? (
          <motion.div
            key="connected"
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            exit={{ scale: 0 }}
            className="flex items-center gap-1"
          >
            <motion.div
              animate={pulse ? { scale: [1, 1.5, 1] } : {}}
              className="relative"
            >
              <Wifi className="w-3 h-3 text-green-500" />
              <motion.div
                animate={{ opacity: [1, 0] }}
                transition={{ duration: 1, repeat: Infinity }}
                className="absolute inset-0 bg-green-500 rounded-full opacity-50 blur-sm"
              />
            </motion.div>
            <span className="text-green-500 font-medium">Live</span>
          </motion.div>
        ) : (
          <motion.div
            key="disconnected"
            initial={{ scale: 0 }}
            animate={{ scale: 1 }}
            exit={{ scale: 0 }}
            className="flex items-center gap-1"
          >
            <WifiOff className="w-3 h-3 text-red-500" />
            <span className="text-red-500 font-medium">Offline</span>
          </motion.div>
        )}
      </AnimatePresence>

      {showTime && (
        <span className="text-muted-foreground">
          {timeAgo}
        </span>
      )}

      {onRefresh && (
        <button
          onClick={onRefresh}
          className="p-1 hover:bg-muted rounded-full transition-colors"
        >
          <RefreshCw className="w-3 h-3 text-muted-foreground" />
        </button>
      )}
    </div>
  );
}

// Animated counter for real-time numbers
interface AnimatedCounterProps {
  value: number;
  prefix?: string;
  suffix?: string;
  className?: string;
  duration?: number;
}

export function AnimatedCounter({ 
  value, 
  prefix = '', 
  suffix = '',
  className = '',
  duration = 500
}: AnimatedCounterProps) {
  const [displayValue, setDisplayValue] = useState(value);
  const [isAnimating, setIsAnimating] = useState(false);

  useEffect(() => {
    if (displayValue === value) return;

    setIsAnimating(true);
    const startValue = displayValue;
    const diff = value - startValue;
    const startTime = Date.now();

    const animate = () => {
      const elapsed = Date.now() - startTime;
      const progress = Math.min(elapsed / duration, 1);
      
      // Easing function
      const eased = 1 - Math.pow(1 - progress, 3);
      
      const current = Math.round(startValue + diff * eased);
      setDisplayValue(current);

      if (progress < 1) {
        requestAnimationFrame(animate);
      } else {
        setIsAnimating(false);
      }
    };

    requestAnimationFrame(animate);
  }, [value, duration]);

  return (
    <motion.span
      className={className}
      animate={isAnimating ? { 
        scale: [1, 1.1, 1],
        color: ['inherit', 'hsl(var(--primary))', 'inherit']
      } : {}}
      transition={{ duration: 0.3 }}
    >
      {prefix}{displayValue.toLocaleString()}{suffix}
    </motion.span>
  );
}

// Notification toast for real-time events
interface RealtimeToastProps {
  message: string;
  icon?: React.ReactNode;
  type?: 'gift' | 'earning' | 'viewer' | 'default';
}

export function RealtimeToast({ message, icon, type = 'default' }: RealtimeToastProps) {
  const bgColors = {
    gift: 'bg-gradient-to-r from-pink-500/20 to-purple-500/20 border-pink-500/30',
    earning: 'bg-gradient-to-r from-yellow-500/20 to-orange-500/20 border-yellow-500/30',
    viewer: 'bg-gradient-to-r from-blue-500/20 to-cyan-500/20 border-blue-500/30',
    default: 'bg-muted/50 border-border'
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 50, scale: 0.9 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: -20, scale: 0.9 }}
      className={`flex items-center gap-2 px-4 py-2 rounded-full border backdrop-blur-sm ${bgColors[type]}`}
    >
      {icon}
      <span className="text-sm font-medium">{message}</span>
    </motion.div>
  );
}

// Live pulse indicator
export function LivePulse({ size = 'sm' }: { size?: 'sm' | 'md' | 'lg' }) {
  const sizes = {
    sm: 'w-2 h-2',
    md: 'w-3 h-3',
    lg: 'w-4 h-4'
  };

  return (
    <span className="relative flex">
      <motion.span
        animate={{ scale: [1, 1.5, 1], opacity: [0.7, 0, 0.7] }}
        transition={{ duration: 1.5, repeat: Infinity }}
        className={`absolute inline-flex ${sizes[size]} rounded-full bg-red-500`}
      />
      <span className={`relative inline-flex ${sizes[size]} rounded-full bg-red-500`} />
    </span>
  );
}