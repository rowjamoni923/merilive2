import { ReactNode } from 'react';
import { cn } from '@/lib/utils';

interface MobilePageWrapperProps {
  children: ReactNode;
  className?: string;
  showBottomNav?: boolean;
  headerContent?: ReactNode;
  bgGradient?: string;
}

/**
 * Universal Mobile Page Wrapper
 * Provides consistent mobile optimization across all pages:
 * - Fixed viewport for all phone types (notch, dynamic island, gesture nav)
 * - Safe area insets for iOS/Android
 * - Proper bottom padding for navigation
 * - Native scrolling behavior
 */
export const MobilePageWrapper = ({
  children,
  className,
  showBottomNav = true,
  headerContent,
  bgGradient,
}: MobilePageWrapperProps) => {
  return (
    <div 
      className={cn(
        'fixed inset-0 flex flex-col overflow-hidden',
        bgGradient || 'bg-background',
        className
      )}
    >
      {/* Optional Header */}
      {headerContent && (
        <div className="flex-shrink-0 safe-area-top">
          {headerContent}
        </div>
      )}
      
      {/* Scrollable Content */}
      <main 
        className="flex-1 overflow-y-auto overscroll-contain"
        style={{ 
          WebkitOverflowScrolling: 'touch',
          paddingBottom: showBottomNav 
            ? 'var(--content-bottom-padding)' 
            : 'max(env(safe-area-inset-bottom, 0px), var(--min-bottom-inset, 0px))'
        }}
      >
        {children}
      </main>
    </div>
  );
};

/**
 * Simple Scrollable Content wrapper for pages that manage their own header
 */
export const MobileScrollableContent = ({
  children,
  className,
  showBottomNav = true,
}: {
  children: ReactNode;
  className?: string;
  showBottomNav?: boolean;
}) => {
  return (
    <main 
      className={cn(
        'flex-1 overflow-y-auto overscroll-contain',
        className
      )}
      style={{ 
        WebkitOverflowScrolling: 'touch',
        paddingBottom: showBottomNav 
          ? 'var(--content-bottom-padding)' 
          : 'max(env(safe-area-inset-bottom, 0px), var(--min-bottom-inset, 0px))'
      }}
    >
      {children}
    </main>
  );
};

export default MobilePageWrapper;
