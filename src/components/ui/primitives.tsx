"use client";

import { forwardRef, type ButtonHTMLAttributes, type InputHTMLAttributes, type TextareaHTMLAttributes, type SelectHTMLAttributes, type ReactNode } from "react";
import { cn } from "@/lib/utils";

type Variant = "primary" | "secondary" | "ghost" | "danger";
type Size = "sm" | "md" | "lg";

const VARIANT_CLASSES: Record<Variant, string> = {
  primary: "bg-brand-800 text-white hover:bg-brand-700 active:bg-brand-900 disabled:bg-brand-800/40 dark:bg-sky-600 dark:hover:bg-sky-500",
  secondary: "bg-sky-500/10 text-brand-800 hover:bg-sky-500/20 active:bg-sky-500/25 dark:bg-sky-500/15 dark:text-sky-300 dark:hover:bg-sky-500/25",
  ghost: "bg-transparent text-brand-800 hover:bg-brand-800/5 dark:text-sky-300 dark:hover:bg-white/5",
  danger: "bg-red-600 text-white hover:bg-red-700 active:bg-red-800",
};

const SIZE_CLASSES: Record<Size, string> = {
  sm: "h-9 px-3 text-sm rounded-lg gap-1.5",
  md: "h-11 px-4 text-sm rounded-xl gap-2",
  lg: "h-13 px-6 text-base rounded-2xl gap-2",
};

export const Button = forwardRef<HTMLButtonElement, ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: Size; loading?: boolean; fullWidth?: boolean }>(
  ({ variant = "primary", size = "md", loading, fullWidth, className, children, disabled, ...props }, ref) => {
    return (
      <button
        ref={ref}
        disabled={disabled || loading}
        className={cn(
          "inline-flex items-center justify-center font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-60",
          VARIANT_CLASSES[variant],
          SIZE_CLASSES[size],
          fullWidth && "w-full",
          className,
        )}
        {...props}
      >
        {loading ? <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" /> : children}
      </button>
    );
  },
);
Button.displayName = "Button";

export function Card({ className, children }: { className?: string; children: ReactNode }) {
  return (
    <div className={cn("rounded-2xl border border-brand-900/5 bg-white shadow-[var(--shadow-card)] dark:border-white/10 dark:bg-brand-900", className)}>
      {children}
    </div>
  );
}

const BADGE_TONES = {
  neutral: "bg-slate-100 text-slate-700 dark:bg-white/10 dark:text-slate-200",
  brand: "bg-brand-800/10 text-brand-800 dark:bg-sky-500/15 dark:text-sky-300",
  sky: "bg-sky-500/10 text-sky-700 dark:bg-sky-500/15 dark:text-sky-300",
  turquoise: "bg-turquoise-500/10 text-turquoise-500 dark:bg-turquoise-500/15 dark:text-turquoise-400",
  lime: "bg-lime-400/20 text-brand-800 dark:bg-lime-400/20 dark:text-lime-300",
  sun: "bg-sun-400/20 text-amber-800 dark:bg-sun-400/20 dark:text-amber-300",
  danger: "bg-red-100 text-red-700 dark:bg-red-500/15 dark:text-red-300",
} as const;

export function Badge({ tone = "neutral", className, children }: { tone?: keyof typeof BADGE_TONES; className?: string; children: ReactNode }) {
  return (
    <span className={cn("inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium", BADGE_TONES[tone], className)}>
      {children}
    </span>
  );
}

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(({ className, ...props }, ref) => (
  <input
    ref={ref}
    className={cn(
      "h-11 w-full rounded-xl border border-slate-200 bg-white px-3.5 text-sm text-brand-950 placeholder:text-slate-400 outline-none transition focus:border-sky-500 focus:ring-2 focus:ring-sky-500/20 dark:border-white/15 dark:bg-brand-900 dark:text-sand-50 dark:placeholder:text-slate-500",
      className,
    )}
    {...props}
  />
));
Input.displayName = "Input";

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(({ className, ...props }, ref) => (
  <textarea
    ref={ref}
    className={cn(
      "w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm text-brand-950 placeholder:text-slate-400 outline-none transition focus:border-sky-500 focus:ring-2 focus:ring-sky-500/20 dark:border-white/15 dark:bg-brand-900 dark:text-sand-50 dark:placeholder:text-slate-500",
      className,
    )}
    {...props}
  />
));
Textarea.displayName = "Textarea";

export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement>>(({ className, children, ...props }, ref) => (
  <select
    ref={ref}
    className={cn(
      "h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm text-brand-950 outline-none transition focus:border-sky-500 focus:ring-2 focus:ring-sky-500/20 dark:border-white/15 dark:bg-brand-900 dark:text-sand-50",
      className,
    )}
    {...props}
  >
    {children}
  </select>
));
Select.displayName = "Select";

export function Label({ children, htmlFor }: { children: ReactNode; htmlFor?: string }) {
  return (
    <label htmlFor={htmlFor} className="mb-1.5 block text-sm font-medium text-brand-900 dark:text-slate-200">
      {children}
    </label>
  );
}

export function FieldError({ children }: { children?: ReactNode }) {
  if (!children) return null;
  return <p className="mt-1 text-xs text-red-600 dark:text-red-400">{children}</p>;
}
