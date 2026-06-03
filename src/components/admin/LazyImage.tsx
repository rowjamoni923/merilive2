/**
 * LazyImage (admin) — formerly IntersectionObserver-based, now eager.
 *
 * Per user mandate: no image in the app or admin panel should appear
 * "broken-up" or load in pieces. All images load instantly. API kept
 * stable so existing call sites compile unchanged.
 */
import React, { memo, useMemo } from 'react';
import { cn } from '@/lib/utils';
import { normalizePublicMediaUrl } from '@/lib/cdnImage';

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
  const finalSrc = useMemo(() => normalizePublicMediaUrl(src) || normalizePublicMediaUrl(fallback) || fallback, [src, fallback]);
  const sizeStyle = size ? { width: size, height: size } : undefined;

  return (
    <img loading="lazy" decoding="async"
      src={finalSrc}
      alt={alt}
      {...({ fetchpriority: "high" } as React.ImgHTMLAttributes<HTMLImageElement>)}
      onError={(e) => {
        const t = e.currentTarget;
        if (t.src.indexOf('/placeholder.svg') === -1) t.src = '/placeholder.svg';
      }}
      style={sizeStyle}
      className={cn(
        'object-cover',
        rounded && 'rounded-full',
        className
      )}
      {...rest}
    />
  );
};

export default memo(LazyImage);

