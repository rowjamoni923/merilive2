import * as React from "react";
import * as AvatarPrimitive from "@radix-ui/react-avatar";

import { cn } from "@/lib/utils";
import { normalizeProfileMediaUrl } from "@/utils/profileMediaUrl";

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

const AvatarImage = React.forwardRef<
  React.ElementRef<typeof AvatarPrimitive.Image>,
  React.ComponentPropsWithoutRef<typeof AvatarPrimitive.Image>
>(({ className, src, onError, ...props }, ref) => {
  const normalizedSrc = React.useMemo(() => normalizeProfileMediaUrl(src as string | null | undefined) || src, [src]);
  const [imgSrc, setImgSrc] = React.useState(normalizedSrc);
  
  React.useEffect(() => {
    let cancelled = false;
    if (!normalizedSrc || typeof window === 'undefined' || !window.location.pathname.startsWith('/admin')) {
      setImgSrc(normalizedSrc);
      return;
    }

    setImgSrc(undefined);
    import('@/utils/adminStorageImages')
      .then(({ resolveAdminStorageImageUrl }) => resolveAdminStorageImageUrl(normalizedSrc, 'avatars'))
      .then((resolved) => {
        if (!cancelled) setImgSrc(resolved || undefined);
      })
      .catch(() => {
        if (!cancelled) setImgSrc(normalizedSrc);
      });

    return () => {
      cancelled = true;
    };
  }, [normalizedSrc]);
  
  const handleError = (e: React.SyntheticEvent<HTMLImageElement, Event>) => {
    // Hide the broken image by setting src to empty
    setImgSrc('');
    onError?.(e);
  };
  
  if (!imgSrc) {
    return null; // Return null to show fallback
  }
  
  return (
    <AvatarPrimitive.Image 
      ref={ref} 
      className={cn("aspect-square h-full w-full", className)} 
      src={imgSrc}
      onError={handleError}
      {...props} 
    />
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
