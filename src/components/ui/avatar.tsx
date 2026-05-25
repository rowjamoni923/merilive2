import * as React from "react";
import * as AvatarPrimitive from "@radix-ui/react-avatar";

import { cn } from "@/lib/utils";
import { normalizeProfileMediaUrl } from "@/utils/profileMediaUrl";
import { cdnAvatar } from "@/lib/cdnImage";

const Avatar = React.forwardRef<
  React.ElementRef<typeof AvatarPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof AvatarPrimitive.Root>
>(({ className, ...props }, ref) => (
  <AvatarPrimitive.Root
    ref={ref}
    className={cn("relative flex h-10 w-10 shrink-0 overflow-hidden rounded-full", className)}
    {...props}
  />
));
Avatar.displayName = AvatarPrimitive.Root.displayName;

/**
 * Best-effort: read rendered CSS size of the <Avatar> container so we can ask
 * Supabase CDN for an appropriately-sized variant. Falls back to 96 px.
 */
function useRenderedSize(ref: React.RefObject<HTMLElement>): number {
  const [size, setSize] = React.useState<number>(96);
  React.useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => {
      const w = el.getBoundingClientRect().width;
      if (w && Math.abs(w - size) > 4) setSize(Math.ceil(w));
    };
    measure();
    if (typeof ResizeObserver !== "undefined") {
      const ro = new ResizeObserver(measure);
      ro.observe(el);
      return () => ro.disconnect();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ref.current]);
  return size;
}

const AvatarImage = React.forwardRef<
  React.ElementRef<typeof AvatarPrimitive.Image>,
  React.ComponentPropsWithoutRef<typeof AvatarPrimitive.Image>
>(({ className, src, onError, ...props }, ref) => {
  const normalizedSrc = React.useMemo(
    () => normalizeProfileMediaUrl(src as string | null | undefined) || src,
    [src]
  );
  const [imgSrc, setImgSrc] = React.useState<string | undefined>(
    normalizedSrc as string | undefined
  );
  const [cdnFailed, setCdnFailed] = React.useState(false);
  const wrapperRef = React.useRef<HTMLSpanElement | null>(null);
  const renderedSize = useRenderedSize(wrapperRef);

  React.useEffect(() => {
    let cancelled = false;
    setCdnFailed(false);
    if (!normalizedSrc || typeof window === "undefined") {
      setImgSrc(normalizedSrc as string | undefined);
      return;
    }
    if (!window.location.pathname.startsWith("/admin")) {
      setImgSrc(normalizedSrc as string | undefined);
      return;
    }
    // /admin: many bucket objects are private — resolve to signed URL first.
    setImgSrc(undefined);
    import("@/utils/adminStorageImages")
      .then(({ resolveAdminStorageImageUrl }) =>
        resolveAdminStorageImageUrl(normalizedSrc as string, "avatars")
      )
      .then((resolved) => {
        if (!cancelled) setImgSrc(resolved || undefined);
      })
      .catch(() => {
        if (!cancelled) setImgSrc(normalizedSrc as string | undefined);
      });
    return () => {
      cancelled = true;
    };
  }, [normalizedSrc]);

  // Route through Supabase Image Transformation CDN when we have a public-object URL.
  // Falls back to the original URL automatically on transform error (Pro-only feature).
  const renderSrc = React.useMemo(() => {
    if (!imgSrc || cdnFailed) return imgSrc;
    return cdnAvatar(imgSrc, renderedSize) || imgSrc;
  }, [imgSrc, renderedSize, cdnFailed]);

  const handleError = (e: React.SyntheticEvent<HTMLImageElement, Event>) => {
    // If we tried CDN transform and it failed (e.g. Pro plan off), retry with original.
    if (!cdnFailed && renderSrc !== imgSrc) {
      setCdnFailed(true);
      return;
    }
    setImgSrc("");
    onError?.(e);
  };

  if (!renderSrc) {
    return null; // show <AvatarFallback>
  }

  return (
    <span
      ref={(node) => {
        wrapperRef.current = node;
      }}
      className="contents"
    >
      <AvatarPrimitive.Image
        ref={ref}
        className={cn("aspect-square h-full w-full", className)}
        src={renderSrc}
        loading="lazy"
        decoding="async"
        onError={handleError}
        {...props}
      />
    </span>
  );
});
AvatarImage.displayName = AvatarPrimitive.Image.displayName;

const AvatarFallback = React.forwardRef<
  React.ElementRef<typeof AvatarPrimitive.Fallback>,
  React.ComponentPropsWithoutRef<typeof AvatarPrimitive.Fallback>
>(({ className, ...props }, ref) => (
  <AvatarPrimitive.Fallback
    ref={ref}
    className={cn("flex h-full w-full items-center justify-center rounded-full bg-muted", className)}
    {...props}
  />
));
AvatarFallback.displayName = AvatarPrimitive.Fallback.displayName;

export { Avatar, AvatarImage, AvatarFallback };

