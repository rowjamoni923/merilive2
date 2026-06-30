/**
 * Global connectivity indicator — Layer 4 of the app-wide reliability stack.
 *
 * Mounted once at the root. Listens to:
 *   - browser online/offline events
 *   - Supabase Realtime channel status (via a tiny heartbeat channel)
 *
 * Renders an unobtrusive top banner only when something is wrong. No per-page
 * wiring needed — 400+ pages inherit the indicator automatically.
 *
 * Strings English-only. Design-neutral (uses existing tokens, no new colors).
 */
import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';

type Status = 'online' | 'offline' | 'reconnecting';

export default function ConnectionStatus() {
  const [status, setStatus] = useState<Status>(
    typeof navigator !== 'undefined' && navigator.onLine === false ? 'offline' : 'online'
  );

  useEffect(() => {
    const onOnline = () => setStatus('online');
    const onOffline = () => setStatus('offline');
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    return () => {
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
    };
  }, []);

  useEffect(() => {
    // Tiny presence channel just to observe transport health.
    const channel = supabase.channel(`app:connection-health-${Math.random().toString(36).slice(2, 8)}`, {
      config: { broadcast: { self: false } },
    });
    let lastOk = Date.now();
    channel.subscribe(state => {
      if (state === 'SUBSCRIBED') {
        lastOk = Date.now();
        if (navigator.onLine) setStatus('online');
      } else if (state === 'CHANNEL_ERROR' || state === 'TIMED_OUT') {
        // Only flip to reconnecting if we were healthy recently — avoids
        // false-positive banners during initial boot.
        if (navigator.onLine && Date.now() - lastOk < 60_000) {
          setStatus('reconnecting');
        }
      } else if (state === 'CLOSED' && !navigator.onLine) {
        setStatus('offline');
      }
    });
    return () => { void supabase.removeChannel(channel); };
  }, []);

  if (status === 'online') return null;

  const label =
    status === 'offline'
      ? "You're offline. Reconnecting when network returns…"
      : 'Reconnecting…';

  return (
    <div
      role="status"
      aria-live="polite"
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        zIndex: 9999,
        padding: '6px 12px',
        fontSize: 12,
        fontWeight: 500,
        textAlign: 'center',
        background: status === 'offline' ? 'hsl(var(--destructive))' : 'hsl(var(--muted))',
        color: status === 'offline' ? 'hsl(var(--destructive-foreground))' : 'hsl(var(--muted-foreground))',
        pointerEvents: 'none',
      }}
    >
      {label}
    </div>
  );
}
