"use client";

import { useState } from "react";
import Link from "next/link";
import { useLocale } from "@/i18n/LocaleProvider";
import { Button, Select } from "@/components/ui/primitives";
import { InlineAlert } from "@/components/ui/feedback";

// The bridge between discovering a place and planning with it. Before this,
// finding a restaurant in Explore and getting it into the plan were two
// unconnected worlds.

interface TripOption {
  id: string;
  title: string;
}

interface DayOption {
  dayIndex: number;
  date: string;
}

export function AddToTripButton({ placeId, size = "sm" }: { placeId: string; size?: "sm" | "md" }) {
  const { dict, locale } = useLocale();
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [trips, setTrips] = useState<TripOption[] | null>(null);
  const [days, setDays] = useState<DayOption[]>([]);
  const [tripId, setTripId] = useState<string>("");
  const [dayIndex, setDayIndex] = useState<string>("0");
  const [added, setAdded] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function loadDays(nextTripId: string) {
    setDays([]);
    if (!nextTripId) return;
    try {
      const res = await fetch("/api/trips/" + nextTripId);
      if (!res.ok) return;
      const data = (await res.json()) as { days?: Array<{ dayIndex: number; date: string }> };
      const list = (data.days ?? []).map((day) => ({ dayIndex: day.dayIndex, date: day.date }));
      setDays(list);
      setDayIndex(list.length > 0 ? String(list[0].dayIndex) : "0");
    } catch {
      // The day picker is a convenience; adding still works on the first day.
    }
  }

  async function openPicker() {
    setOpen(true);
    setError(null);
    if (trips !== null) return;
    setLoading(true);
    try {
      const res = await fetch("/api/trips");
      const data = (await res.json()) as { trips?: TripOption[] };
      const list = data.trips ?? [];
      setTrips(list);
      if (list.length > 0) {
        setTripId(list[0].id);
        await loadDays(list[0].id);
      }
    } catch {
      setError(dict.errors.network);
      setTrips([]);
    } finally {
      setLoading(false);
    }
  }

  async function submit() {
    if (!tripId) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/trips/" + tripId + "/items", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ placeId, dayIndex: Number(dayIndex) }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? dict.common.somethingWentWrong);
        return;
      }
      setAdded(true);
      setOpen(false);
    } catch {
      setError(dict.errors.network);
    } finally {
      setBusy(false);
    }
  }

  if (added) {
    return (
      <Button size={size} variant="ghost" disabled>
        ✓ {dict.addToTrip.added}
      </Button>
    );
  }

  if (!open) {
    return (
      <Button size={size} variant="secondary" onClick={() => void openPicker()}>
        ➕ {dict.addToTrip.button}
      </Button>
    );
  }

  return (
    <div className="w-full space-y-2 rounded-xl border border-slate-200 p-3">
      {loading && <p className="text-xs text-slate-500 dark:text-slate-400">{dict.common.loading}</p>}

      {!loading && trips !== null && trips.length === 0 && (
        <div className="space-y-2">
          <p className="text-xs text-slate-600 dark:text-slate-400">{dict.addToTrip.noTrips}</p>
          <Link href={"/" + locale + "/trips/new"}>
            <Button size="sm">{dict.addToTrip.createFirst}</Button>
          </Link>
        </div>
      )}

      {!loading && trips !== null && trips.length > 0 && (
        <>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-400" htmlFor={"trip-" + placeId}>
              {dict.addToTrip.choose}
            </label>
            <Select
              id={"trip-" + placeId}
              value={tripId}
              onChange={(e) => {
                setTripId(e.target.value);
                void loadDays(e.target.value);
              }}
            >
              {trips.map((trip) => (
                <option key={trip.id} value={trip.id}>
                  {trip.title}
                </option>
              ))}
            </Select>
          </div>

          {days.length > 0 && (
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600 dark:text-slate-400" htmlFor={"day-" + placeId}>
                {dict.addToTrip.chooseDay}
              </label>
              <Select id={"day-" + placeId} value={dayIndex} onChange={(e) => setDayIndex(e.target.value)}>
                {days.map((day) => (
                  <option key={day.dayIndex} value={String(day.dayIndex)}>
                    {dict.addToTrip.day} {day.dayIndex + 1} · {day.date}
                  </option>
                ))}
              </Select>
            </div>
          )}

          {error && <InlineAlert tone="error">{error}</InlineAlert>}

          <div className="flex gap-2">
            <Button size="sm" loading={busy} onClick={() => void submit()}>
              {dict.addToTrip.button}
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setOpen(false)} disabled={busy}>
              {dict.common.cancel}
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
