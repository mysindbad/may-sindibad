"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useLocale } from "@/i18n/LocaleProvider";
import { Badge, Button, Card } from "@/components/ui/primitives";
import { InlineAlert, Skeleton } from "@/components/ui/feedback";
import {
  readGuardian,
  remainingSeconds,
  progressRatio,
  type CompassPoint,
  type LatLng,
  type RoutePlan,
  type TravelMode,
} from "@/lib/navigation/route";

const RouteMapView = dynamic(() => import("@/components/map/RouteMapView").then((m) => m.RouteMapView), {
  ssr: false,
  loading: () => <Skeleton className="h-full w-full" />,
});

export interface NavigationPlace {
  id: string;
  name: string;
  city: string;
  country: string;
  address: string | null;
  lat: number;
  lng: number;
}

/** Do not hammer the routing service when the traveller wanders near the edge. */
const REROUTE_COOLDOWN_MS = 20000;

export function NavigationView({ place }: { place: NavigationPlace }) {
  const { dict, locale } = useLocale();
  const destination: LatLng = { lat: place.lat, lng: place.lng };

  const [mode, setMode] = useState<TravelMode>("walking");
  const [position, setPosition] = useState<LatLng | null>(null);
  const [accuracy, setAccuracy] = useState<number | null>(null);
  const [locationError, setLocationError] = useState(false);
  const [plan, setPlan] = useState<RoutePlan | null>(null);
  const [follow, setFollow] = useState(true);
  const [aiReply, setAiReply] = useState<string | null>(null);
  const [aiBusy, setAiBusy] = useState(false);
  const [aiUnavailable, setAiUnavailable] = useState(false);

  const lastRouteAtRef = useRef(0);
  const positionRef = useRef<LatLng | null>(null);

  const loadRoute = useCallback(
    async (from: LatLng, travelMode: TravelMode) => {
      lastRouteAtRef.current = Date.now();
      const params = new URLSearchParams({
        fromLat: String(from.lat),
        fromLng: String(from.lng),
        toLat: String(destination.lat),
        toLng: String(destination.lng),
        mode: travelMode,
      });
      try {
        const res = await fetch("/api/navigation/directions?" + params.toString());
        if (!res.ok) return;
        const data = (await res.json()) as { route?: RoutePlan };
        if (data.route) setPlan(data.route);
      } catch {
        // Losing a refresh is survivable: the previous route and the live
        // distance readout both stay on screen.
      }
    },
    [destination.lat, destination.lng],
  );

  // Live position. watchPosition rather than a poll so the guardian reacts as
  // soon as the device has a better fix.
  useEffect(() => {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      setLocationError(true);
      return;
    }
    const watchId = navigator.geolocation.watchPosition(
      (fix) => {
        setLocationError(false);
        const next = { lat: fix.coords.latitude, lng: fix.coords.longitude };
        positionRef.current = next;
        setPosition(next);
        setAccuracy(typeof fix.coords.accuracy === "number" ? fix.coords.accuracy : null);
      },
      () => setLocationError(true),
      { enableHighAccuracy: true, maximumAge: 5000, timeout: 20000 },
    );
    return () => navigator.geolocation.clearWatch(watchId);
  }, []);

  const hasPosition = position !== null;

  // First route as soon as a position exists, and again whenever the traveller
  // switches between walking and driving.
  useEffect(() => {
    const current = positionRef.current;
    if (!current) return;
    void loadRoute(current, mode);
  }, [mode, hasPosition, loadRoute]);

  // Keep the screen awake while navigating; a locked screen mid-journey is the
  // most common way this kind of feature fails people.
  useEffect(() => {
    const nav = navigator as Navigator & {
      wakeLock?: { request: (type: "screen") => Promise<{ release: () => Promise<void> }> };
    };
    if (!nav.wakeLock) return;
    let sentinel: { release: () => Promise<void> } | null = null;
    let cancelled = false;
    nav.wakeLock
      .request("screen")
      .then((lock) => {
        if (cancelled) void lock.release();
        else sentinel = lock;
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
      if (sentinel) void sentinel.release().catch(() => undefined);
    };
  }, []);

  const reading = position && plan ? readGuardian({ position, accuracyMetres: accuracy, destination, geometry: plan.geometry }) : null;
  const guardianState = reading ? reading.state : null;

  // Recalculate when the traveller genuinely leaves the route.
  useEffect(() => {
    if (guardianState !== "off_route") return;
    const current = positionRef.current;
    if (!current) return;
    if (Date.now() - lastRouteAtRef.current < REROUTE_COOLDOWN_MS) return;
    void loadRoute(current, mode);
  }, [guardianState, mode, loadRoute]);

  function formatDistance(metres: number): string {
    if (metres < 1000) return Math.round(metres) + " " + dict.navigation.unitMeters;
    return (metres / 1000).toFixed(1) + " " + dict.navigation.unitKm;
  }

  function formatDuration(seconds: number): string {
    if (seconds < 3600) return Math.max(1, Math.round(seconds / 60)) + " " + dict.navigation.unitMin;
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.round((seconds % 3600) / 60);
    return hours + " " + dict.navigation.unitHour + " " + minutes + " " + dict.navigation.unitMin;
  }

  const HEADING_LABEL: Record<CompassPoint, string> = {
    n: dict.navigation.headingN,
    ne: dict.navigation.headingNE,
    e: dict.navigation.headingE,
    se: dict.navigation.headingSE,
    s: dict.navigation.headingS,
    sw: dict.navigation.headingSW,
    w: dict.navigation.headingW,
    nw: dict.navigation.headingNW,
  };

  async function askSindbad() {
    if (!plan || !reading) return;
    setAiBusy(true);
    setAiReply(null);
    setAiUnavailable(false);
    const question =
      "I am travelling to " + place.name + " in " + place.city + ", " + place.country +
      ". I am " + formatDistance(reading.metresRemaining) + " away, heading " + HEADING_LABEL[reading.heading] +
      ", travelling by " + (mode === "walking" ? "foot" : "car") +
      ". Give me a short, practical plan for this trip and anything I should watch out for on the way.";
    try {
      const res = await fetch("/api/ai/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: question }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || !data.configured) {
        setAiUnavailable(true);
        return;
      }
      if (data.assistantMessage) setAiReply(data.assistantMessage.content);
      else setAiUnavailable(true);
    } catch {
      setAiUnavailable(true);
    } finally {
      setAiBusy(false);
    }
  }

  const externalMapsUrl =
    "https://www.google.com/maps/dir/?api=1&destination=" +
    destination.lat + "," + destination.lng +
    "&travelmode=" + (mode === "walking" ? "walking" : "driving");

  const guardianTone =
    guardianState === "arrived" ? "success" : guardianState === "off_route" ? "warning" : "info";

  const guardianMessage =
    guardianState === "arrived"
      ? dict.navigation.arrived
      : guardianState === "off_route"
        ? dict.navigation.offRoute
        : guardianState === "poor_signal"
          ? dict.navigation.poorSignal
          : dict.navigation.onRoute;

  const totalMetres = plan ? plan.distanceMeters : 0;
  const done = reading ? progressRatio(totalMetres, reading.metresRemaining) : 0;

  return (
    <div className="mx-auto flex h-[calc(100dvh-56px)] max-w-3xl flex-col gap-3 px-4 py-4 md:h-[calc(100dvh-64px)]">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold text-brand-950">{place.name}</h1>
          <p className="text-sm text-slate-500">
            {place.address ? place.address : place.city + ", " + place.country}
          </p>
        </div>
        <Link href={"/" + locale + "/explore/" + place.id}>
          <Button size="sm" variant="ghost">
            {dict.navigation.details}
          </Button>
        </Link>
      </div>

      <div className="flex gap-2">
        <Button size="sm" variant={mode === "walking" ? "primary" : "secondary"} onClick={() => setMode("walking")}>
          🚶 {dict.navigation.walking}
        </Button>
        <Button size="sm" variant={mode === "driving" ? "primary" : "secondary"} onClick={() => setMode("driving")}>
          🚗 {dict.navigation.driving}
        </Button>
        <Button size="sm" variant={follow ? "primary" : "ghost"} onClick={() => setFollow(!follow)}>
          🎯 {dict.navigation.recenter}
        </Button>
      </div>

      {locationError && (
        <InlineAlert tone="warning">
          {dict.navigation.locationDenied} {dict.navigation.enableLocation}
        </InlineAlert>
      )}

      {!position && !locationError && <InlineAlert tone="info">{dict.navigation.locating}</InlineAlert>}

      <div className="min-h-[240px] flex-1 overflow-hidden rounded-2xl">
        <RouteMapView
          className="h-full min-h-[240px] w-full"
          destination={destination}
          position={position}
          geometry={plan ? plan.geometry : []}
          follow={follow}
        />
      </div>

      {reading && plan && (
        <Card className="space-y-3 p-3">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-xs text-slate-500">{dict.navigation.remaining}</p>
              <p className="text-xl font-semibold text-brand-950">{formatDistance(reading.metresRemaining)}</p>
            </div>
            <div className="text-end">
              <p className="text-xs text-slate-500">{dict.navigation.eta}</p>
              <p className="text-xl font-semibold text-brand-950">{formatDuration(remainingSeconds(plan, reading.metresRemaining))}</p>
            </div>
          </div>

          <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-200">
            <div className="h-full rounded-full bg-turquoise-500 transition-all" style={{ width: Math.round(done * 100) + "%" }} />
          </div>

          <div className="flex items-center justify-between gap-2 text-xs text-slate-600">
            <span>
              {dict.navigation.heading}: <strong>{HEADING_LABEL[reading.heading]}</strong>
            </span>
            {plan.source === "estimate" && <Badge tone="sun">~</Badge>}
          </div>

          <InlineAlert tone={guardianTone}>{guardianMessage}</InlineAlert>
          {guardianState === "arrived" && <p className="text-sm text-slate-600">{dict.navigation.arrivedBody}</p>}
          {plan.source === "estimate" && <p className="text-xs text-slate-500">{dict.navigation.estimateNotice}</p>}
        </Card>
      )}

      <Card className="space-y-2 p-3">
        <p className="text-sm font-semibold text-brand-950">🛡️ {dict.navigation.guardian}</p>
        <p className="text-xs text-slate-600">{dict.navigation.tipDaylight}</p>
        <p className="text-xs text-slate-600">{dict.navigation.tipBattery}</p>

        {aiReply && <InlineAlert tone="info">{aiReply}</InlineAlert>}
        {aiUnavailable && <p className="text-xs text-slate-500">{dict.navigation.aiUnavailable}</p>}

        <div className="flex flex-wrap gap-2 pt-1">
          <Button size="sm" variant="secondary" loading={aiBusy} disabled={!reading} onClick={() => void askSindbad()}>
            ✨ {dict.navigation.askSindbad}
          </Button>
          <a href={externalMapsUrl} target="_blank" rel="noopener noreferrer">
            <Button size="sm" variant="ghost">
              {dict.navigation.openExternal}
            </Button>
          </a>
        </div>
      </Card>
    </div>
  );
}
