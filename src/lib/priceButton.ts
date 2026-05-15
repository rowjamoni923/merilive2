/**
 * Unified premium price-button style.
 *
 * Use this className anywhere a "price" call-to-action button is rendered
 * (recharge package price, helper top-up price, agency package price, etc.)
 * so every monetary CTA in the app shares the same premium gradient and
 * readable text treatment.
 *
 * Why a constant and not a Button variant? Price buttons are usually
 * full-width tile-bottom CTAs with custom inner layout (price + spinner,
 * price + struck-through original, etc.) — a className keeps composition
 * flexible while guaranteeing visual parity.
 */
export const PRICE_BUTTON_CLASS = [
  // Layout
  "w-full py-2.5 rounded-xl text-center font-bold text-[13px] leading-none",
  // Premium sapphire→purple→fuchsia gradient (matches Recharge canonical)
  "bg-gradient-to-r from-indigo-600 via-purple-600 to-fuchsia-600",
  // Readable text + subtle border highlight
  "text-white border border-white/20",
  // Depth + glow
  "shadow-[0_6px_20px_-4px_rgba(147,51,234,0.55),inset_0_1px_0_rgba(255,255,255,0.18)]",
  // Interaction states match shared Button premium pattern
  "transition-all duration-300",
  "hover:shadow-[0_10px_28px_-6px_rgba(147,51,234,0.7),inset_0_1px_0_rgba(255,255,255,0.22)] hover:brightness-110",
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-400/70 focus-visible:ring-offset-2 focus-visible:ring-offset-background",
  "active:scale-[0.98]",
  // Disabled — premium muted, not flat gray
  "disabled:pointer-events-none disabled:opacity-60 disabled:saturate-[0.6] disabled:shadow-none disabled:brightness-95 disabled:cursor-not-allowed",
].join(" ");
