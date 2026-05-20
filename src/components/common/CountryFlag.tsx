import { cn } from "@/lib/utils";

/**
 * Country flag renderer. Uses high-quality SVG flags via flagcdn (CDN, no key,
 * works offline after first cache). Falls back to emoji where Android WebView
 * cannot render flag emoji glyphs.
 *
 * Industry standard: PNG/SVG flags from ISO-3166 alpha-2 code, not unicode emoji.
 */
interface CountryFlagProps {
  /** ISO-3166-1 alpha-2 country code (e.g. "BD", "IN", "US"). Case-insensitive. */
  code?: string | null;
  /** Emoji fallback if code is missing/invalid. */
  emoji?: string | null;
  /** Tailwind size classes for the flag. Default w-4 h-3. */
  className?: string;
  /** Aria label / title. Defaults to country code. */
  title?: string;
}

export const CountryFlag = ({ code, emoji, className, title }: CountryFlagProps) => {
  const normalized = (code || "").trim().toLowerCase();
  const valid = /^[a-z]{2}$/.test(normalized);

  if (!valid) {
    if (emoji && emoji !== "NONE") {
      return (
        <span className={cn("inline-block leading-none", className)} title={title}>
          {emoji}
        </span>
      );
    }
    return null;
  }

  return (
    <img
      src={`https://flagcdn.com/w40/${normalized}.png`}
      srcSet={`https://flagcdn.com/w80/${normalized}.png 2x`}
      alt={title || normalized.toUpperCase()}
      title={title || normalized.toUpperCase()}
      loading="lazy"
      decoding="async"
      width={20}
      height={14}
      className={cn(
        "inline-block rounded-[2px] object-cover shadow-[0_0_0_1px_rgba(0,0,0,0.15)] align-middle",
        "w-[18px] h-[12px]",
        className,
      )}
      onError={(e) => {
        const img = e.currentTarget;
        if (emoji && img.dataset.fb !== "1") {
          img.dataset.fb = "1";
          img.style.display = "none";
          const span = document.createElement("span");
          span.textContent = emoji;
          span.className = "inline-block leading-none";
          img.parentElement?.insertBefore(span, img);
        }
      }}
    />
  );
};

export default CountryFlag;
