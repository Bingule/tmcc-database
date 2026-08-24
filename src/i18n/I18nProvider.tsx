import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { en, type TranslationKey } from "../locales/en";
import { zh } from "../locales/zh";

export type Language = "en" | "zh";

type InterpolationParams = Record<string, string | number>;
type TranslationResources = Partial<Record<TranslationKey, string>>;

type I18nContextValue = {
  language: Language;
  setLanguage: (language: Language) => void;
  t: (key: TranslationKey, params?: InterpolationParams) => string;
};

const STORAGE_KEY = "tmcc-language";
const documentLanguages: Record<Language, string> = { en: "en", zh: "zh-CN" };
const I18nContext = createContext<I18nContextValue | null>(null);

export function I18nProvider({ children }: { children: ReactNode }): React.ReactElement {
  const [language, setCurrentLanguage] = useState<Language>(readSavedLanguage);

  useEffect(() => {
    document.documentElement.lang = documentLanguages[language];
  }, [language]);

  const setLanguage = useCallback((nextLanguage: Language) => {
    setCurrentLanguage(nextLanguage);
    writeSavedLanguage(nextLanguage);
  }, []);

  const t = useCallback((key: TranslationKey, params?: InterpolationParams) => {
    const translations = language === "zh" ? zh : en;
    return resolveTranslation(key, params, translations);
  }, [language]);

  const value = useMemo(() => ({ language, setLanguage, t }), [language, setLanguage, t]);

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nContextValue {
  const context = useContext(I18nContext);
  if (!context) throw new Error("useI18n must be used within an I18nProvider");
  return context;
}

export function resolveTranslation(
  key: TranslationKey,
  params: InterpolationParams | undefined,
  translations: TranslationResources
): string {
  const value = translations[key] ?? en[key];
  return value.replace(/{{(\w+)}}/g, (token, name: string) => {
    const parameter = params?.[name];
    return parameter === undefined ? token : String(parameter);
  });
}

function readSavedLanguage(): Language {
  if (typeof window === "undefined") return "en";
  try {
    return window.localStorage.getItem(STORAGE_KEY) === "zh" ? "zh" : "en";
  } catch {
    return "en";
  }
}

function writeSavedLanguage(language: Language) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, language);
  } catch {
    // Storage can be disabled by browser privacy settings; the in-memory state remains authoritative.
  }
}
