// Pkg423 — React hook surface for the Localization Engine.
// Use alongside (not instead of) react-i18next's useTranslation.
import { useCallback, useEffect, useState } from "react";
import i18n from "@/i18n";
import {
  setAppLanguage,
  formatNumber,
  formatCurrency,
  formatPercent,
  formatDate,
  formatDateTime,
  formatRelativeTime,
  formatList,
  getLanguage,
  isRTL,
  SUPPORTED_LANGUAGES,
} from "@/i18n/engine";

export function useLocalization() {
  const [language, setLanguageState] = useState(i18n.language || "en");

  useEffect(() => {
    const handler = (lng: string) => setLanguageState(lng);
    i18n.on("languageChanged", handler);
    return () => { i18n.off("languageChanged", handler); };
  }, []);

  const change = useCallback((code: string) => setAppLanguage(code), []);
  const meta = getLanguage(language);

  return {
    language,
    meta,
    rtl: isRTL(language),
    supported: SUPPORTED_LANGUAGES,
    setLanguage: change,
    formatNumber,
    formatCurrency,
    formatPercent,
    formatDate,
    formatDateTime,
    formatRelativeTime,
    formatList,
  };
}
