// Global Localization catalog — code, native name, English name, RTL, currency, locale tag.
export interface SupportedLanguage {
  code: string;          // i18next language code (lowercase)
  name: string;          // English name
  nativeName: string;    // Native script name
  rtl: boolean;          // Right-to-left
  locale: string;        // BCP-47 tag for Intl.* formatters
  currency: string;      // Default ISO-4217 currency
  flag: string;          // Emoji flag for UI pickers
}

export const SUPPORTED_LANGUAGES: SupportedLanguage[] = [
  { code: "en", name: "English",      nativeName: "English",     rtl: false, locale: "en-US", currency: "USD", flag: "🇺🇸" },
  { code: "hi", name: "Hindi",        nativeName: "हिन्दी",        rtl: false, locale: "hi-IN", currency: "INR", flag: "🇮🇳" },
  { code: "bn", name: "Bengali",      nativeName: "বাংলা",         rtl: false, locale: "bn-BD", currency: "BDT", flag: "🇧🇩" },
  { code: "ur", name: "Urdu",         nativeName: "اردو",          rtl: true,  locale: "ur-PK", currency: "PKR", flag: "🇵🇰" },
  { code: "ar", name: "Arabic",       nativeName: "العربية",       rtl: true,  locale: "ar-SA", currency: "SAR", flag: "🇸🇦" },
  { code: "fa", name: "Persian",      nativeName: "فارسی",         rtl: true,  locale: "fa-IR", currency: "IRR", flag: "🇮🇷" },
  { code: "tr", name: "Turkish",      nativeName: "Türkçe",        rtl: false, locale: "tr-TR", currency: "TRY", flag: "🇹🇷" },
  { code: "id", name: "Indonesian",   nativeName: "Bahasa Indonesia", rtl: false, locale: "id-ID", currency: "IDR", flag: "🇮🇩" },
  { code: "ms", name: "Malay",        nativeName: "Bahasa Melayu", rtl: false, locale: "ms-MY", currency: "MYR", flag: "🇲🇾" },
  { code: "vi", name: "Vietnamese",   nativeName: "Tiếng Việt",    rtl: false, locale: "vi-VN", currency: "VND", flag: "🇻🇳" },
  { code: "th", name: "Thai",         nativeName: "ไทย",           rtl: false, locale: "th-TH", currency: "THB", flag: "🇹🇭" },
  { code: "fil",name: "Filipino",     nativeName: "Filipino",      rtl: false, locale: "fil-PH",currency: "PHP", flag: "🇵🇭" },
  { code: "zh", name: "Chinese",      nativeName: "中文",           rtl: false, locale: "zh-CN", currency: "CNY", flag: "🇨🇳" },
  { code: "ja", name: "Japanese",     nativeName: "日本語",          rtl: false, locale: "ja-JP", currency: "JPY", flag: "🇯🇵" },
  { code: "ko", name: "Korean",       nativeName: "한국어",          rtl: false, locale: "ko-KR", currency: "KRW", flag: "🇰🇷" },
  { code: "es", name: "Spanish",      nativeName: "Español",       rtl: false, locale: "es-ES", currency: "EUR", flag: "🇪🇸" },
  { code: "pt", name: "Portuguese",   nativeName: "Português",     rtl: false, locale: "pt-BR", currency: "BRL", flag: "🇧🇷" },
  { code: "fr", name: "French",       nativeName: "Français",      rtl: false, locale: "fr-FR", currency: "EUR", flag: "🇫🇷" },
  { code: "de", name: "German",       nativeName: "Deutsch",       rtl: false, locale: "de-DE", currency: "EUR", flag: "🇩🇪" },
  { code: "it", name: "Italian",      nativeName: "Italiano",      rtl: false, locale: "it-IT", currency: "EUR", flag: "🇮🇹" },
  { code: "ru", name: "Russian",      nativeName: "Русский",       rtl: false, locale: "ru-RU", currency: "RUB", flag: "🇷🇺" },
  { code: "uk", name: "Ukrainian",    nativeName: "Українська",    rtl: false, locale: "uk-UA", currency: "UAH", flag: "🇺🇦" },
  { code: "pl", name: "Polish",       nativeName: "Polski",        rtl: false, locale: "pl-PL", currency: "PLN", flag: "🇵🇱" },
  { code: "nl", name: "Dutch",        nativeName: "Nederlands",    rtl: false, locale: "nl-NL", currency: "EUR", flag: "🇳🇱" },
  { code: "sw", name: "Swahili",      nativeName: "Kiswahili",     rtl: false, locale: "sw-KE", currency: "KES", flag: "🇰🇪" },
  { code: "ha", name: "Hausa",        nativeName: "Hausa",         rtl: false, locale: "ha-NG", currency: "NGN", flag: "🇳🇬" },
  { code: "ta", name: "Tamil",        nativeName: "தமிழ்",          rtl: false, locale: "ta-IN", currency: "INR", flag: "🇮🇳" },
  { code: "te", name: "Telugu",       nativeName: "తెలుగు",         rtl: false, locale: "te-IN", currency: "INR", flag: "🇮🇳" },
  { code: "mr", name: "Marathi",      nativeName: "मराठी",          rtl: false, locale: "mr-IN", currency: "INR", flag: "🇮🇳" },
  { code: "gu", name: "Gujarati",     nativeName: "ગુજરાતી",        rtl: false, locale: "gu-IN", currency: "INR", flag: "🇮🇳" },
  { code: "pa", name: "Punjabi",      nativeName: "ਪੰਜਾਬੀ",         rtl: false, locale: "pa-IN", currency: "INR", flag: "🇮🇳" },
];

export const LANGUAGE_BY_CODE: Record<string, SupportedLanguage> =
  SUPPORTED_LANGUAGES.reduce((acc, l) => { acc[l.code] = l; return acc; }, {} as Record<string, SupportedLanguage>);

export function getLanguage(code: string | undefined | null): SupportedLanguage {
  if (!code) return LANGUAGE_BY_CODE.en;
  const base = code.toLowerCase().split(/[-_]/)[0];
  return LANGUAGE_BY_CODE[base] || LANGUAGE_BY_CODE.en;
}

export function isRTL(code: string | undefined | null): boolean {
  return getLanguage(code).rtl;
}
