import { type ComponentType, type ReactNode, useEffect, useState } from 'react';

type ProviderComponent = ComponentType<{ children: ReactNode }>;

export function DeferredCallProvider({ children }: { children: ReactNode }) {
  const [Provider, setProvider] = useState<ProviderComponent | null>(null);

  useEffect(() => {
    let cancelled = false;
    const load = () => {
      import('./CallProvider')
        .then((m) => {
          if (!cancelled) setProvider(() => m.CallProvider);
        })
        .catch(() => {});
    };

    const w = window as Window & {
      requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number;
      cancelIdleCallback?: (id: number) => void;
    };
    const id = typeof w.requestIdleCallback === 'function'
      ? w.requestIdleCallback(load, { timeout: 7000 })
      : window.setTimeout(load, 5000);

    return () => {
      cancelled = true;
      if (typeof w.cancelIdleCallback === 'function') w.cancelIdleCallback(id);
      else window.clearTimeout(id);
    };
  }, []);

  if (!Provider) return <>{children}</>;
  return <Provider>{children}</Provider>;
}

export default DeferredCallProvider;