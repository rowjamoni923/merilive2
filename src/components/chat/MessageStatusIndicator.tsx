import { Check, CheckCheck, Clock, CloudOff } from 'lucide-react';
import { cn } from '@/lib/utils';

interface MessageStatusIndicatorProps {
  status: 'sending' | 'queued' | 'sent' | 'delivered' | 'read';
  isMine: boolean;
  className?: string;
  iconClassName?: string;
}

/**
 * Messenger-grade message delivery status indicator
 * ⏳ sending  |  ☁️✕ queued (offline)  |  ✓ sent  |  ✓✓ delivered  |  ✓✓ (blue) read
 */
export const MessageStatusIndicator = ({ status, isMine, className, iconClassName }: MessageStatusIndicatorProps) => {
  if (!isMine) return null;

  const mutedIconClass = cn("w-3 h-3", iconClassName || "text-muted-foreground");
  const readIconClass = cn("w-3 h-3", iconClassName || "text-primary");

  return (
    <span className={cn("inline-flex items-center ml-1", className)}>
      {status === 'sending' && (
        <Clock className={cn(mutedIconClass, "animate-pulse")} />
      )}
      {status === 'queued' && (
        <CloudOff className={mutedIconClass} aria-label="Queued — will send when online" />
      )}
      {status === 'sent' && (
        <Check className={mutedIconClass} />
      )}
      {status === 'delivered' && (
        <CheckCheck className={mutedIconClass} />
      )}
      {status === 'read' && (
        <CheckCheck className={readIconClass} />
      )}
    </span>
  );
};

export default MessageStatusIndicator;

