import React from 'react';
import { cn } from '@/lib/utils';
import UniversalAnimationPlayer from '@/components/common/UniversalAnimationPlayer';

interface MessageBubbleWrapperProps {
  /** SVGA / Lottie / GIF / WebP / PNG URL of the designer chat bubble. If null/empty falls back to children only. */
  bubbleUrl?: string | null;
  /** Children = the message content (text + badges). Will be rendered ON TOP of the bubble inside the safe area. */
  children: React.ReactNode;
  /** Extra className for outer wrapper */
  className?: string;
  /** 
   * Inner padding that defines the "safe area" inside the SVGA bubble where the message text sits.
   * Industry standard for designer chat bubbles is ~14-20px horizontal, 8-12px vertical.
   */
  safeAreaClassName?: string;
  /** Maximum width of the bubble (so it stretches with text but doesn't go edge-to-edge). */
  maxWidthClassName?: string;
}

/**
 * MessageBubbleWrapper
 * ---------------------------------
 * Renders a designer chat bubble (SVGA / Lottie / animated image) AROUND the message content.
 * The bubble animation acts as the actual bubble background — message text sits INSIDE the
 * decorated area with proper safe-zone padding (Chamet / MICO / Bigo Live standard).
 *
 * If no bubbleUrl is provided, children are rendered as-is (caller controls fallback styling).
 */
export const MessageBubbleWrapper: React.FC<MessageBubbleWrapperProps> = ({
  bubbleUrl,
  children,
  className,
  safeAreaClassName = 'px-4 py-2',
  maxWidthClassName = 'max-w-[260px]',
}) => {
  // No bubble — render plain children (caller supplies its own default bubble styling)
  if (!bubbleUrl) {
    return <>{children}</>;
  }

  return (
    <div
      className={cn(
        'relative inline-block w-fit',
        maxWidthClassName,
        className,
      )}
    >
      {/* Animated bubble background — fills the entire wrapper, behind text */}
      <div className="absolute inset-0 pointer-events-none select-none overflow-hidden">
        <UniversalAnimationPlayer
          src={bubbleUrl}
          className="w-full h-full"
          loop
          autoPlay
          muted
        />
      </div>

      {/* Foreground content sits inside the SVGA's "safe area" */}
      <div className={cn('relative z-10', safeAreaClassName)}>
        {children}
      </div>
    </div>
  );
};

export default MessageBubbleWrapper;
