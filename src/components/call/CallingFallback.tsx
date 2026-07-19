/**
 * CallingFallback — paints the "Calling…" screen INSTANTLY while the
 * lazy `ActiveCallScreen` chunk (172KB livekit-client) is being fetched.
 *
 * Without this, body has `.call-overlay-active` (which hides `#root`)
 * and `<Suspense fallback={null}>` paints nothing → user sees a fully
 * white screen for several seconds on first call. This component is
 * tiny, eagerly bundled (NOT lazy), and renders the same dark backdrop
 * + avatar + name + "Calling…" copy that `ActiveCallScreen` shows in
 * its ringing state, so the transition is visually seamless.
 */
import { PhoneOff } from 'lucide-react';
import { isNativeAndroidApp } from '@/utils/nativeUtils';

interface CallingFallbackProps {
  remoteUserName: string;
  remoteUserAvatar: string | null | undefined;
  callStatus: 'calling' | 'ringing' | 'connected' | 'idle' | 'ended';
  isHost: boolean;
  onEndCall: () => void;
}

export function CallingFallback({
  remoteUserName,
  remoteUserAvatar,
  callStatus,
  isHost,
  onEndCall,
}: CallingFallbackProps) {
  // T-shirt rule: post-accept ('connected') we never show a loader label —
  // UI swap is instant, video/audio fills in as tracks arrive.
  const label =
    callStatus === 'connected'
      ? ''
      : isHost
        ? 'Incoming call…'
        : 'Calling…';

  const initial = (remoteUserName || '?').trim().charAt(0).toUpperCase();
  const nativeTransparent = isNativeAndroidApp();

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 2147483646,
        background: nativeTransparent
          ? 'transparent'
          : 'linear-gradient(180deg, #0b0f1a 0%, #111827 55%, #0b0f1a 100%)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '64px 24px 48px',
        color: '#fff',
        WebkitTapHighlightColor: 'transparent',
      }}
    >
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 18 }}>
        <div
          style={{
            width: 128,
            height: 128,
            borderRadius: '50%',
            background: remoteUserAvatar
              ? `url(${remoteUserAvatar}) center/cover no-repeat`
              : 'linear-gradient(135deg, #6366f1, #ec4899)',
            border: '3px solid rgba(255,255,255,0.18)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 48,
            fontWeight: 600,
            color: '#fff',
            boxShadow: '0 12px 40px rgba(0,0,0,0.5)',
          }}
        >
          {!remoteUserAvatar && initial}
        </div>
        <div style={{ fontSize: 22, fontWeight: 600, textAlign: 'center', minHeight: 28 }}>
          {remoteUserName || ''}
        </div>
        {label && (
          <div
            style={{
              fontSize: 14,
              opacity: 0.75,
              display: 'flex',
              alignItems: 'center',
              gap: 6,
            }}
          >
            <span
              style={{
                width: 8,
                height: 8,
                borderRadius: '50%',
                background: '#10b981',
                animation: 'merilive-calling-pulse 1.2s ease-in-out infinite',
              }}
            />
            {label}
          </div>
        )}
      </div>

      <button
        type="button"
        onClick={onEndCall}
        aria-label="End call"
        style={{
          width: 64,
          height: 64,
          borderRadius: '50%',
          background: '#ef4444',
          border: 'none',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: '#fff',
          cursor: 'pointer',
          boxShadow: '0 8px 24px rgba(239,68,68,0.45)',
        }}
      >
        <PhoneOff size={28} />
      </button>

      <style>
        {`@keyframes merilive-calling-pulse {
          0%, 100% { transform: scale(1); opacity: 1; }
          50% { transform: scale(1.6); opacity: 0.4; }
        }`}
      </style>
    </div>
  );
}
