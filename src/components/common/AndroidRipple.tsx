/**
 * Android Material Design Ripple Effect
 * Adds native-feeling touch feedback to any element
 */
import { useRef, useCallback, ReactNode, CSSProperties } from 'react';
import { cn } from '@/lib/utils';
import { hapticFeedback } from '@/utils/nativeUtils';

interface AndroidRippleProps {
  children: ReactNode;
  className?: string;
  style?: CSSProperties;
  onClick?: (e: React.MouseEvent | React.TouchEvent) => void;
  disabled?: boolean;
  rippleColor?: string;
  haptic?: 'light' | 'medium' | 'heavy' | false;
  as?: 'div' | 'button';
}

export const AndroidRipple = ({
  children,
  className,
  style,
  onClick,
  disabled = false,
  rippleColor = 'rgba(255, 255, 255, 0.25)',
  haptic = 'light',
  as: Component = 'div',
}: AndroidRippleProps) => {
  const containerRef = useRef<HTMLDivElement | HTMLButtonElement>(null);

  const createRipple = useCallback(
    (e: React.MouseEvent | React.TouchEvent) => {
      if (disabled) return;

      const container = containerRef.current;
      if (!container) return;

      // Haptic feedback
      if (haptic) {
        hapticFeedback(haptic);
      }

      const rect = container.getBoundingClientRect();
      let x: number, y: number;

      if ('touches' in e) {
        x = e.touches[0].clientX - rect.left;
        y = e.touches[0].clientY - rect.top;
      } else {
        x = e.clientX - rect.left;
        y = e.clientY - rect.top;
      }

      const size = Math.max(rect.width, rect.height) * 2;

      const ripple = document.createElement('span');
      ripple.style.cssText = `
        position: absolute;
        left: ${x - size / 2}px;
        top: ${y - size / 2}px;
        width: ${size}px;
        height: ${size}px;
        border-radius: 50%;
        background: ${rippleColor};
        transform: scale(0);
        animation: android-ripple 400ms cubic-bezier(0.25, 0.1, 0.25, 1) forwards;
        pointer-events: none;
        z-index: 1;
      `;

      container.appendChild(ripple);
      setTimeout(() => ripple.remove(), 500);

      onClick?.(e);
    },
    [disabled, haptic, onClick, rippleColor]
  );

  return (
    <Component
      ref={containerRef as any}
      className={cn(
        'relative overflow-hidden cursor-pointer select-none',
        disabled && 'opacity-50 cursor-not-allowed',
        className
      )}
      style={{ WebkitTapHighlightColor: 'transparent', ...style }}
      onClick={createRipple}
      onTouchStart={(e) => {
        // Immediate visual feedback on touch
        const el = containerRef.current;
        if (el) el.style.transform = 'scale(0.98)';
      }}
      onTouchEnd={() => {
        const el = containerRef.current;
        if (el) el.style.transform = '';
      }}
      onTouchCancel={() => {
        const el = containerRef.current;
        if (el) el.style.transform = '';
      }}
    >
      {children}
    </Component>
  );
};

export default AndroidRipple;
