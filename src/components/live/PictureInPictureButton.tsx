/**
 * Pkg204 — Picture-in-Picture toggle button (M1).
 *
 * Drop-in glass button. Pass a ref to the host's <video> element and the
 * button handles PiP enter/exit + cross-browser state sync.
 *
 * Hidden automatically when neither standard PiP nor iOS Safari
 * presentation-mode PiP is available.
 *
 * Usage:
 *   const videoRef = useRef<HTMLVideoElement>(null);
 *   <video ref={videoRef} … />
 *   <PictureInPictureButton videoRef={videoRef} />
 */

import { useEffect, useState, type RefObject } from 'react';
import { PictureInPicture, PictureInPicture2 } from 'lucide-react';
import { motion } from 'framer-motion';
import {
  isAnyPiPSupported,
  isInVideoPiP,
  onPiPChange,
  toggleVideoPiP,
} from '@/lib/livekitPictureInPicture';

export interface PictureInPictureButtonProps {
  videoRef: RefObject<HTMLVideoElement | null>;
  className?: string;
  /** Show a label next to the icon (default false → icon only). */
  showLabel?: boolean;
}

export function PictureInPictureButton({
  videoRef,
  className,
  showLabel = false,
}: PictureInPictureButtonProps) {
  const [supported, setSupported] = useState(false);
  const [inPiP, setInPiP] = useState(false);

  useEffect(() => {
    setSupported(isAnyPiPSupported());
  }, []);

  useEffect(() => {
    const el = videoRef.current;
    if (!el) return;
    setInPiP(isInVideoPiP(el));
    const off = onPiPChange(el, setInPiP);
    return off;
  }, [videoRef]);

  if (!supported) return null;

  const handle = async () => {
    const el = videoRef.current;
    if (!el) return;
    const next = await toggleVideoPiP(el);
    setInPiP(next);
  };

  const Icon = inPiP ? PictureInPicture2 : PictureInPicture;

  return (
    <motion.button
      type="button"
      onClick={handle}
      whileTap={{ scale: 0.92 }}
      className={
        'inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-black/45 px-2.5 py-1.5 text-xs font-medium text-white/90 backdrop-blur-md transition-colors hover:bg-black/60 ' +
        (className ?? '')
      }
      style={{
        boxShadow:
          '0 0 0 1px rgba(255,255,255,0.06) inset, 0 4px 14px rgba(0,0,0,0.25)',
      }}
      aria-label={inPiP ? 'Exit Picture-in-Picture' : 'Enter Picture-in-Picture'}
      aria-pressed={inPiP}
      title={inPiP ? 'Exit Picture-in-Picture' : 'Picture-in-Picture'}
    >
      <Icon className="h-3.5 w-3.5" />
      {showLabel && <span>{inPiP ? 'Exit PiP' : 'PiP'}</span>}
    </motion.button>
  );
}

export default PictureInPictureButton;
