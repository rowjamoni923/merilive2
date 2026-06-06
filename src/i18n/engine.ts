// Dynamic Language & Localization Engine (Global Ready) — Pkg423
// Additive layer on top of existing i18next setup:
//  • Lazy on-demand locale loading (only en/hi/ar bundled, rest fetched JIT)
//  • Auto <html lang="…" dir="rtl|ltr"> sync
//  • Native per-app locale sync via existing AppLocale plugin (Android 13+)
//  • Locale-aware formatters (number, currency, date, relative time, list, %)
//  • Pure additive — DOES NOT touch existing keys, components, or call sites.

import i18n from "./index";
import { AppLocale } from "@/plugins/AppLocale";
import { getLanguage, isRTL, SUPPORTED_LANGUAGES, SupportedLanguage } from "./supportedLanguages";

const STORAGE_KEY = "meri_app_language";
const LOADED: Set<string> = new Set(["en", "hi", "ar"]); // already bundled
const LOADING: Map<string, Promise<void>> = new Map();

// Vite glob — picks up any future ./locales/<code>.ts the team drops in.
// Returns dynamic-import functions, so unused locales stay out of the main bundle.
const localeImporters = import.meta.glob<{ default: Record<string, unknown> }>(
  "./locales/*.ts"
);

async function dynamicLoad(code: string): Promise<void> {
  if (LOADED.has(code)) return;
  const existing = LOADING.get(code);
  if (existing) return existing;

  const path = `./locales/${code}.ts`;
  const importer = localeImporters[path];
  if (!importer) {
    // No bundle file — language is registered in catalog but no translation yet.
    // i18next will fall back to `en`, which is the desired behavior.
    LOADED.add(code);
    return;
  }
  const p = importer()
    .then((mod) => {
      i18n.addResourceBundle(code, "translation", mod.default, true, true);
      LOADED.add(code);
    })
    .catch((e) => {
      console.warn(`[i18n] Failed to load locale "${code}"`, e);
    })
    .finally(() => {
      LOADING.delete(code);
    });
  LOADING.set(code, p);
  return p;
}

function applyDocumentDirection(code: string) {
  if (typeof document === "undefined") return;
  const lang = getLanguage(code);
  document.documentElement.lang = lang.code;
  document.documentElement.dir = lang.rtl ? "rtl" : "ltr";
}

/** Change the active language end-to-end (i18next + <html> + native + storage). */
export async function setAppLanguage(code: string): Promise<void> {
  const lang = getLanguage(code);
  const target = lang.code;
  try {
    await dynamicLoad(target);
    await i18n.changeLanguage(target);
    try { localStorage.setItem(STORAGE_KEY, target); } catch { /* private mode */ }
    applyDocumentDirection(target);
    // Native per-app locale (Android 13+ wrapper, no-op elsewhere)
    AppLocale.setAppLocale({ language: target }).catch(() => {});
  } catch (e) {
    console.warn("[i18n] setAppLanguage failed", e);
  }
}

/** Initialize the engine — call once at app start, after i18n is ready. */
export function initLocalizationEngine() {
  const initial = i18n.language || "en";
  applyDocumentDirection(initial);
  // Pre-load the active locale (no-op for bundled ones)
  dynamicLoad(getLanguage(initial).code);

  i18n.on("languageChanged", (lng) => {
    dynamicLoad(getLanguage(lng).code);
    applyDocumentDirection(lng);
  });
}

// ───────────────────────────────────────── Formatters ─────────────────────────
function currentTag(): string {
  return getLanguage(i18n.language).locale;
}

export function formatNumber(value: number, options?: Intl.NumberFormatOptions): string {
  try { return new Intl.NumberFormat(currentTag(), options).format(value); }
  catch { return String(value); }
}

export function formatCurrency(value: number, currency?: string): string {
  const ccy = currency || getLanguage(i18n.language).currency;
  try { return new Intl.NumberFormat(currentTag(), { style: "currency", currency: ccy }).format(value); }
  catch { return `${ccy} ${value}`; }
}

export function formatPercent(value: number, fractionDigits = 0): string {
  try {
    return new Intl.NumberFormat(currentTag(), {
      style: "percent",
      minimumFractionDigits: fractionDigits,
      maximumFractionDigits: fractionDigits,
    }).format(value);
  } catch { return `${Math.round(value * 100)}%`; }
}

export function formatDate(value: Date | number | string, options?: Intl.DateTimeFormatOptions): string {
  try {
    const d = value instanceof Date ? value : new Date(value);
    return new Intl.DateTimeFormat(currentTag(), options ?? { dateStyle: "medium" }).format(d);
  } catch { return String(value); }
}

export function formatDateTime(value: Date | number | string): string {
  return formatDate(value, { dateStyle: "medium", timeStyle: "short" });
}

export function formatRelativeTime(value: Date | number | string): string {
  try {
    const d = value instanceof Date ? value : new Date(value);
    const diffMs = d.getTime() - Date.now();
    const rtf = new Intl.RelativeTimeFormat(currentTag(), { numeric: "auto" });
    const abs = Math.abs(diffMs);
    const min = 60_000, hr = 3_600_000, day = 86_400_000;
    if (abs < hr)  return rtf.format(Math.round(diffMs / min), "minute");
    if (abs < day) return rtf.format(Math.round(diffMs / hr),  "hour");
    if (abs < 30 * day) return rtf.format(Math.round(diffMs / day), "day");
    if (abs < 365 * day) return rtf.format(Math.round(diffMs / (30 * day)), "month");
    return rtf.format(Math.round(diffMs / (365 * day)), "year");
  } catch { return formatDate(value); }
}

export function formatList(items: string[], type: "conjunction" | "disjunction" = "conjunction"): string {
  try {
    // @ts-expect-error — Intl.ListFormat lib types lag in some envs
    return new Intl.ListFormat(currentTag(), { style: "long", type }).format(items);
  } catch { return items.join(type === "disjunction" ? " or " : ", "); }
}

// ───────────────────────────────────────── Public re-exports ──────────────────
export { SUPPORTED_LANGUAGES, getLanguage, isRTL };
export type { SupportedLanguage };
