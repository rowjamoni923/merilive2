/**
 * Unified premium price-button style.
 *
 * Pulls from design tokens declared in `src/index.css`:
 *   --price-from / --price-via / --price-to       → bg-gradient-price
 *   --price-foreground                            → text-price-foreground
 *   --price-ring                                  → focus-visible:ring-price-ring
 *   --price-border                                → border-price-border/20
 *   --shadow-price / --shadow-price-hover         → shadow-price / hover:shadow-price-hover
 *
 * Edit those tokens (light + dark blocks in index.css) to retheme every
 * monetary CTA in the app at once. Never hard-code purple/indigo here.
 */
export const PRICE_BUTTON_CLASS = [
  // Layout
  "w-full py-2.5 rounded-xl text-center font-bold text-[13px] leading-none",
  // Themed gradient + text
  "bg-gradient-price text-price-foreground",
  // Subtle highlight border (token color at 20% opacity)
  "border border-price-border/20",
  // Themed depth + glow
  "shadow-price",
  // Interaction states
  "transition-all duration-300",
  "hover:shadow-price-hover hover:brightness-110",
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-price-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
  "active:scale-[0.98]",
  // Disabled — premium muted, not flat gray
  "disabled:pointer-events-none disabled:opacity-60 disabled:saturate-[0.6] disabled:shadow-none disabled:brightness-95 disabled:cursor-not-allowed",
].join(" ");
