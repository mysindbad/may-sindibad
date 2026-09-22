"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { useLocale } from "@/i18n/LocaleProvider";
import { Button, Input, Label, Select, Textarea } from "@/components/ui/primitives";
import { InlineAlert } from "@/components/ui/feedback";

const INTERESTS = ["food", "culture", "nature", "nightlife", "shopping", "adventure", "relaxation", "family"];

export function TripWizard() {
  const { dict, locale } = useLocale();
  const router = useRouter();

  const [title, setTitle] = useState("");
  const [destinationCity, setDestinationCity] = useState("Marrakech");
  const [destinationCountry, setDestinationCountry] = useState("Morocco");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [travelers, setTravelers] = useState(2);
  const [budgetAmount, setBudgetAmount] = useState<number | "">("");
  const [travelStyle, setTravelStyle] = useState("balanced");
  const [interests, setInterests] = useState<string[]>([]);
  const [notes, setNotes] = useState("");
  const [generate, setGenerate] = useState(true);

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function toggleInterest(value: string) {
    setInterests((prev) => (prev.includes(value) ? prev.filter((v) => v !== value) : [...prev, value]));
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);

    try {
      const res = await fetch("/api/trips", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: title || `${destinationCity} trip`,
          destinationCity,
          destinationCountry,
          startDate,
          endDate,
          travelers,
          budgetAmount: budgetAmount === "" ? undefined : Number(budgetAmount),
          travelStyle,
          interests,
          notes: notes || undefined,
          generateItinerary: generate,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? dict.common.somethingWentWrong);
        return;
      }
      router.push(`/${locale}/trips/${data.trip.id}`);
    } catch {
      setError(dict.errors.network);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="mx-auto max-w-xl space-y-5 px-4 py-6">
      <h1 className="text-xl font-semibold text-brand-950 dark:text-sand-50">{dict.trips.newTrip}</h1>

      <div>
        <Label>{dict.trips.wizardDestination}</Label>
        <div className="grid grid-cols-2 gap-2">
          <Input id="trip-destination-city" value={destinationCity} onChange={(e) => setDestinationCity(e.target.value)} placeholder={dict.trips.cityPlaceholder} aria-label={`${dict.trips.wizardDestination} — ${dict.common.city}`} required />
          <Input id="trip-destination-country" value={destinationCountry} onChange={(e) => setDestinationCountry(e.target.value)} placeholder={dict.trips.countryPlaceholder} aria-label={`${dict.trips.wizardDestination} — ${dict.common.country}`} required />
        </div>
      </div>

      <div>
        <Label htmlFor="trip-title">Trip title ({dict.common.optional})</Label>
        <Input id="trip-title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder={`${destinationCity} adventure`} />
      </div>

      <div>
        <Label>{dict.trips.wizardDates}</Label>
        <div className="grid grid-cols-2 gap-2">
          <Input id="trip-start-date" type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} aria-label={`${dict.trips.wizardDates} — ${dict.bookings.date}`} required />
          <Input id="trip-end-date" type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} aria-label={`${dict.trips.wizardDates} — ${dict.bookings.endDate}`} required min={startDate || undefined} />
        </div>
      </div>

      <div>
        <Label htmlFor="trip-travelers">{dict.trips.wizardTravelers}</Label>
        <Input id="trip-travelers" type="number" min={1} max={30} value={travelers} onChange={(e) => setTravelers(Number(e.target.value))} />
      </div>

      <div>
        <Label htmlFor="trip-budget">
          {dict.trips.wizardBudget} ({dict.common.optional})
        </Label>
        <Input id="trip-budget" type="number" min={0} value={budgetAmount} onChange={(e) => setBudgetAmount(e.target.value === "" ? "" : Number(e.target.value))} placeholder="USD" aria-label={dict.trips.wizardBudget} />
      </div>

      <div>
        <Label htmlFor="trip-style">{dict.trips.wizardStyle}</Label>
        <Select id="trip-style" value={travelStyle} onChange={(e) => setTravelStyle(e.target.value)}>
          <option value="relaxed">{dict.trips.styleRelaxed}</option>
          <option value="balanced">{dict.trips.styleBalanced}</option>
          <option value="packed">{dict.trips.stylePacked}</option>
          <option value="luxury">{dict.trips.styleLuxury}</option>
          <option value="budget">{dict.trips.styleBudget}</option>
        </Select>
      </div>

      <div>
        <Label>{dict.trips.wizardInterests}</Label>
        <div className="flex flex-wrap gap-2" role="group" aria-label={dict.trips.wizardInterests}>
          {INTERESTS.map((interest) => (
            <button
              key={interest}
              type="button"
              onClick={() => toggleInterest(interest)}
              aria-pressed={interests.includes(interest)}
              className={
                interests.includes(interest)
                  ? "rounded-full bg-brand-800 px-3 py-1.5 text-xs font-medium text-white"
                  : "rounded-full bg-slate-100 px-3 py-1.5 text-xs font-medium text-slate-600 dark:text-slate-400"
              }
            >
              {interest}
            </button>
          ))}
        </div>
      </div>

      <div>
        <Label htmlFor="trip-notes">{dict.trips.wizardNotes}</Label>
        <Textarea id="trip-notes" rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} />
      </div>

      <label className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-400">
        <input type="checkbox" checked={generate} onChange={(e) => setGenerate(e.target.checked)} className="h-4 w-4 rounded border-slate-300" />
        {dict.trips.generateWithAi}
      </label>

      {error && <InlineAlert tone="error">{error}</InlineAlert>}

      <Button type="submit" fullWidth loading={busy}>
        {dict.trips.newTrip}
      </Button>
    </form>
  );
}
