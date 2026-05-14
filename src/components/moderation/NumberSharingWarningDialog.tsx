import { useState, useCallback, forwardRef } from 'react';
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogAction,
} from '@/components/ui/alert-dialog';
import { ShieldAlert, AlertTriangle, Ban } from 'lucide-react';

const DialogBody = forwardRef<HTMLDivElement, React.HTMLAttributes<HTMLDivElement>>(
  ({ children, ...props }, ref) => (
    <div ref={ref} {...props}>
      {children}
    </div>
  )
);

DialogBody.displayName = 'DialogBody';

interface ViolationWarningProps {
  open: boolean;
  onClose: () => void;
  violationNumber: number;
  beansDeducted: number;
  isBanned: boolean;
  isGenericWarning?: boolean; // For non-host users
}

export function NumberSharingWarningDialog({
  open,
  onClose,
  violationNumber,
  beansDeducted,
  isBanned,
  isGenericWarning = false,
}: ViolationWarningProps) {
  // Generic warning for non-host users
  if (isGenericWarning) {
    return (
      <AlertDialog open={open} onOpenChange={onClose}>
        <AlertDialogContent className="bg-gradient-to-br from-[#FFFBF2] via-[#FAF5EA] to-rose-50 border border-rose-200/70 max-w-sm rounded-2xl shadow-2xl shadow-rose-900/10">
          <AlertDialogHeader>
            <DialogBody className="flex justify-center mb-2">
              <div className="w-14 h-14 rounded-full bg-gradient-to-br from-rose-500 to-red-600 flex items-center justify-center shadow-lg shadow-rose-500/30">
                <ShieldAlert className="w-7 h-7 text-white animate-pulse" />
              </div>
            </DialogBody>
            <AlertDialogTitle className="text-slate-900 text-center text-lg font-bold">
              🚫 Contact Sharing Prohibited
            </AlertDialogTitle>
            <AlertDialogDescription className="text-center space-y-3">
              <p className="text-slate-700 text-sm">
                Sharing phone numbers, social media links, or personal contact information is <strong className="text-rose-700">strictly prohibited</strong> on this platform.
              </p>
              <div className="bg-rose-100/70 border border-rose-200 rounded-lg p-3">
                <p className="text-rose-800 font-medium text-sm">
                  ⚠️ Your message was flagged and reported to admin
                </p>
              </div>
              <p className="text-slate-500 text-xs">
                Repeated violations may result in account suspension or permanent ban.
              </p>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="justify-center">
            <AlertDialogAction
              onClick={onClose}
              className="bg-gradient-to-r from-rose-600 to-red-600 hover:from-rose-700 hover:to-red-700 text-white min-w-[140px] rounded-xl shadow-lg shadow-rose-500/25"
            >
              OK, I Understand
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    );
  }

  if (isBanned) {
    return (
      <AlertDialog open={open} onOpenChange={onClose}>
        <AlertDialogContent className="bg-gradient-to-br from-[#FFFBF2] via-[#FAF5EA] to-rose-50 border border-rose-300/70 max-w-sm rounded-2xl shadow-2xl shadow-rose-900/10">
          <AlertDialogHeader>
            <DialogBody className="flex justify-center mb-2">
              <div className="w-14 h-14 rounded-full bg-gradient-to-br from-rose-600 to-red-700 flex items-center justify-center shadow-lg shadow-rose-500/30">
                <Ban className="w-7 h-7 text-white animate-pulse" />
              </div>
            </DialogBody>
            <AlertDialogTitle className="text-slate-900 text-center text-lg font-bold">
              ⛔ Account Suspended
            </AlertDialogTitle>
            <AlertDialogDescription className="text-slate-700 text-center text-sm">
              Your account has been permanently suspended due to repeated contact sharing violations.
              You are no longer allowed to use this platform.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="justify-center">
            <AlertDialogAction
              onClick={onClose}
              className="bg-gradient-to-r from-rose-600 to-red-700 hover:from-rose-700 hover:to-red-800 text-white rounded-xl shadow-lg shadow-rose-500/25"
            >
              OK
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    );
  }

  const getWarningLevel = () => {
    if (violationNumber <= 2) return 'warning';
    if (violationNumber <= 4) return 'serious';
    return 'critical';
  };

  const level = getWarningLevel();

  const bgClass = level === 'critical'
    ? 'bg-gradient-to-br from-[#FFFBF2] via-[#FAF5EA] to-rose-50 border border-rose-300/70'
    : level === 'serious'
    ? 'bg-gradient-to-br from-[#FFFBF2] via-[#FAF5EA] to-orange-50 border border-orange-300/70'
    : 'bg-gradient-to-br from-[#FFFBF2] via-[#FAF5EA] to-amber-50 border border-amber-300/70';

  const iconRing = level === 'critical'
    ? 'from-rose-500 to-red-600 shadow-rose-500/30'
    : level === 'serious'
    ? 'from-orange-500 to-amber-600 shadow-orange-500/30'
    : 'from-amber-400 to-yellow-500 shadow-amber-500/30';
  const titleColor = 'text-slate-900';
  const accentText = level === 'critical' ? 'text-rose-700' : level === 'serious' ? 'text-orange-700' : 'text-amber-700';
  const chipBg = level === 'critical'
    ? 'bg-rose-100/70 border-rose-200'
    : level === 'serious'
    ? 'bg-orange-100/70 border-orange-200'
    : 'bg-amber-100/70 border-amber-200';
  const btnClass = level === 'critical'
    ? 'bg-gradient-to-r from-rose-600 to-red-600 hover:from-rose-700 hover:to-red-700 shadow-rose-500/25'
    : level === 'serious'
    ? 'bg-gradient-to-r from-orange-500 to-amber-600 hover:from-orange-600 hover:to-amber-700 shadow-orange-500/25'
    : 'bg-gradient-to-r from-amber-500 to-yellow-600 hover:from-amber-600 hover:to-yellow-700 shadow-amber-500/25';

  return (
    <AlertDialog open={open} onOpenChange={onClose}>
      <AlertDialogContent className={`${bgClass} max-w-sm rounded-2xl shadow-2xl shadow-rose-900/10`}>
        <AlertDialogHeader>
          <div className="flex justify-center mb-2">
            <div className={`w-14 h-14 rounded-full bg-gradient-to-br ${iconRing} flex items-center justify-center shadow-lg`}>
              {level === 'critical' ? (
                <ShieldAlert className="w-7 h-7 text-white animate-pulse" />
              ) : (
                <AlertTriangle className="w-7 h-7 text-white" />
              )}
            </div>
          </div>
          <AlertDialogTitle className={`${titleColor} text-center text-lg font-bold`}>
            ⚠️ Warning — Violation #{violationNumber}
          </AlertDialogTitle>
          <AlertDialogDescription className="text-center space-y-3">
            <p className="text-slate-700 text-sm">
              Sharing phone numbers or contact information is <strong className={accentText}>strictly prohibited</strong> on this platform.
            </p>
            <div className={`${chipBg} border rounded-lg p-3`}>
              <p className="text-slate-900 font-bold text-base">
                −{beansDeducted.toLocaleString()} Beans Deducted
              </p>
              <p className="text-slate-600 text-xs mt-1">
                Violation {violationNumber} of 5
              </p>
            </div>
            {violationNumber >= 3 && (
              <p className="text-rose-700 text-xs font-medium">
                🚨 {6 - violationNumber} more violation{6 - violationNumber > 1 ? 's' : ''} will result in <strong>permanent account suspension</strong>.
              </p>
            )}
            {violationNumber < 3 && (
              <p className="text-slate-500 text-xs">
                Repeated violations will lead to heavier penalties and eventual account suspension.
              </p>
            )}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter className="justify-center">
          <AlertDialogAction
            onClick={onClose}
            className={`${btnClass} text-white min-w-[140px] rounded-xl shadow-lg`}
          >
            OK, I Understand
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

// Hook for easy integration
export function useNumberSharingWarning() {
  const [warningState, setWarningState] = useState<{
    open: boolean;
    violationNumber: number;
    beansDeducted: number;
    isBanned: boolean;
    isGenericWarning: boolean;
  }>({ open: false, violationNumber: 0, beansDeducted: 0, isBanned: false, isGenericWarning: false });

  const showWarning = useCallback((violationNumber: number, beansDeducted: number, isBanned: boolean) => {
    setWarningState({ open: true, violationNumber, beansDeducted, isBanned, isGenericWarning: false });
  }, []);

  const showGenericWarning = useCallback(() => {
    setWarningState({ open: true, violationNumber: 0, beansDeducted: 0, isBanned: false, isGenericWarning: true });
  }, []);

  const closeWarning = useCallback(() => {
    setWarningState(prev => ({ ...prev, open: false }));
  }, []);

  return { warningState, showWarning, showGenericWarning, closeWarning };
}
