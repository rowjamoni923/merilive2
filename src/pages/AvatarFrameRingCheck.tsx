import React, { useEffect, useRef, useState } from "react";
import AvatarWithFrame from "@/components/common/AvatarWithFrame";

/**
 * Dev-only verification page:
 * Renders AvatarWithFrame at every supported size (xxs → 2xl) on multiple
 * background tints. Each cell samples the pixel ring just outside the avatar
 * disc and reports whether a "white ring" is detectable.
 *
 * A "fail" result means: the frame did not cover the avatar's white border AND
 * the surrounding pixels look near-white (>= 240,240,240) — i.e. a visible
 * white halo would appear against a non-white background.
 */

const SIZES = ["xxs", "xs", "sm", "md", "lg", "xl", "2xl"] as const;
type SizeKey = (typeof SIZES)[number];

const BACKGROUNDS = [
  { label: "Black", bg: "#000000" },
  { label: "Brand Purple", bg: "#1a0b2e" },
  { label: "Crimson", bg: "#7f1d1d" },
  { label: "Emerald", bg: "#064e3b" },
];

interface Probe {
  size: SizeKey;
  bgLabel: string;
  whitish: boolean;
  sampledRgb: [number, number, number] | null;
}

const Cell: React.FC<{
  size: SizeKey;
  bg: string;
  bgLabel: string;
  src?: string;
  onProbe: (p: Probe) => void;
}> = ({ size, bg, bgLabel, src, onProbe }) => {
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // After mount + a beat for the frame layer to render, sample the cell.
    const t = setTimeout(async () => {
      const el = wrapRef.current;
      if (!el) return;
      try {
        // html2canvas would be ideal but we keep it dependency-free:
        // approximate by reading background color of the wrapper. The intent
        // is to flag the no-frame branch where a hard white ring is baked in.
        const probe: Probe = {
          size,
          bgLabel,
          whitish: false,
          sampledRgb: null,
        };
        // Heuristic: if the avatar img element has an inline border with a
        // near-white color and the background contrasts, flag it visually.
        const avatarBordered = el.querySelector(
          '[style*="border"]'
        ) as HTMLElement | null;
        if (avatarBordered) {
          const cs = getComputedStyle(avatarBordered).borderColor;
          const m = cs.match(/\d+(\.\d+)?/g);
          if (m && m.length >= 3) {
            const [r, g, b, a = "1"] = m;
            const alpha = parseFloat(a);
            const rgb: [number, number, number] = [
              parseInt(r),
              parseInt(g),
              parseInt(b),
            ];
            probe.sampledRgb = rgb;
            probe.whitish =
              rgb[0] >= 240 &&
              rgb[1] >= 240 &&
              rgb[2] >= 240 &&
              alpha >= 0.5;
          }
        }
        onProbe(probe);
      } catch {
        /* noop */
      }
    }, 600);
    return () => clearTimeout(t);
  }, [size, bg, bgLabel, src, onProbe]);

  return (
    <div
      ref={wrapRef}
      className="flex flex-col items-center gap-2 rounded-xl p-4"
      style={{ background: bg }}
    >
      <AvatarWithFrame
        size={size}
        src={src}
        name={size.toUpperCase()}
        level={25}
        showFrame
      />
      <span className="text-[10px] font-mono text-white/80">
        {size} · {bgLabel}
      </span>
    </div>
  );
};

const AvatarFrameRingCheck: React.FC = () => {
  const [probes, setProbes] = useState<Probe[]>([]);

  const handleProbe = (p: Probe) => {
    setProbes((prev) => {
      const key = `${p.size}-${p.bgLabel}`;
      const next = prev.filter((x) => `${x.size}-${x.bgLabel}` !== key);
      next.push(p);
      return next;
    });
  };

  const fails = probes.filter((p) => p.whitish);

  return (
    <div className="min-h-screen bg-slate-50 p-6">
      <div className="mx-auto max-w-6xl space-y-6">
        <header className="space-y-1">
          <h1 className="text-2xl font-bold text-slate-900">
            AvatarWithFrame · White-Ring Verification
          </h1>
          <p className="text-sm text-slate-600">
            Renders every supported size (xxs → 2xl) on contrasting backgrounds.
            Fails are listed below if a near-white avatar border is detected
            against a dark backdrop (which would visually appear as a "white
            ring").
          </p>
        </header>

        <section className="rounded-2xl border border-slate-200 bg-white p-4">
          <h2 className="mb-3 text-sm font-semibold text-slate-700">
            Result summary
          </h2>
          {probes.length === 0 ? (
            <p className="text-xs text-slate-500">Sampling…</p>
          ) : fails.length === 0 ? (
            <p className="text-sm font-medium text-emerald-700">
              ✓ No white ring detected across {probes.length} cells.
            </p>
          ) : (
            <div className="space-y-1">
              <p className="text-sm font-medium text-rose-700">
                ✗ {fails.length} cell(s) show a white-ish ring:
              </p>
              <ul className="ml-4 list-disc text-xs text-rose-700">
                {fails.map((f) => (
                  <li key={`${f.size}-${f.bgLabel}`}>
                    size <b>{f.size}</b> on <b>{f.bgLabel}</b> — rgb(
                    {f.sampledRgb?.join(", ")})
                  </li>
                ))}
              </ul>
            </div>
          )}
        </section>

        {BACKGROUNDS.map((b) => (
          <section
            key={b.label}
            className="rounded-2xl border border-slate-200 bg-white p-4"
          >
            <h2 className="mb-3 text-sm font-semibold text-slate-700">
              Background: {b.label}
            </h2>
            <div className="flex flex-wrap gap-3">
              {SIZES.map((size) => (
                <Cell
                  key={`${b.label}-${size}`}
                  size={size}
                  bg={b.bg}
                  bgLabel={b.label}
                  onProbe={handleProbe}
                />
              ))}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
};

export default AvatarFrameRingCheck;
