import { Check, CheckCheck, Clock } from 'lucide-react';
import { cn } from '@/lib/utils';

interface MessageStatusIndicatorProps {
  status: 'sending' | 'sent' | 'delivered' | 'read';
  isMine: boolean;
  className?: string;
}

/**
 * Messenger-grade message delivery status indicator
 * ⏳ sending  |  ✓ sent  |  ✓✓ delivered  |  ✓✓ (blue) read
 */
export const MessageStatusIndicator = ({ status, isMine, className }: MessageStatusIndicatorProps) => {
  if (!isMine) return null;

  return (
    <span className={cn("inline-flex items-center ml-1", className)}>
      {status === 'sending' && (
        <Clock className="w-3 h-3 text-slate-500 animate-pulse" />
      )}
      {status === 'sent' && (
        <Check className="w-3 h-3 text-slate-400" />
      )}
      {status === 'delivered' && (
        <CheckCheck className="w-3 h-3 text-slate-400" />
      )}
      {status === 'read' && (
        <CheckCheck className="w-3 h-3 text-blue-400" />
      )}
    </span>
  );
};

export default MessageStatusIndicator;
