import type { ReactNode } from "react";

/** A collapsible settings block, closed by default so the page reads as a
 * short list of topics instead of every control being on screen at once -
 * built on <details> rather than state so it needs no client JS of its own. */
export function SettingsSection({
  icon,
  title,
  subtitle,
  defaultOpen = false,
  danger = false,
  children,
}: {
  icon: string;
  title: string;
  subtitle?: string;
  defaultOpen?: boolean;
  danger?: boolean;
  children: ReactNode;
}) {
  return (
    <details
      className="group rounded-2xl border border-slate-200 bg-white open:shadow-[var(--shadow-card)] dark:border-white/10 dark:bg-white/[0.02]"
      open={defaultOpen}
    >
      <summary className="flex cursor-pointer list-none items-center gap-3 p-4 marker:content-none [&::-webkit-details-marker]:hidden">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-slate-100 text-base dark:bg-white/10">{icon}</span>
        <span className="min-w-0 flex-1">
          <span className={`block text-sm font-semibold ${danger ? "text-red-700 dark:text-red-400" : "text-brand-950 dark:text-sand-50"}`}>
            {title}
          </span>
          {subtitle && <span className="mt-0.5 block truncate text-xs text-slate-500 dark:text-slate-400">{subtitle}</span>}
        </span>
        <span className="shrink-0 text-slate-400 transition-transform duration-200 group-open:rotate-180" aria-hidden="true">
          ⌄
        </span>
      </summary>
      <div className="space-y-4 border-t border-slate-100 px-4 pb-4 pt-4 dark:border-white/5">{children}</div>
    </details>
  );
}
