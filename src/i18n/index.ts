import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import LanguageDetector from "i18next-browser-languagedetector";

import en from "./locales/en";
import bn from "./locales/bn";
import hi from "./locales/hi";
import ar from "./locales/ar";

const resources = {
  en: { translation: en },
  bn: { translation: bn },
  hi: { translation: hi },
  ar: { translation: ar },
};

// Get saved language from localStorage
const savedLanguage = localStorage.getItem("meri_app_language");

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources,
    lng: savedLanguage && savedLanguage !== "auto" ? savedLanguage : undefined,
    fallbackLng: "en",
    interpolation: {
      escapeValue: false,
    },
    detection: {
      order: ["localStorage", "navigator"],
      lookupLocalStorage: "meri_app_language",
      caches: ["localStorage"],
    },
  });

export default i18n;
