/**
 * Pkg36/37 — Live Sync Latency Tester
 *
 * Public route: /sync-test (no auth required)
 *
 * Open this page on:
 *   - your phone (Play Store app or browser)
 *   - another desktop browser
 *   - a tablet
 *
 * Tap "Bump" on ANY device — every other open device must receive the
 * push and show a latency line in well under 1000 ms.
 */

import { useEffect, useRef, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';

type Event = {
  receivedAt: number;
  serverTime: string;
  version: number;
  latencyMs: number;
};

const deviceLabel = () => {
  const ua = navigator.userAgent;
  const isAndroid = /Android/i.test(ua);
  const isIOS = /iPhone|iPad|iPod/i.test(ua);
  const isCapacitor = !!(window as any).Capacitor?.isNativePlatform?.();
  const platform = isCapacitor
    ? 'Native App'
    : isAndroid
    ? 'Android Browser'
    : isIOS
    ? 'iOS Browser'
    : 'Desktop Browser';
  const id = Math.random().toString(36).slice(2, 6).toUpperCase();
  return `${platform} · ${id}`;
};

export default function SyncTest() {
  const [status, setStatus] = useState<'connecting' | 'subscribed' | 'error'>('connecting');
  const [events, setEvents] = useState<Event[]>([]);
  const [bumping, setBumping] = useState(false);
  const [me] = useState(deviceLabel);
  const channelRef = useRef<any>(null);

  useEffect(() => {
    const ch = supabase
      .channel('sync-test-' + Math.random().toString(36).slice(2, 8))
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'admin_broadcast', filter: 'topic=eq.__sync_test' },
        (payload) => {
          const row: any = payload.new ?? payload.old;
          if (!row) return;
          const serverTime = row.updated_at as string;
          const receivedAt = Date.now();
          const latencyMs = receivedAt - new Date(serverTime).getTime();
          setEvents((prev) =>
            [{ receivedAt, serverTime, version: row.version, latencyMs }, ...prev].slice(0, 30),
          );
        },
      )
      .subscribe((s) => {
        if (s === 'SUBSCRIBED') setStatus('subscribed');
        else if (s === 'CHANNEL_ERROR' || s === 'TIMED_OUT' || s === 'CLOSED') setStatus('error');
      });
    channelRef.current = ch;
    return () => {
      try { supabase.removeChannel(ch); } catch {}
    };
  }, []);

  const bump = async () => {
    setBumping(true);
    try {
      await supabase.rpc('bump_sync_test');
    } finally {
      setBumping(false);
    }
  };

  const avg = events.length
    ? Math.round(events.reduce((a, e) => a + e.latencyMs, 0) / events.length)
    : null;
  const max = events.length ? Math.max(...events.map((e) => e.latencyMs)) : null;
  const under1s = events.filter((e) => e.latencyMs < 1000).length;
  const pct = events.length ? Math.round((under1s / events.length) * 100) : 0;

  return (
    <div className="min-h-screen bg-background text-foreground p-4 max-w-xl mx-auto space-y-4">
      <div>
        <h1 className="text-2xl font-bold">Admin → App Sync Test</h1>
        <p className="text-sm text-muted-foreground">
          This device: <span className="font-mono">{me}</span>
        </p>
        <p className="text-sm">
          Realtime status:{' '}
          <span
            className={
              status === 'subscribed'
                ? 'text-green-500 font-semibold'
                : status === 'error'
                ? 'text-destructive font-semibold'
                : 'text-yellow-500'
            }
          >
            {status}
          </span>
        </p>
      </div>

      <Card className="p-4 space-y-3">
        <p className="text-sm">
          Tap <b>Bump</b> on any device. Every other open device should receive the push.
        </p>
        <Button onClick={bump} disabled={bumping || status !== 'subscribed'} className="w-full">
          {bumping ? 'Bumping…' : 'Bump (push to all devices)'}
        </Button>
      </Card>

      {events.length > 0 && (
        <Card className="p-4 grid grid-cols-3 gap-2 text-center">
          <div>
            <div className="text-xs text-muted-foreground">Avg latency</div>
            <div className="text-lg font-bold">{avg} ms</div>
          </div>
          <div>
            <div className="text-xs text-muted-foreground">Max</div>
            <div className="text-lg font-bold">{max} ms</div>
          </div>
          <div>
            <div className="text-xs text-muted-foreground">Under 1s</div>
            <div
              className={
                'text-lg font-bold ' + (pct === 100 ? 'text-green-500' : 'text-yellow-500')
              }
            >
              {pct}%
            </div>
          </div>
        </Card>
      )}

      <div className="space-y-1">
        {events.map((e, i) => (
          <div
            key={i}
            className="flex justify-between items-center text-xs p-2 rounded bg-muted font-mono"
          >
            <span>v{e.version}</span>
            <span className="text-muted-foreground">
              {new Date(e.receivedAt).toLocaleTimeString()}
            </span>
            <span
              className={
                e.latencyMs < 500
                  ? 'text-green-500 font-bold'
                  : e.latencyMs < 1000
                  ? 'text-yellow-500 font-bold'
                  : 'text-destructive font-bold'
              }
            >
              {e.latencyMs} ms
            </span>
          </div>
        ))}
        {events.length === 0 && (
          <p className="text-sm text-muted-foreground text-center py-8">
            Waiting for first push… tap Bump above.
          </p>
        )}
      </div>
    </div>
  );
}
