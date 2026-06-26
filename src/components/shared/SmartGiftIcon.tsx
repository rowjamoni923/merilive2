import { useEffect, useState } from 'react';
import { ensureCachedIconUrl, getCachedIconUrlSync } from '@/utils/giftIconCache';

interface SmartGiftIconProps extends React.ImgHTMLAttributes<HTMLImageElement> {
  src: string;
  alt: string;
}

/**
 * Phase 4C — Static gift-icon `<img>` replacement.
 *
 * - First render: paints from IndexedDB cache instantly if previously seen
 *   (no broken-tile flash).
 * - Otherwise: shows a translucent placeholder background and fades in
 *   over 120ms once the bytes arrive.
 * - Persists fetched bytes to IDB so the SECOND open of the panel is
 *   network-free.
 *
 * Intentionally only handles static raster formats (png/jpg/webp/gif).
 * SVGA / Lottie / video branches in the panels keep their existing players.
 */
export function SmartGiftIcon({ src, alt, className, style, ...rest }: SmartGiftIconProps) {
  const [resolved, setResolved] = useState<string>(() => getCachedIconUrlSync(src) || src);
  const [ready, setReady] = useState<boolean>(() => !!getCachedIconUrlSync(src));

  useEffect(() => {
    let alive = true;
    const sync = getCachedIconUrlSync(src);
    if (sync) {
      setResolved(sync);
      setReady(true);
      return () => { alive = false; };
    }
    setReady(false);
    setResolved(src);
    ensureCachedIconUrl(src)
      .then((u) => {
        if (!alive) return;
        if (u && u !== src) setResolved(u);
      })
      .catch(() => {});
    return () => { alive = false; };
  }, [src]);

  return (
    <img
      {...rest}
      src={resolved}
      alt={alt}
      loading={rest.loading ?? 'lazy'}
      decoding={rest.decoding ?? 'async'}
      className={className}
      style={{
        backgroundColor: ready ? undefined : 'rgba(255,255,255,0.04)',
        transition: 'opacity 120ms ease-out',
        opacity: ready ? 1 : 0.001,
        ...style,
      }}
      onLoad={(e) => {
        setReady(true);
        rest.onLoad?.(e);
      }}
      onError={(e) => {
        setReady(true);
        rest.onError?.(e);
      }}
    />
  );
}

export default SmartGiftIcon;
