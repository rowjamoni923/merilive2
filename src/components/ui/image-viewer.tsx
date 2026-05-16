import { useEffect, useState } from "react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { X, ZoomIn, ZoomOut } from "lucide-react";
import { resolveAdminStorageImageUrl } from "@/utils/adminStorageImages";

interface ImageViewerProps {
  src: string | null;
  alt?: string;
  open: boolean;
  onClose: () => void;
}

export const ImageViewer = ({ src, alt = "Image", open, onClose }: ImageViewerProps) => {
  const [scale, setScale] = useState(1);
  const [displaySrc, setDisplaySrc] = useState<string | null>(src);

  useEffect(() => {
    let cancelled = false;
    if (!src) {
      setDisplaySrc(null);
      return;
    }
    if (typeof window === "undefined" || !window.location.pathname.startsWith("/admin")) {
      setDisplaySrc(src);
      return;
    }
    setDisplaySrc(null);
    resolveAdminStorageImageUrl(src, "payment-screenshots")
      .then((resolved) => {
        if (!cancelled) setDisplaySrc(resolved || null);
      })
      .catch(() => {
        if (!cancelled) setDisplaySrc(null);
      });
    return () => {
      cancelled = true;
    };
  }, [src]);

  const handleZoomIn = () => setScale(prev => Math.min(prev + 0.5, 4));
  const handleZoomOut = () => setScale(prev => Math.max(prev - 0.5, 0.5));

  const handleOpenChange = (isOpen: boolean) => {
    if (!isOpen) {
      setScale(1);
      onClose();
    }
  };

  if (!src) return null;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-[95vw] max-h-[95vh] p-0 bg-black/95 border-none overflow-hidden flex flex-col items-center justify-center [&>button]:hidden">
        {/* Top bar */}
        <div className="absolute top-0 left-0 right-0 z-50 flex items-center justify-between p-3 bg-gradient-to-b from-black/80 to-transparent">
          <span className="text-white/70 text-xs truncate max-w-[60%]">{alt}</span>
          <div className="flex items-center gap-2">
            <button onClick={handleZoomOut} className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center text-white hover:bg-white/20">
              <ZoomOut className="w-4 h-4" />
            </button>
            <button onClick={handleZoomIn} className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center text-white hover:bg-white/20">
              <ZoomIn className="w-4 h-4" />
            </button>
            <button onClick={onClose} className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center text-white hover:bg-white/20">
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Image */}
        <div className="flex items-center justify-center w-full h-full overflow-auto p-4">
          {displaySrc ? (
            <img
              src={displaySrc}
              alt={alt}
              className="max-w-full max-h-[85vh] object-contain transition-transform duration-200"
              style={{ transform: `scale(${scale})` }}
              draggable={false}
            />
          ) : (
            <div className="text-sm text-white/70">Loading image</div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};

/**
 * Hook to manage image viewer state
 */
export const useImageViewer = () => {
  const [viewerImage, setViewerImage] = useState<string | null>(null);

  const openImage = (src: string) => setViewerImage(src);
  const closeImage = () => setViewerImage(null);

  return {
    viewerImage,
    isOpen: !!viewerImage,
    openImage,
    closeImage,
  };
};
