"use client";

import { Component, type ReactNode } from "react";
import { t } from "@/lib/i18n";

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, error: null };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo): void {
    console.error("[ErrorBoundary]", error, info.componentStack);
  }

  render(): ReactNode {
    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback;
      return (
        <div className="flex flex-col items-center justify-center min-h-[200px] gap-3 p-6">
          <p className="text-zinc-600 dark:text-slate-400 text-sm">
            {t("error.boundary.message")}
          </p>
          <button
            className="px-3 py-1.5 text-sm rounded bg-slate-700 dark:bg-slate-600 text-white hover:bg-slate-800 dark:hover:bg-slate-500"
            onClick={() => this.setState({ hasError: false, error: null })}
          >
            {t("error.boundary.retry")}
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
