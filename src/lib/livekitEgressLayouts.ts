// Pkg151 — Custom Egress Layouts: shared layout whitelist + localStorage helpers
// used by host-facing recording (MP4 / HLS) start flows.
//
// Whitelist matches the LiveKit RoomCompositeEgressRequest.layout values
// already validated server-side in livekit-egress-ops (Pkg136). Keeping a
// single source of truth on the client means the start-recording picker
// (Pkg111 / Pkg126) and the admin mid-stream swap (Pkg136) stay in sync.
//
// Zero new Supabase channels, zero polls, zero cross-user reads.

export const EGRESS_LAYOUTS = [
  'speaker',
  'speaker-dark',
  'speaker-light',
  'grid',
  'grid-dark',
  'grid-light',
  'single-speaker',
  'single-speaker-dark',
  'single-speaker-light',
] as const;

export type EgressLayout = (typeof EGRESS_LAYOUTS)[number];

export const EGRESS_LAYOUT_SET: ReadonlySet<string> = new Set<string>(EGRESS_LAYOUTS);

export interface EgressLayoutMeta {
  value: EgressLayout;
  label: string;
  description: string;
  group: 'speaker' | 'grid' | 'single';
  theme: 'auto' | 'dark' | 'light';
}

export const EGRESS_LAYOUT_META: readonly EgressLayoutMeta[] = [
  { value: 'speaker',              label: 'Speaker',              description: 'Active speaker large, others as PiP.',       group: 'speaker', theme: 'auto'  },
  { value: 'speaker-dark',         label: 'Speaker · Dark',       description: 'Speaker layout, dark theme.',                group: 'speaker', theme: 'dark'  },
  { value: 'speaker-light',        label: 'Speaker · Light',      description: 'Speaker layout, light theme.',               group: 'speaker', theme: 'light' },
  { value: 'grid',                 label: 'Grid',                 description: 'Equal-sized tiles for all participants.',    group: 'grid',    theme: 'auto'  },
  { value: 'grid-dark',            label: 'Grid · Dark',          description: 'Grid layout, dark theme.',                   group: 'grid',    theme: 'dark'  },
  { value: 'grid-light',           label: 'Grid · Light',         description: 'Grid layout, light theme.',                  group: 'grid',    theme: 'light' },
  { value: 'single-speaker',       label: 'Single Speaker',       description: 'Active speaker only — no PiPs.',             group: 'single',  theme: 'auto'  },
  { value: 'single-speaker-dark',  label: 'Single Speaker · Dark',description: 'Single speaker, dark theme.',                group: 'single',  theme: 'dark'  },
  { value: 'single-speaker-light', label: 'Single Speaker · Light',description: 'Single speaker, light theme.',              group: 'single',  theme: 'light' },
];

export const DEFAULT_EGRESS_LAYOUT: EgressLayout = 'speaker';

const STORAGE_KEY = 'merilive_egress_layout_v1';

export function isEgressLayout(v: unknown): v is EgressLayout {
  return typeof v === 'string' && EGRESS_LAYOUT_SET.has(v);
}

/** Read the user's persisted layout choice (falls back to DEFAULT). */
export function getEgressLayoutChoice(): EgressLayout {
  try {
    if (typeof window === 'undefined') return DEFAULT_EGRESS_LAYOUT;
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return isEgressLayout(raw) ? raw : DEFAULT_EGRESS_LAYOUT;
  } catch {
    return DEFAULT_EGRESS_LAYOUT;
  }
}

/** Persist the user's layout choice. Silently no-ops on invalid input. */
export function setEgressLayoutChoice(layout: EgressLayout): void {
  if (!isEgressLayout(layout)) return;
  try {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem(STORAGE_KEY, layout);
  } catch {
    /* quota / private mode — ignore */
  }
}
