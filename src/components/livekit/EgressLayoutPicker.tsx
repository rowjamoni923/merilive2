// Pkg151 — Reusable host-facing egress layout picker.
//
// Pure presentational <select> that reads/writes the shared
// `merilive_egress_layout_v1` localStorage key. Drop into any
// "Start recording" host dialog (MP4 — Pkg111, HLS — Pkg126).
//
// No network calls, no Supabase channels, no polls.
import React from 'react';
import {
  EGRESS_LAYOUT_META,
  type EgressLayout,
  getEgressLayoutChoice,
  setEgressLayoutChoice,
} from '@/lib/livekitEgressLayouts';

interface EgressLayoutPickerProps {
  value?: EgressLayout;
  onChange?: (next: EgressLayout) => void;
  disabled?: boolean;
  className?: string;
  label?: string;
  /** When true the picker persists every change to localStorage. Default: true. */
  persist?: boolean;
}

export function EgressLayoutPicker({
  value,
  onChange,
  disabled,
  className,
  label = 'Recording Layout',
  persist = true,
}: EgressLayoutPickerProps) {
  const [internal, setInternal] = React.useState<EgressLayout>(
    () => value ?? getEgressLayoutChoice(),
  );

  React.useEffect(() => {
    if (value && value !== internal) setInternal(value);
  }, [value, internal]);

  const current = value ?? internal;
  const currentMeta = EGRESS_LAYOUT_META.find((m) => m.value === current);

  const handleChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const next = e.target.value as EgressLayout;
    setInternal(next);
    if (persist) setEgressLayoutChoice(next);
    onChange?.(next);
  };

  return (
    <div className={className}>
      {label ? (
        <label className="text-xs font-medium text-foreground/80 mb-1 block">
          {label}
        </label>
      ) : null}
      <select
        value={current}
        onChange={handleChange}
        disabled={disabled}
        className="w-full rounded-md border border-border bg-background px-3 py-2 text-sm
                   focus:outline-none focus:ring-2 focus:ring-primary disabled:opacity-50"
        aria-label={label}
      >
        {EGRESS_LAYOUT_META.map((m) => (
          <option key={m.value} value={m.value}>
            {m.label}
          </option>
        ))}
      </select>
      {currentMeta?.description ? (
        <p className="text-[11px] text-muted-foreground mt-1 leading-snug">
          {currentMeta.description}
        </p>
      ) : null}
    </div>
  );
}

export default EgressLayoutPicker;
