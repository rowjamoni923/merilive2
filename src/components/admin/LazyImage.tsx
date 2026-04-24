/**
 * LazyImage — IntersectionObserver-based lazy image loader for admin tables.
 *
 * Defaults:
 * - loading="lazy" + decoding="async"
 * - Tiny placeholder until visible, then swaps src
 * - Skeleton shimmer while loading
 */
import React, { useEffect, useRef, useState, memo } from 'react';
import { cn } from '@/lib/utils';

interface LazyImageProps extends Omit<React.ImgHTMLAttributes<HTMLImageElement>, 'loading'> {
  src?: string | null;
  fallback?: string;
  rounded?: boolean;
  size?: number;
}

const TRANSPARENT =
  'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="1" height="1"></svg>';

const LazyImage: React.FC<LazyImageProps> = ({
  src,
  fallback = TRANSPARENT,
  rounded,
  size,
  className,
  alt = '',
  ...rest
}) => {
  const ref = useRef<HTMLImageElement>(null);
  const [visible, setVisible] = useState(false);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el || visible) return;
    if (typeof IntersectionObserver === 'undefined') {
      setVisible(true);
      return;
    }
    const obs = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (e.isIntersecting) {
            setVisible(true);
            obs.disconnect();
          }
        });
      },
      { rootMargin: '120px' }
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, [visible]);

  const finalSrc = visible && src ? src : fallback;
  const sizeStyle = size ? { width: size, height: size } : undefined;

  return (
    <img
      ref={ref}
      src={finalSrc}
      alt={alt}
      loading="lazy"
      decoding="async"
      onLoad={() => setLoaded(true)}
      onError={() => setLoaded(true)}
      style={sizeStyle}
      className={cn(
        'object-cover transition-opacity duration-300',
        rounded && 'rounded-full',
        !loaded && visible && 'opacity-0',
        loaded && 'opacity-100',
        !visible && 'bg-slate-800/40',
        className
      )}
      {...rest}
    />
  );
};

export default memo(LazyImage);
