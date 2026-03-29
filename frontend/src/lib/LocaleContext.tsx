"use client";

import { createContext, ReactNode, useCallback, useContext, useEffect, useState } from "react";
import { Locale, initLocale, setLocale as setGlobalLocale, t as globalT, TranslationKey } from "./i18n";

interface LocaleContextValue {
  locale: Locale;
  setLocale: (l: Locale) => void;
  t: (key: TranslationKey) => string;
}

const LocaleContext = createContext<LocaleContextValue>({
  locale: "fr",
  setLocale: () => {},
  t: globalT,
});

export function LocaleProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>("fr");

  useEffect(() => {
    const stored = initLocale();
    setLocaleState(stored);
  }, []);

  const changeLocale = useCallback((l: Locale) => {
    setGlobalLocale(l);
    setLocaleState(l);
  }, []);

  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);

  const translate = useCallback((key: TranslationKey) => globalT(key), [locale]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <LocaleContext.Provider value={{ locale, setLocale: changeLocale, t: translate }}>
      {children}
    </LocaleContext.Provider>
  );
}

export function useLocale() {
  return useContext(LocaleContext);
}
