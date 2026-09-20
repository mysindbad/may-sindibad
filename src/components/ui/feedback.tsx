"use client";

import { type ReactNode, useState } from "react";
import { cn } from "@/lib/utils";
import { Button } from "./primitives";

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn("animate-skeleton rounded-xl bg-slate-200/80", className)} />;
}

export function EmptyState({
  icon,
  title,
  body,
  action,
}: {
  icon?: ReactNode;
  title: string;
  body?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-2xl border border-dashed border-brand-900/15 bg-white/60 px-6 py-10 text-center">
      {icon && <div className="text-3xl">{icon}</div>}
      <h3 className="text-base font-semibold text-brand-950">{title}</h3>
      {body && <p className="max-w-sm text-sm text-slate-600">{body}</p>}
      {action}
    </div>
  );
}

export function InlineAlert({ tone = "info", children }: { tone?: "info" | "warning" | "error" | "success"; children: ReactNode }) {
  const tones = {
    info: "bg-sky-500/10 text-brand-800 border-sky-500/20",
    warning: "bg-sun-400/15 text-amber-900 border-sun-400/30",
    error: "bg-red-50 text-red-700 border-red-200",
    success: "bg-lime-400/15 text-brand-900 border-lime-400/30",
  } as const;
  return <div className={cn("rounded-xl border px-4 py-3 text-sm leading-relaxed", tones[tone])}>{children}</div>;
}

export function ConfirmButton({
  label,
  confirmLabel,
  onConfirm,
  variant = "danger",
  className,
}: {
  label: string;
  confirmLabel: string;
  onConfirm: () => void | Promise<void>;
  variant?: "danger" | "secondary";
  className?: string;
}) {
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);

  if (!confirming) {
    return (
      <Button variant={variant} size="sm" className={className} onClick={() => setConfirming(true)}>
        {label}
      </Button>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <span className="text-xs text-slate-600">{confirmLabel}</span>
      <Button
        variant={variant}
        size="sm"
        loading={busy}
        onClick={async () => {
          setBusy(true);
          try {
            await onConfirm();
          } finally {
            setBusy(false);
            setConfirming(false);
          }
        }}
      >
        Yes
      </Button>
      <Button variant="ghost" size="sm" onClick={() => setConfirming(false)}>
        No
      </Button>
    </div>
  );
}
