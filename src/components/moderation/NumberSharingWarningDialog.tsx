import { useState, useCallback } from 'react';
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
        <AlertDialogContent className="bg-red-950 border-red-500/50 max-w-sm">
          <AlertDialogHeader>
            <div className="flex justify-center mb-2">
              <ShieldAlert className="w-12 h-12 text-red-400 animate-pulse" />
            </div>
            <AlertDialogTitle className="text-red-300 text-center text-lg">
              🚫 Contact Sharing Prohibited
            </AlertDialogTitle>
            <AlertDialogDescription className="text-center space-y-3">
              <p className="text-gray-200 text-sm">
                Sharing phone numbers, social media links, or personal contact information is <strong className="text-white">strictly prohibited</strong> on this platform.
              </p>
              <div className="bg-red-900/50 rounded-lg p-3">
                <p className="text-red-200 font-medium text-sm">
                  ⚠️ Your message was flagged and reported to admin
                </p>
              </div>
              <p className="text-gray-400 text-xs">
                Repeated violations may result in account suspension or permanent ban.
              </p>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="justify-center">
            <AlertDialogAction
              onClick={onClose}
              className="bg-red-600 hover:bg-red-700 text-white min-w-[120px]"
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
        <AlertDialogContent className="bg-red-950 border-red-500/50 max-w-sm">
          <AlertDialogHeader>
            <div className="flex justify-center mb-2">
              <Ban className="w-12 h-12 text-red-400 animate-pulse" />
            </div>
            <AlertDialogTitle className="text-red-300 text-center text-lg">
              ⛔ Account Suspended
            </AlertDialogTitle>
            <AlertDialogDescription className="text-red-200/80 text-center text-sm">
              Your account has been permanently suspended due to repeated contact sharing violations. 
              You are no longer allowed to use this platform.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="justify-center">
            <AlertDialogAction
              onClick={onClose}
              className="bg-red-600 hover:bg-red-700 text-white"
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
    ? 'bg-red-950 border-red-500/50' 
    : level === 'serious' 
    ? 'bg-orange-950 border-orange-500/50' 
    : 'bg-yellow-950 border-yellow-500/50';

  const iconColor = level === 'critical' ? 'text-red-400' : level === 'serious' ? 'text-orange-400' : 'text-yellow-400';
  const titleColor = level === 'critical' ? 'text-red-300' : level === 'serious' ? 'text-orange-300' : 'text-yellow-300';
  const btnClass = level === 'critical' 
    ? 'bg-red-600 hover:bg-red-700' 
    : level === 'serious' 
    ? 'bg-orange-600 hover:bg-orange-700' 
    : 'bg-yellow-600 hover:bg-yellow-700';

  return (
    <AlertDialog open={open} onOpenChange={onClose}>
      <AlertDialogContent className={`${bgClass} max-w-sm`}>
        <AlertDialogHeader>
          <div className="flex justify-center mb-2">
            {level === 'critical' ? (
              <ShieldAlert className={`w-12 h-12 ${iconColor} animate-pulse`} />
            ) : (
              <AlertTriangle className={`w-12 h-12 ${iconColor}`} />
            )}
          </div>
          <AlertDialogTitle className={`${titleColor} text-center text-lg`}>
            ⚠️ Warning — Violation #{violationNumber}
          </AlertDialogTitle>
          <AlertDialogDescription className="text-center space-y-3">
            <p className="text-gray-200 text-sm">
              Sharing phone numbers or contact information is <strong className="text-white">strictly prohibited</strong> on this platform.
            </p>
            <div className={`${level === 'critical' ? 'bg-red-900/50' : level === 'serious' ? 'bg-orange-900/50' : 'bg-yellow-900/50'} rounded-lg p-3`}>
              <p className="text-white font-bold text-base">
                −{beansDeducted.toLocaleString()} Beans Deducted
              </p>
              <p className="text-gray-300 text-xs mt-1">
                Violation {violationNumber} of 5
              </p>
            </div>
            {violationNumber >= 3 && (
              <p className="text-red-300 text-xs font-medium">
                🚨 {6 - violationNumber} more violation{6 - violationNumber > 1 ? 's' : ''} will result in <strong>permanent account suspension</strong>.
              </p>
            )}
            {violationNumber < 3 && (
              <p className="text-gray-400 text-xs">
                Repeated violations will lead to heavier penalties and eventual account suspension.
              </p>
            )}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter className="justify-center">
          <AlertDialogAction
            onClick={onClose}
            className={`${btnClass} text-white min-w-[120px]`}
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
