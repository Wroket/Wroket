import { type InputHTMLAttributes, forwardRef } from "react";

const BASE_CLS =
  "w-full rounded border border-zinc-300 dark:border-slate-600 px-3 py-2 text-sm text-zinc-900 dark:text-slate-100 dark:bg-slate-800 focus:border-slate-700 dark:focus:border-slate-400 focus:outline-none focus:ring-1 focus:ring-slate-700 dark:focus:ring-slate-400 placeholder:text-zinc-400 dark:placeholder:text-slate-500";

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  error?: boolean;
}

const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ error, className = "", ...props }, ref) => (
    <input
      ref={ref}
      className={`${BASE_CLS} ${error ? "border-red-400 dark:border-red-600 focus:border-red-500 focus:ring-red-500" : ""} ${className}`}
      {...props}
    />
  ),
);

Input.displayName = "Input";
export default Input;
