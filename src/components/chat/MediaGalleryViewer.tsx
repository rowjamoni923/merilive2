import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ChevronLeft, ChevronRight, X, Download } from "lucide-react";

export type GalleryItem = {
  id: string;
  url: string;
  type: "image" | "video";
  sender?: string;
  createdAt?: string;
};

interface Props {
  open: boolean;
  items: GalleryItem[];
  startId?: string | null;
  onClose: () => void;
}

/**
 * Full-screen swipeable media viewer for a chat thread.
 * - Horizontal swipe to navigate between media.
 * - Vertical swipe-down to dismiss.
 * - Keyboard ← → and Esc.
 */
export function MediaGalleryViewer({ open, items, startId, onClose }: Props) {
  const startIdx = useMemo(() => {
    if (!startId) return 0;
    const i = items.findIndex((m) => m.id === startId);
    return i < 0 ? 0 : i;
  }, [items, startId]);
  const [index, setIndex] = useState(startIdx);
  useEffect(() => setIndex(startIdx), [startIdx, open]);

  const dragX = useRef(0);
  const dragY = useRef(0);
  const startX = useRef(0);
  const startY = useRef(0);
  const dragging = useRef(false);
  const trackRef = useRef<HTMLDivElement | null>(null);

  const goTo = useCallback(
    (i: number) => {
      if (items.length === 0) return;
      const clamped = Math.max(0, Math.min(items.length - 1, i));
      setIndex(clamped);
    },
    [items.length]
  );

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      else if (e.key === "ArrowLeft") goTo(index - 1);
      else if (e.key === "ArrowRight") goTo(index + 1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, goTo, index, onClose]);

  if (!open || typeof document === "undefined" || items.length === 0) return null;

  const current = items[index];

  const onPointerDown = (e: React.PointerEvent) => {
    dragging.current = true;
    startX.current = e.clientX;
    startY.current = e.clientY;
    dragX.current = 0;
    dragY.current = 0;
    if (trackRef.current) trackRef.current.style.transition = "none";
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (!dragging.current) return;
    dragX.current = e.clientX - startX.current;
    dragY.current = e.clientY - startY.current;
    if (trackRef.current) {
      trackRef.current.style.transform = `translate3d(${dragX.current}px, ${Math.max(0, dragY.current)}px, 0)`;
    }
  };
  const onPointerUp = () => {
    if (!dragging.current) return;
    dragging.current = false;
    const dx = dragX.current;
    const dy = dragY.current;
    if (trackRef.current) {
      trackRef.current.style.transition = "transform 220ms ease";
      trackRef.current.style.transform = "translate3d(0,0,0)";
    }
    if (dy > 120 && Math.abs(dy) > Math.abs(dx)) {
      onClose();
      return;
    }
    if (Math.abs(dx) > 80) {
      goTo(index + (dx < 0 ? 1 : -1));
    }
  };

  return createPortal(
    <div className="fixed inset-0 z-[300] bg-black/95 text-white flex flex-col select-none">
      {/* Top bar */}
      <div className="flex items-center justify-between px-3 pt-[calc(env(safe-area-inset-top)+8px)] pb-2">
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="w-9 h-9 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center"
        >
          <X className="w-5 h-5" />
        </button>
        <div className="text-xs font-medium opacity-80">
          {index + 1} / {items.length}
          {current.sender ? <span className="ml-2 opacity-70">· {current.sender}</span> : null}
        </div>
        <a
          href={current.url}
          target="_blank"
          rel="noreferrer"
          download
          aria-label="Open original"
          className="w-9 h-9 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center"
        >
          <Download className="w-5 h-5" />
        </a>
      </div>

      {/* Stage */}
      <div
        className="flex-1 relative overflow-hidden touch-none"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      >
        <div
          ref={trackRef}
          className="absolute inset-0 flex items-center justify-center"
          style={{ willChange: "transform" }}
        >
          {current.type === "video" ? (
            <video
              key={current.id}
              src={current.url}
              controls
              autoPlay
              playsInline
              className="max-w-full max-h-full object-contain"
            />
          ) : (
            <img
              key={current.id}
              src={current.url}
              alt=""
              draggable={false}
              className="max-w-full max-h-full object-contain"
            />
          )}
        </div>

        {/* Side arrows (desktop) */}
        {items.length > 1 && index > 0 && (
          <button
            type="button"
            onClick={() => goTo(index - 1)}
            className="hidden sm:flex absolute left-3 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-white/10 hover:bg-white/20 items-center justify-center"
            aria-label="Previous"
          >
            <ChevronLeft className="w-6 h-6" />
          </button>
        )}
        {items.length > 1 && index < items.length - 1 && (
          <button
            type="button"
            onClick={() => goTo(index + 1)}
            className="hidden sm:flex absolute right-3 top-1/2 -translate-y-1/2 w-10 h-10 rounded-full bg-white/10 hover:bg-white/20 items-center justify-center"
            aria-label="Next"
          >
            <ChevronRight className="w-6 h-6" />
          </button>
        )}
      </div>

      {/* Thumbnail strip */}
      {items.length > 1 && (
        <div className="px-3 pb-[calc(env(safe-area-inset-bottom)+8px)] pt-2 overflow-x-auto">
          <div className="flex gap-1.5">
            {items.map((m, i) => (
              <button
                key={m.id}
                type="button"
                onClick={() => goTo(i)}
                className={`w-12 h-12 rounded-md overflow-hidden border ${
                  i === index ? "border-white" : "border-white/20 opacity-70"
                }`}
                aria-label={`Open media ${i + 1}`}
              >
                {m.type === "video" ? (
                  <div className="w-full h-full bg-white/10 flex items-center justify-center text-[10px]">▶</div>
                ) : (
                  <img src={m.url} alt="" className="w-full h-full object-cover" />
                )}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>,
    document.body
  );
}
