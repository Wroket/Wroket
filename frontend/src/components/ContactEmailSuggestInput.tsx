"use client";

import { useEffect, useRef, useState, type KeyboardEventHandler, type ReactNode } from "react";

import { useContactEmailSuggestions } from "@/lib/useContactEmailSuggestions";

export interface ContactEmailSuggestInputProps {
  value: string;
  onChange: (next: string) => void;
  placeholder?: string;
  className?: string;
  inputClassName?: string;
  disabled?: boolean;
  id?: string;
  autoFocus?: boolean;
  autoComplete?: string;
  onKeyDown?: KeyboardEventHandler<HTMLInputElement>;
  inputType?: "email" | "text";
  rightAdornment?: ReactNode;
}

/**
 * Email field with dropdown of collaborators + team members (API), shown from the 3rd typed character.
 */
export default function ContactEmailSuggestInput({
  value,
  onChange,
  placeholder,
  className = "",
  inputClassName = "",
  disabled,
  id,
  autoFocus,
  autoComplete = "off",
  onKeyDown,
  inputType = "email",
  rightAdornment,
}: ContactEmailSuggestInputProps) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const { suggestions, loading, minQueryLength } = useContactEmailSuggestions(value);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);

  const showList =
    open &&
    value.trim().length >= minQueryLength &&
    suggestions.length > 0 &&
    !disabled;

  return (
    <div ref={wrapRef} className={`relative ${className}`}>
      <input
        id={id}
        type={inputType}
        value={value}
        disabled={disabled}
        autoFocus={autoFocus}
        autoComplete={autoComplete}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        onFocus={() => setOpen(true)}
        onKeyDown={onKeyDown}
        className={`${inputClassName}${rightAdornment ? " pr-9" : ""}`}
      />
      {rightAdornment && (
        <span className="absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none">{rightAdornment}</span>
      )}
      {loading && value.trim().length >= minQueryLength && !rightAdornment && (
        <div className="absolute right-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 border-2 border-zinc-300 dark:border-slate-500 border-t-emerald-500 rounded-full animate-spin pointer-events-none" />
      )}
      {showList && (
        <div className="absolute top-full left-0 right-0 mt-1 z-[60] bg-white dark:bg-slate-800 border border-zinc-200 dark:border-slate-600 rounded-lg shadow-lg py-1 max-h-48 overflow-y-auto">
          {suggestions.map((email) => (
            <button
              key={email}
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => {
                onChange(email);
                setOpen(false);
              }}
              className="block w-full text-left px-3 py-1.5 text-sm text-zinc-700 dark:text-slate-200 hover:bg-zinc-100 dark:hover:bg-slate-700 transition-colors truncate"
            >
              {email}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
