import { Check, CheckCheck, Clock, CloudOff } from 'lucide-react';
import { cn } from '@/lib/utils';

interface MessageStatusIndicatorProps {
  status: 'sending' | 'queued' | 'sent' | 'delivered' | 'read';
  isMine: boolean;
  className?: string;
}

/**
 * Messenger-grade message delivery status indicator
 * ⏳ sending  |  ☁️✕ queued (offline)  |  ✓ sent  |  ✓✓ delivered  |  ✓✓ (blue) read
 */
export const MessageStatusIndicator = ({ status, isMine, className }: MessageStatusIndicatorProps) => {
  if (!isMine) return null;

  return (
    <span className={cn("inline-flex items-center ml-1", className)}>
      {status === 'sending' && (
        <Clock className="w-3 h-3 text-muted-foreground animate-pulse" />
      )}
      {status === 'queued' && (
        <CloudOff className="w-3 h-3 text-muted-foreground" aria-label="Queued — will send when online" />
      )}
      {status === 'sent' && (
        <Check className="w-3 h-3 text-muted-foreground" />
      )}
      {status === 'delivered' && (
        <CheckCheck className="w-3 h-3 text-muted-foreground" />
      )}
      {status === 'read' && (
        <CheckCheck className="w-3 h-3 text-primary" />
      )}
    </span>
  );
};

export default MessageStatusIndicator;

