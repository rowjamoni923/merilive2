import { useEffect, useMemo, useRef } from 'react';

export type AppSyncDetail = {
  topic: string;
  eventType?: string;
  rowId?: string | null;
  payload?: Record<string, unknown>;
};

export const useAppSyncEvent = (
  topics: string[],
  onSync: (detail: AppSyncDetail) => void,
  enabled = true
) => {
  const callbackRef = useRef(onSync);
  callbackRef.current = onSync;

  const topicKey = useMemo(() => topics.slice().sort().join('|'), [topics]);

  useEffect(() => {
    if (!enabled || topicKey.length === 0) return;

    const topicSet = new Set(topicKey.split('|'));
    const handler = (event: Event) => {
      const detail = (event as CustomEvent<AppSyncDetail>).detail;
      if (!detail?.topic || !topicSet.has(detail.topic)) return;
      callbackRef.current(detail);
    };

    window.addEventListener('app-sync', handler as EventListener);
    return () => window.removeEventListener('app-sync', handler as EventListener);
  }, [enabled, topicKey]);
};