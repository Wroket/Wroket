"use client";

import { createContext, ReactNode, useCallback, useContext, useEffect, useState } from "react";
import { Locale, setLocale as setGlobalLocale, t as globalT, TranslationKey } from "./i18n";

interface LocaleContextValue {
  locale: Locale;
  setLocale: (l: Locale) => void;
  t: (key: TranslationKey | (string & {})) => string;
}

const LocaleContext = createContext<LocaleContextValue>({
  locale: "fr",
  setLocale: () => {},
  t: globalT,
});

export function LocaleProvider({ children }: { children: ReactNode }) {
  // Always "fr" on SSR/first paint so server HTML matches client hydration; restore preference after mount.
  const [locale, setLocaleState] = useState<Locale>("fr");

  useEffect(() => {
    const stored = localStorage.getItem("wroket-locale");
    if (stored === "fr" || stored === "en") {
      setGlobalLocale(stored);
      setLocaleState(stored);
    }
  }, []);

  const changeLocale = useCallback((l: Locale) => {
    setGlobalLocale(l);
    setLocaleState(l);
  }, []);

  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);

  const translate = useCallback((key: TranslationKey | (string & {})) => globalT(key), [locale]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <LocaleContext.Provider value={{ locale, setLocale: changeLocale, t: translate }}>
      {children}
    </LocaleContext.Provider>
  );
}

export function useLocale() {
  return useContext(LocaleContext);
}
