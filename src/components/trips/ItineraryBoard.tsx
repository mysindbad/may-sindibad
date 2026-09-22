"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { useLocale } from "@/i18n/LocaleProvider";
import { Button, Input } from "@/components/ui/primitives";
import { InlineAlert, ConfirmButton } from "@/components/ui/feedback";
import { formatCurrency } from "@/lib/utils";

interface ItineraryItem {
  id: string;
  title: string;
  category: string;
  startTime: string | null;
  estimatedCost: string | null;
  currency: string;
  status: string;
  notes: string | null;
}

interface TripDay {
  id: string;
  dayIndex: number;
  date: string;
  items: ItineraryItem[];
}

interface TripSummary {
  id: string;
  title: string;
  status: string;
  budgetCurrency: string;
}

export function ItineraryBoard({ trip, days: initialDays, aiNotice }: { trip: TripSummary; days: TripDay[]; aiNotice?: string | null }) {
  const { dict, locale } = useLocale();
  const router = useRouter();
  const [days, setDays] = useState(initialDays);
  const [adjustMessage, setAdjustMessage] = useState("");
  const [adjustFeedback, setAdjustFeedback] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function handleAdjust(event: FormEvent) {
    event.preventDefault();
    if (!adjustMessage.trim()) return;
    setBusy(true);
    setAdjustFeedback(null);
    try {
      const res = await fetch(`/api/trips/${trip.id}/adjust`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: adjustMessage }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setAdjustFeedback(data.error ?? data.message ?? dict.common.somethingWentWrong);
        return;
      }
      setAdjustFeedback(data.message ?? dict.common.somethingWentWrong);
      setAdjustMessage("");
      router.refresh();
    } catch {
      setAdjustFeedback(dict.errors.network);
    } finally {
      setBusy(false);
    }
  }

  async function updateItemStatus(itemId: string, status: string) {
    const res = await fetch(`/api/itinerary-items/${itemId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    if (!res.ok) {
      router.refresh();
      return;
    }
    setDays((prev) => prev.map((day) => ({ ...day, items: day.items.map((item) => (item.id === itemId ? { ...item, status } : item)) })));
  }

  async function deleteTrip() {
    const res = await fetch(`/api/trips/${trip.id}`, { method: "DELETE" });
    if (!res.ok) {
      router.refresh();
      return;
    }
    router.push(`/${locale}/trips`);
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-6">
      <div className="mb-4 flex items-start justify-between">
        <h1 className="text-xl font-semibold text-brand-950 dark:text-sand-50">{trip.title}</h1>
        <ConfirmButton label={dict.common.delete} confirmLabel={dict.trips.deleteConfirm} onConfirm={deleteTrip} />
      </div>

      {aiNotice === "ai_not_configured" && <InlineAlert tone="warning">{dict.trips.aiUnavailableNotice}</InlineAlert>}

      <div className="my-5 space-y-6">
        {days.map((day) => (
          <div key={day.id}>
            <h2 className="mb-2 text-sm font-semibold text-brand-900 dark:text-sand-50">
              {dict.trips.day} {day.dayIndex + 1} · {day.date}
            </h2>
            <ul className="space-y-2">
              {day.items.map((item) => (
                <li key={item.id} className="flex items-center justify-between rounded-xl bg-white p-3 shadow-[var(--shadow-card)]">
                  <div>
                    <p className={`text-sm font-medium ${item.status === "skipped" ? "text-slate-400 line-through" : "text-brand-950 dark:text-sand-50"}`}>
                      {item.startTime ? `${item.startTime} · ` : ""}
                      {item.title}
                    </p>
                    {item.estimatedCost && Number(item.estimatedCost) > 0 && (
                      <p className="text-xs text-slate-500 dark:text-slate-400">{formatCurrency(item.estimatedCost, item.currency, locale)}</p>
                    )}
                  </div>
                  <div className="flex gap-1">
                    {item.status !== "skipped" ? (
                      <button
                        type="button"
                        onClick={() => updateItemStatus(item.id, "skipped")}
                        className="rounded-lg px-2 py-1 text-xs text-slate-400 hover:bg-slate-100"
                      >
                        {dict.trips.statusCancelled}
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => updateItemStatus(item.id, "suggested")}
                        className="rounded-lg px-2 py-1 text-xs text-sky-600 hover:bg-sky-50"
                      >
                        {dict.common.retry}
                      </button>
                    )}
                  </div>
                </li>
              ))}
              {day.items.length === 0 && <p className="text-xs text-slate-400">{dict.trips.noActivities}</p>}
            </ul>
          </div>
        ))}
      </div>

      <form onSubmit={handleAdjust} className="rounded-2xl border border-slate-200 bg-white p-4">
        <p className="mb-2 text-sm font-medium text-brand-950 dark:text-sand-50">{dict.trips.askToModify}</p>
        <div className="flex gap-2">
          <Input value={adjustMessage} onChange={(e) => setAdjustMessage(e.target.value)} placeholder={dict.trips.modifyPlaceholder} aria-label={dict.trips.modifyPlaceholder} />
          <Button type="submit" loading={busy} disabled={!adjustMessage.trim()}>
            {dict.common.confirm}
          </Button>
        </div>
        {adjustFeedback && <p className="mt-2 text-xs text-slate-600 dark:text-slate-400">{adjustFeedback}</p>}
      </form>
    </div>
  );
}
