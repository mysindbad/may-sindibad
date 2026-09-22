"use client";

import { useCallback, useEffect, useState } from "react";
import { useLocale } from "@/i18n/LocaleProvider";
import { Button, Card } from "@/components/ui/primitives";
import { Skeleton } from "@/components/ui/feedback";

// Memory the traveller cannot see or erase would be surveillance rather than
// personalisation, so everything Sindbad has learned is listed here in plain
// language with a way to remove it.
interface MemoryRow {
  id: string;
  kind: string;
  key: string;
  value: string;
}

export function SindbadMemoryPanel() {
  const { dict } = useLocale();
  const [memories, setMemories] = useState<MemoryRow[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/account/memory");
      if (!res.ok) {
        setMemories([]);
        return;
      }
      const data = (await res.json()) as { memories?: MemoryRow[] };
      setMemories(data.memories ?? []);
    } catch {
      setMemories([]);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function forget(body: Record<string, unknown>, key: string) {
    setBusy(key);
    try {
      const res = await fetch("/api/account/memory", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (res.ok) await load();
    } catch {
      // Leaving the list unchanged is the honest outcome of a failed delete.
    } finally {
      setBusy(null);
    }
  }

  return (
    <Card className="space-y-3 p-4">
      <div>
        <p className="text-sm font-semibold text-brand-950">🧠 {dict.sindbadMemory.title}</p>
        <p className="text-xs text-slate-500">{dict.sindbadMemory.subtitle}</p>
      </div>

      {memories === null && <Skeleton className="h-16 w-full" />}

      {memories !== null && memories.length === 0 && <p className="text-sm text-slate-500">{dict.sindbadMemory.empty}</p>}

      {memories !== null && memories.length > 0 && (
        <>
          <ul className="space-y-2">
            {memories.map((memory) => (
              <li key={memory.id} className="flex items-start justify-between gap-3 rounded-xl bg-slate-50 p-3">
                <div className="min-w-0">
                  <p className="text-xs font-medium text-slate-500">{memory.key.replace(/_/g, " ")}</p>
                  <p className="text-sm text-brand-950">{memory.value}</p>
                </div>
                <Button
                  size="sm"
                  variant="ghost"
                  loading={busy === memory.id}
                  onClick={() => void forget({ memoryId: memory.id }, memory.id)}
                >
                  {dict.sindbadMemory.forget}
                </Button>
              </li>
            ))}
          </ul>

          <Button
            size="sm"
            variant="danger"
            loading={busy === "all"}
            onClick={() => {
              if (window.confirm(dict.sindbadMemory.forgetAllConfirm)) void forget({ all: true }, "all");
            }}
          >
            {dict.sindbadMemory.forgetAll}
          </Button>
        </>
      )}

      <p className="text-xs text-slate-400">{dict.sindbadMemory.note}</p>
    </Card>
  );
}
