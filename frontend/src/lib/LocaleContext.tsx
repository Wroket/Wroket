"use client";

import { createContext, ReactNode, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { Locale, setLocale as setGlobalLocale, t as globalT, tForLocale, TranslationKey } from "./i18n";

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
  const [localeState, setLocaleState] = useState<Locale>("fr");
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    const stored = localStorage.getItem("wroket-locale");
    if (stored === "fr" || stored === "en") {
      setGlobalLocale(stored);
      setLocaleState(stored);
    } else {
      setGlobalLocale("fr");
    }
    setMounted(true);
  }, []);

  const changeLocale = useCallback((l: Locale) => {
    setGlobalLocale(l);
    setLocaleState(l);
  }, []);

  const locale = mounted ? localeState : "fr";

  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);

  const translate = useMemo(
    () => (key: TranslationKey | (string & {})) => tForLocale(locale, key),
    [locale],
  );

  return (
    <LocaleContext.Provider value={{ locale, setLocale: changeLocale, t: translate }}>
      {children}
    </LocaleContext.Provider>
  );
}

export function useLocale() {
  return useContext(LocaleContext);
}
