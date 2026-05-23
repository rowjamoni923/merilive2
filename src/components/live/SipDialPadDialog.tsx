/**
 * Pkg195 (M1) — SIP DTMF Dial-Pad dialog.
 *
 * Premium dark-glass dialog (Pkg164/Pkg171-parity) showing a 12-key keypad.
 * Each tap sends a DTMF tone to the active SIP participant via
 * `localParticipant.publishDtmf` (Pkg195 lib). Also supports typing/pasting a
 * sequence and sending it with proper inter-digit gap.
 *
 * Zero logic dependencies on backend — pure client-side. $1400-rule safe.
 */
import { useCallback, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Phone, X, Send, Delete } from 'lucide-react';
import {
  DTMF_KEYS,
  sanitizeDigit,
  sendDtmfDigit,
  sendDtmfSequence,
  type SipParticipantInfo,
} from '@/lib/livekitSipDtmf';
import type { StreamScope } from '@/lib/livekitStreams';

interface Props {
  open: boolean;
  onClose: () => void;
  scope: StreamScope;
  id: string;
  sipParticipants: SipParticipantInfo[];
}

export function SipDialPadDialog({ open, onClose, scope, id, sipParticipants }: Props) {
  const [buffer, setBuffer] = useState('');
  const [flash, setFlash] = useState<string | null>(null);

  const pressKey = useCallback(
    async (key: string) => {
      const k = sanitizeDigit(key);
      if (!k) return;
      setBuffer((b) => (b + k).slice(-32));
      setFlash(k);
      setTimeout(() => setFlash((f) => (f === k ? null : f)), 140);
      // Haptic
      try { (navigator as any).vibrate?.(8); } catch { /* noop */ }
      await sendDtmfDigit(scope, id, k);
    },
    [scope, id],
  );

  const sendBuffered = useCallback(async () => {
    if (!buffer) return;
    await sendDtmfSequence(scope, id, buffer, 140);
    setBuffer('');
  }, [scope, id, buffer]);

  const backspace = useCallback(() => {
    setBuffer((b) => b.slice(0, -1));
    try { (navigator as any).vibrate?.(6); } catch { /* noop */ }
  }, []);

  if (!open) return null;
  const hasSip = sipParticipants.length > 0;

  return (
    <AnimatePresence>
      <motion.div
        key="sip-dtmf-backdrop"
        className="fixed inset-0 z-[999] flex items-end sm:items-center justify-center"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.18 }}
        onClick={onClose}
        style={{ background: 'radial-gradient(120% 80% at 50% 50%, rgba(60,20,90,0.55) 0%, rgba(0,0,0,0.78) 70%)', backdropFilter: 'blur(10px)' }}
      >
        <motion.div
          key="sip-dtmf-card"
          onClick={(e) => e.stopPropagation()}
          initial={{ y: 40, scale: 0.94, opacity: 0 }}
          animate={{ y: 0, scale: 1, opacity: 1 }}
          exit={{ y: 30, scale: 0.96, opacity: 0 }}
          transition={{ type: 'spring', damping: 24, stiffness: 320 }}
          className="relative w-full sm:max-w-sm rounded-t-[28px] sm:rounded-[28px] overflow-hidden"
          style={{
            background: 'linear-gradient(180deg, #1a0f33 0%, #140a2a 50%, #0c0818 100%)',
            backdropFilter: 'blur(24px) saturate(140%)',
            boxShadow: '0 20px 60px -10px rgba(168,85,247,0.45), 0 0 0 1px rgba(255,255,255,0.06) inset, 0 1px 0 rgba(255,255,255,0.08) inset',
          }}
        >
          {/* Aurora overlay */}
          <div
            className="absolute inset-0 pointer-events-none"
            style={{
              background: 'radial-gradient(60% 40% at 20% 10%, rgba(236,72,153,0.18) 0%, transparent 60%), radial-gradient(50% 40% at 80% 90%, rgba(168,85,247,0.18) 0%, transparent 60%)',
            }}
          />

          {/* Header */}
          <div className="relative flex items-center justify-between px-5 pt-4 pb-3">
            <div className="flex items-center gap-3">
              <div
                className="w-10 h-10 rounded-2xl flex items-center justify-center"
                style={{
                  background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
                  boxShadow: '0 6px 16px -2px rgba(16,185,129,0.55), 0 0 0 1px rgba(255,255,255,0.18) inset',
                }}
              >
                <Phone className="w-5 h-5 text-white" />
              </div>
              <div>
                <div
                  className="text-base font-bold leading-tight"
                  style={{ background: 'linear-gradient(90deg, #fff, #e9d5ff, #fbcfe8)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}
                >
                  Dial Pad
                </div>
                <div className="text-[11px] text-white/55 leading-tight tabular-nums">
                  {hasSip
                    ? `${sipParticipants.length} call${sipParticipants.length > 1 ? 's' : ''} active`
                    : 'No active phone call'}
                </div>
              </div>
            </div>
            <motion.button
              whileTap={{ scale: 0.88 }}
              onClick={onClose}
              className="w-9 h-9 rounded-full flex items-center justify-center"
              style={{ background: 'rgba(0,0,0,0.45)', border: '1px solid rgba(255,255,255,0.15)', backdropFilter: 'blur(14px)', boxShadow: '0 1px 0 rgba(255,255,255,0.08) inset' }}
              aria-label="Close dial pad"
            >
              <X className="w-4 h-4 text-white/85" />
            </motion.button>
          </div>

          {/* Buffer / display */}
          <div className="relative px-5 pb-3">
            <div
              className="h-12 rounded-2xl flex items-center justify-between px-4"
              style={{
                background: 'linear-gradient(135deg, rgba(255,255,255,0.10) 0%, rgba(255,255,255,0.04) 100%)',
                border: '1px solid rgba(255,255,255,0.08)',
                boxShadow: '0 1px 0 rgba(255,255,255,0.06) inset',
              }}
            >
              <div className="text-xl tracking-[0.18em] tabular-nums text-white/95 font-semibold truncate">
                {buffer || <span className="text-white/30 text-sm tracking-normal font-normal">Tap keys to send tones</span>}
              </div>
              {buffer && (
                <motion.button
                  whileTap={{ scale: 0.9 }}
                  onClick={backspace}
                  className="w-8 h-8 rounded-full flex items-center justify-center text-white/70 hover:text-white"
                  style={{ background: 'rgba(255,255,255,0.06)' }}
                  aria-label="Backspace"
                >
                  <Delete className="w-4 h-4" />
                </motion.button>
              )}
            </div>
          </div>

          {/* Keypad */}
          <div className="relative px-5 pb-3 grid grid-cols-3 gap-2.5">
            {DTMF_KEYS.map((k) => {
              const isStar = k === '*';
              const isHash = k === '#';
              const isLit = flash === k;
              return (
                <motion.button
                  key={k}
                  whileTap={{ scale: 0.92 }}
                  animate={isLit ? { scale: 1.04 } : { scale: 1 }}
                  transition={{ type: 'spring', damping: 18, stiffness: 420 }}
                  onClick={() => pressKey(k)}
                  disabled={!hasSip}
                  className="relative h-14 rounded-2xl flex flex-col items-center justify-center disabled:opacity-40 disabled:pointer-events-none"
                  style={{
                    background: isLit
                      ? 'linear-gradient(135deg, rgba(236,72,153,0.55) 0%, rgba(168,85,247,0.45) 100%)'
                      : 'linear-gradient(135deg, rgba(255,255,255,0.10) 0%, rgba(255,255,255,0.04) 100%)',
                    border: `1px solid ${isLit ? 'rgba(236,72,153,0.55)' : 'rgba(255,255,255,0.08)'}`,
                    boxShadow: isLit
                      ? '0 0 0 1px rgba(255,255,255,0.18) inset, 0 8px 20px -4px rgba(236,72,153,0.55)'
                      : '0 1px 0 rgba(255,255,255,0.08) inset, 0 4px 12px -4px rgba(0,0,0,0.5)',
                  }}
                  aria-label={`DTMF ${k}`}
                >
                  <span className={`font-bold ${isStar || isHash ? 'text-2xl' : 'text-xl'} text-white tabular-nums`}>
                    {k}
                  </span>
                  {!isStar && !isHash && (
                    <span className="text-[9px] uppercase tracking-[0.15em] text-white/45 mt-0.5">
                      {LETTERS[k] ?? ''}
                    </span>
                  )}
                </motion.button>
              );
            })}
          </div>

          {/* Footer: send buffered sequence */}
          <div className="relative px-5 pb-5 pt-1">
            <motion.button
              whileTap={{ scale: 0.97 }}
              onClick={sendBuffered}
              disabled={!buffer || !hasSip}
              className="relative w-full h-11 rounded-2xl flex items-center justify-center gap-2 overflow-hidden disabled:opacity-40 disabled:pointer-events-none"
              style={{
                background: 'linear-gradient(95deg, #ec4899 0%, #c026d3 50%, #a855f7 100%)',
                boxShadow: '0 6px 20px -4px rgba(192,38,211,0.55), 0 0 0 1px rgba(255,255,255,0.14) inset',
                animation: buffer && hasSip ? 'giftSendBreathe 2.4s ease-in-out infinite' : undefined,
              }}
            >
              <Send className="w-4 h-4 text-white" />
              <span className="text-sm font-semibold text-white">
                {buffer ? `Send sequence (${buffer.length})` : 'Send sequence'}
              </span>
            </motion.button>
            <div className="text-[10px] text-white/40 text-center mt-2">
              {hasSip
                ? 'Tones go to the phone caller via SIP'
                : 'Connect a phone caller (SIP) to enable the keypad'}
            </div>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}

const LETTERS: Record<string, string> = {
  '2': 'ABC', '3': 'DEF', '4': 'GHI', '5': 'JKL',
  '6': 'MNO', '7': 'PQRS', '8': 'TUV', '9': 'WXYZ',
  '0': '+',
};
