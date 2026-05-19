/**
 * SessionDebugOverlay
 *
 * Floating chip that shows:
 *   - Hardware device UUID (raw, from Capacitor when available)
 *   - Persistent device id (formatted: device_xxxx)
 *   - Current session id (= hardware id on native)
 *   - Realtime channel name being subscribed to
 *   - Last 8 single-device events (register / check / channel / forceLogout)
 *
 * Hidden by default. Enable without reloading:
 *   __sessionDebug.enable()
 *
 * Or from devtools:
 *   __sessionDebug.enable()
 */

import { useEffect, useState } from 'react';
import { Capacitor } from '@capacitor/core';
import { Device } from '@capacitor/device';
import { getDeviceIdSync, getPersistentDeviceId } from '@/utils/persistentDeviceId';
import {
  getCurrentChannelName,
  getSessionEvents,
  onSessionDebug,
  type SessionDebugEvent,
} from '@/utils/sessionDebugBus';

const STORAGE_KEY = 'meri_session_id';

const isEnabled = () => {
  try {
    return localStorage.getItem('meri_session_debug') === '1';
  } catch {
    return false;
  }
};

const truncate = (s: string | null | undefined, head = 10, tail = 6) => {
  if (!s) return '—';
  if (s.length <= head + tail + 1) return s;
  return `${s.slice(0, head)}…${s.slice(-tail)}`;
};

const eventLabel = (e: SessionDebugEvent) => {
  const t = new Date(e.ts).toLocaleTimeString();
  return `${t}  ${e.type}${e.reason ? ' · ' + e.reason : ''}`;
};

interface Props {
  userId: string | null;
}

export const SessionDebugOverlay = ({ userId }: Props) => {
  const [enabled, setEnabled] = useState(isEnabled());
  const [expanded, setExpanded] = useState(false);
  const [hwUuid, setHwUuid] = useState<string | null>(null);
  const [deviceId, setDeviceId] = useState<string>(getDeviceIdSync());
  const [sessionId, setSessionId] = useState<string | null>(
    typeof localStorage !== 'undefined' ? localStorage.getItem(STORAGE_KEY) : null
  );
  const [channel, setChannel] = useState<string | null>(getCurrentChannelName());
  const [events, setEvents] = useState<SessionDebugEvent[]>(getSessionEvents());

  // Watch the localStorage flag (so the user can flip it from another tab/devtools)
  useEffect(() => {
    const t = setInterval(() => {
      const v = isEnabled();
      setEnabled((prev) => (prev !== v ? v : prev));
    }, 1500);
    return () => clearInterval(t);
  }, []);

  // Resolve raw hardware UUID once (native) — for diagnosing format mismatch
  useEffect(() => {
    if (!enabled) return;
    let alive = true;
    (async () => {
      try {
        if (Capacitor.isNativePlatform()) {
          const { identifier } = await Device.getId();
          if (alive) setHwUuid(identifier);
        }
        const persistent = await getPersistentDeviceId();
        if (alive) setDeviceId(persistent);
      } catch {
        /* noop */
      }
    })();
    return () => {
      alive = false;
    };
  }, [enabled]);

  // Subscribe to event bus + poll session id from storage
  useEffect(() => {
    if (!enabled) return;
    const off = onSessionDebug(() => {
      setEvents(getSessionEvents());
      setChannel(getCurrentChannelName());
    });
    const t = setInterval(() => {
      try {
        const v = localStorage.getItem(STORAGE_KEY);
        setSessionId((prev) => (prev !== v ? v : prev));
      } catch {
        /* noop */
      }
    }, 1000);
    return () => {
      off();
      clearInterval(t);
    };
  }, [enabled]);

  if (!enabled) return null;

  const platform = Capacitor.isNativePlatform() ? Capacitor.getPlatform() : 'web';
  const channelSuffix = channel ? channel.split('-').slice(-1)[0] : '—';

  return (
    <div
      style={{
        position: 'fixed',
        bottom: 'calc(env(safe-area-inset-bottom, 0px) + 8px)',
        left: 8,
        right: 8,
        zIndex: 2147483646,
        pointerEvents: 'none',
      }}
    >
      <div
        onClick={() => setExpanded((v) => !v)}
        style={{
          pointerEvents: 'auto',
          maxWidth: 520,
          margin: '0 auto',
          background: 'rgba(8, 12, 24, 0.92)',
          color: '#e2e8f0',
          font: '11px/1.4 ui-monospace, SFMono-Regular, Menlo, monospace',
          padding: expanded ? '10px 12px' : '6px 10px',
          borderRadius: 10,
          border: '1px solid rgba(148,163,184,0.25)',
          boxShadow: '0 8px 24px -8px rgba(0,0,0,0.6)',
          cursor: 'pointer',
          backdropFilter: 'blur(6px)',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
          <span style={{ color: '#fbbf24', fontWeight: 700 }}>SESSION DBG</span>
          <span style={{ color: '#94a3b8' }}>
            {platform} · ch:{channelSuffix} · ev:{events.length}
          </span>
        </div>
        {!expanded && (
          <div style={{ color: '#cbd5e1', marginTop: 2 }}>
            sid {truncate(sessionId)} · uid {truncate(userId)} · tap to expand
          </div>
        )}
        {expanded && (
          <div style={{ marginTop: 6, display: 'grid', gap: 3 }}>
            <Row label="user.id" value={userId} />
            <Row label="device.id" value={deviceId} />
            <Row label="hw.uuid" value={hwUuid} />
            <Row label="session.id" value={sessionId} />
            <Row label="channel" value={channel} />
            <div
              style={{
                marginTop: 6,
                paddingTop: 6,
                borderTop: '1px solid rgba(148,163,184,0.18)',
              }}
            >
              <div style={{ color: '#94a3b8', marginBottom: 3 }}>last events</div>
              {events.length === 0 ? (
                <div style={{ color: '#64748b' }}>—</div>
              ) : (
                events
                  .slice(-8)
                  .reverse()
                  .map((e, i) => (
                    <div
                      key={i}
                      style={{
                        color:
                          e.type === 'forceLogout'
                            ? '#fca5a5'
                            : e.type.startsWith('check.invalid')
                            ? '#fde68a'
                            : e.type.includes('error')
                            ? '#fca5a5'
                            : '#cbd5e1',
                      }}
                    >
                      {eventLabel(e)}
                    </div>
                  ))
              )}
            </div>
            <div
              style={{
                marginTop: 6,
                color: '#64748b',
                fontSize: 10,
              }}
            >
              tap to collapse · `__sessionDebug.copy()` to clipboard
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

const Row = ({ label, value }: { label: string; value: string | null | undefined }) => (
  <div style={{ display: 'flex', gap: 8 }}>
    <span style={{ color: '#94a3b8', minWidth: 78 }}>{label}</span>
    <span style={{ color: '#f1f5f9', wordBreak: 'break-all', flex: 1 }}>
      {value || '—'}
    </span>
  </div>
);

export default SessionDebugOverlay;
