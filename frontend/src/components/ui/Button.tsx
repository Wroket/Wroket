import { type ButtonHTMLAttributes, forwardRef } from "react";

type ButtonVariant = "primary" | "secondary" | "danger" | "ghost";
type ButtonSize = "sm" | "md" | "lg";

const VARIANT_CLS: Record<ButtonVariant, string> = {
  primary:
    "bg-emerald-600 dark:bg-emerald-500 text-white hover:bg-emerald-700 dark:hover:bg-emerald-400 disabled:opacity-60",
  secondary:
    "border border-zinc-200 dark:border-slate-600 text-zinc-600 dark:text-slate-300 hover:bg-zinc-50 dark:hover:bg-slate-800",
  danger:
    "border border-red-200 dark:border-red-800 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/40",
  ghost:
    "text-zinc-500 dark:text-slate-400 hover:bg-zinc-100 dark:hover:bg-slate-800 hover:text-zinc-900 dark:hover:text-slate-100",
};

const SIZE_CLS: Record<ButtonSize, string> = {
  sm: "px-2.5 py-1 text-xs",
  md: "px-4 py-2 text-sm",
  lg: "px-5 py-2.5 text-sm",
};

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
}

const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ variant = "primary", size = "md", className = "", ...props }, ref) => (
    <button
      ref={ref}
      className={`rounded font-medium transition-colors ${VARIANT_CLS[variant]} ${SIZE_CLS[size]} ${className}`}
      {...props}
    />
  ),
);

Button.displayName = "Button";
export default Button;
