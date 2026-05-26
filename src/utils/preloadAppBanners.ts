/**
 * Pkg371 — Boot-time banner preloader.
 *
 * Every bundled JPG/PNG under `src/assets/**` that is named "*banner*",
 * "*hero*" or lives under `src/assets/banners/**` is eagerly fetched +
 * decoded so the very first paint of any banner section is instant — no
 * piece-by-piece progressive decode, no "ভেঙে ভেঙে load" effect.
 *
 * Runs once at idle after first mount (after critical app boot work).
 * The browser already cached the asset by the time the user navigates to
 * Recharge / Invitation / Agency Dashboard / PayrollHelperGuide /
 * AgencyPolicy / Shop / VIP / etc.
 */

let _warmed = false;

export function preloadAppBanners(): void {
  if (_warmed || typeof window === 'undefined') return;
  _warmed = true;

  // Vite glob — resolved at build time to a map of static asset URLs.
  // `eager:true` + `as:url` returns string URLs synchronously (no dynamic chunks).
  const modules = {
    ...import.meta.glob('/src/assets/**/*banner*.{jpg,jpeg,png,webp,avif}', { eager: true, query: '?url', import: 'default' }),
    ...import.meta.glob('/src/assets/**/*hero*.{jpg,jpeg,png,webp,avif}', { eager: true, query: '?url', import: 'default' }),
    ...import.meta.glob('/src/assets/banners/**/*.{jpg,jpeg,png,webp,avif}', { eager: true, query: '?url', import: 'default' }),
  } as Record<string, string>;

  const urls = Array.from(new Set(Object.values(modules).filter(Boolean)));

  for (const url of urls) {
    try {
      const img = new Image();
      img.decoding = 'async';
      // hint browser to fetch with lower priority — we don't want to fight
      // first-render critical requests.
      (img as HTMLImageElement & { fetchPriority?: string }).fetchPriority = 'low';
      img.src = url;
      if (typeof img.decode === 'function') img.decode().catch(() => {});
    } catch { /* ignore */ }
  }
}
