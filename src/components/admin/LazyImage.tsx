/**
 * LazyImage (admin) — formerly IntersectionObserver-based, now eager.
 *
 * Per user mandate: no image in the app or admin panel should appear
 * "broken-up" or load in pieces. All images load instantly. API kept
 * stable so existing call sites compile unchanged.
 */
import React, { memo, useState } from 'react';
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
  const [loaded, setLoaded] = useState(false);
  const finalSrc = src || fallback;
  const sizeStyle = size ? { width: size, height: size } : undefined;

  return (
    <img
      src={finalSrc}
      alt={alt}
     
      decoding="async"
      fetchPriority="high"
      onLoad={() => setLoaded(true)}
      onError={(e) => {
        const t = e.currentTarget;
        if (t.src.indexOf('/placeholder.svg') === -1) t.src = '/placeholder.svg';
        setLoaded(true);
      }}
      style={sizeStyle}
      className={cn(
        'object-cover',
        rounded && 'rounded-full',
        !loaded && 'bg-slate-800/40',
        className
      )}
      {...rest}
    />
  );
};

export default memo(LazyImage);
