"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import en from "../locales/en.json";
import ptBR from "../locales/pt-BR.json";

export type Locale = "pt-BR" | "en";

const dictionaries: Record<Locale, typeof ptBR> = {
  "pt-BR": ptBR,
  en: en,
};

const LOCALE_STORAGE_KEY = "giromesa_locale";

function getInitialLocale(): Locale {
  if (typeof window === "undefined") return "pt-BR";

  try {
    const saved = localStorage.getItem(LOCALE_STORAGE_KEY);
    if (saved === "en" || saved === "pt-BR") return saved;
  } catch {
    // localStorage not available
  }

  // Default to Portuguese for Brazilian SaaS
  return "pt-BR";
}

export function useTranslation() {
  const [locale, setLocaleState] = useState<Locale>(getInitialLocale);

  const setLocale = useCallback((newLocale: Locale) => {
    setLocaleState(newLocale);
    try {
      localStorage.setItem(LOCALE_STORAGE_KEY, newLocale);
    } catch {
      // localStorage not available
    }
    document.documentElement.lang = newLocale;
  }, []);

  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);

  const t = useMemo(() => {
    const dict = dictionaries[locale];
    return (key: string): string => {
      const keys = key.split(".");
      let value: unknown = dict;
      for (const k of keys) {
        if (value === null || value === undefined) return key;
        value = (value as Record<string, unknown>)[k];
      }
      return typeof value === "string" ? value : key;
    };
  }, [locale]);

  const tArray = useMemo(() => {
    const dict = dictionaries[locale];
    return (key: string): string[] => {
      const keys = key.split(".");
      let value: unknown = dict;
      for (const k of keys) {
        if (value === null || value === undefined) return [];
        value = (value as Record<string, unknown>)[k];
      }
      return Array.isArray(value) ? (value as string[]) : [];
    };
  }, [locale]);

  return { locale, setLocale, t, tArray };
}

export const locales: { code: Locale; label: string }[] = [
  { code: "pt-BR", label: "Português (BR)" },
  { code: "en", label: "English" },
];
