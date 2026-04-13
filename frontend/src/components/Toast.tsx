"use client";

import { createContext, ReactNode, useCallback, useContext, useState } from "react";

import { useLocale } from "@/lib/LocaleContext";

type ToastType = "success" | "error" | "info";

interface Toast {
  id: number;
  message: string;
  type: ToastType;
  exiting: boolean;
}

interface ToastAPI {
  success: (message: string) => void;
  error: (message: string) => void;
  info: (message: string) => void;
}

const STYLES: Record<ToastType, string> = {
  success:
    "border-l-green-500 bg-green-50 text-green-800 dark:bg-slate-800 dark:text-green-300 dark:border-l-green-400",
  error:
    "border-l-red-500 bg-red-50 text-red-800 dark:bg-slate-800 dark:text-red-300 dark:border-l-red-400",
  info:
    "border-l-blue-500 bg-blue-50 text-blue-800 dark:bg-slate-800 dark:text-blue-300 dark:border-l-blue-400",
};

const ToastContext = createContext<{ toast: ToastAPI }>({
  toast: { success: () => {}, error: () => {}, info: () => {} },
});

let nextId = 0;

export function ToastProvider({ children }: { children: ReactNode }) {
  const { t } = useLocale();
  const [toasts, setToasts] = useState<Toast[]>([]);

  const dismiss = useCallback((id: number) => {
    setToasts((prev) => prev.map((t) => (t.id === id ? { ...t, exiting: true } : t)));
    setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 300);
  }, []);

  const add = useCallback(
    (message: string, type: ToastType) => {
      const id = nextId++;
      setToasts((prev) => [...prev, { id, message, type, exiting: false }]);
      setTimeout(() => dismiss(id), 4000);
    },
    [dismiss],
  );

  const toast: ToastAPI = {
    success: (m) => add(m, "success"),
    error: (m) => add(m, "error"),
    info: (m) => add(m, "info"),
  };

  return (
    <ToastContext.Provider value={{ toast }}>
      {children}
      <div role="status" aria-live="polite" className="fixed bottom-4 right-4 z-[9999] flex flex-col gap-2 pointer-events-none">
        {toasts.map((item) => (
          <div
            key={item.id}
            className={`pointer-events-auto flex items-center gap-3 px-4 py-3 rounded-md shadow-lg border-l-4 text-sm
              min-w-[280px] max-w-[400px] transition-all duration-300
              ${STYLES[item.type]}
              ${item.exiting ? "opacity-0 translate-x-4" : "opacity-100 translate-x-0 toast-enter"}`}
          >
            <span className="flex-1">{item.message}</span>
            <button
              onClick={() => dismiss(item.id)}
              className="shrink-0 opacity-60 hover:opacity-100 transition-opacity"
              aria-label={t("a11y.close")}
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  return useContext(ToastContext);
}
