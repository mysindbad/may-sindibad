"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useLocale } from "@/i18n/LocaleProvider";
import { localeNames } from "@/i18n/config";
import { Badge, Button, Card } from "@/components/ui/primitives";
import { InlineAlert, Skeleton } from "@/components/ui/feedback";
import {
  canRouteFromFix,
  classifyGeolocationError,
  progressRatio,
  readDirect,
  readGuardian,
  remainingSeconds,
  routeMetresRemaining,
  type CompassPoint,
  type DirectionsFailureCode,
  type GeolocationFailure,
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

type RouteFailure = { code: DirectionsFailureCode | "network" | "offline"; retryable: boolean };

export function NavigationView({ place }: { place: NavigationPlace }) {
  const { dict, locale } = useLocale();
  const destination: LatLng = { lat: place.lat, lng: place.lng };

  const [mode, setMode] = useState<TravelMode>("walking");
  const [position, setPosition] = useState<LatLng | null>(null);
  const [accuracy, setAccuracy] = useState<number | null>(null);
  const [locationFailure, setLocationFailure] = useState<GeolocationFailure | null>(null);
  const [plan, setPlan] = useState<RoutePlan | null>(null);
  const [failure, setFailure] = useState<RouteFailure | null>(null);
  const [loading, setLoading] = useState(false);
  const [follow, setFollow] = useState(true);
  const [aiReply, setAiReply] = useState<string | null>(null);
  const [aiBusy, setAiBusy] = useState(false);
  const [aiUnavailable, setAiUnavailable] = useState(false);

  const lastRouteAtRef = useRef(0);
  const positionRef = useRef<LatLng | null>(null);
  const planRef = useRef<RoutePlan | null>(null);
  // Only the newest request may write state: a slow walking answer must never
  // overwrite the driving route the traveller switched to meanwhile.
  const requestIdRef = useRef(0);

  const loadRoute = useCallback(
    async (from: LatLng, travelMode: TravelMode) => {
      lastRouteAtRef.current = Date.now();
      const requestId = ++requestIdRef.current;
      setLoading(true);
      try {
        // POST with a JSON body: the traveller's position never appears in a URL.
        const res = await fetch("/api/navigation/directions", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ fromLat: from.lat, fromLng: from.lng, toLat: destination.lat, toLng: destination.lng, mode: travelMode }),
        });
        if (requestId !== requestIdRef.current) return;
        if (res.ok) {
          const data = (await res.json()) as { route?: RoutePlan };
          if (requestId !== requestIdRef.current) return;
          if (data.route && data.route.geometry.length >= 2) {
            planRef.current = data.route;
            setPlan(data.route);
            setFailure(null);
            return;
          }
          // A 200 without drawable geometry is a failure, never a blank success.
          planRef.current = null;
          setPlan(null);
          setFailure({ code: "route_unavailable", retryable: true });
          return;
        }
        const body = (await res.json().catch(() => ({}))) as { error?: DirectionsFailureCode; retryable?: boolean };
        if (requestId !== requestIdRef.current) return;
        const code = body.error ?? "route_unavailable";
        // Only a transient failure may keep the previous route of the SAME
        // mode on screen; anything definitive clears it.
        const keep = code === "route_unavailable" && planRef.current?.mode === travelMode;
        if (!keep) {
          planRef.current = null;
          setPlan(null);
        }
        setFailure({ code, retryable: body.retryable ?? code === "route_unavailable" });
      } catch {
        if (requestId !== requestIdRef.current) return;
        if (planRef.current?.mode !== travelMode) {
          planRef.current = null;
          setPlan(null);
        }
        setFailure({ code: typeof navigator !== "undefined" && navigator.onLine === false ? "offline" : "network", retryable: true });
      } finally {
        if (requestId === requestIdRef.current) setLoading(false);
      }
    },
    [destination.lat, destination.lng],
  );

  // Live position. watchPosition rather than a poll so the guardian reacts as
  // soon as the device has a better fix. A timeout keeps the watch alive: the
  // browser will report again as soon as it gets a fix.
  useEffect(() => {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- browser capability is only knowable on the client, after mount.
      setLocationFailure("unavailable");
      return;
    }
    const watchId = navigator.geolocation.watchPosition(
      (fix) => {
        setLocationFailure(null);
        const next = { lat: fix.coords.latitude, lng: fix.coords.longitude };
        positionRef.current = next;
        setPosition(next);
        setAccuracy(typeof fix.coords.accuracy === "number" ? fix.coords.accuracy : null);
      },
      (error) => setLocationFailure(classifyGeolocationError(error.code)),
      { enableHighAccuracy: true, maximumAge: 5000, timeout: 20000 },
    );
    return () => navigator.geolocation.clearWatch(watchId);
  }, []);

  const usableFix = position !== null && canRouteFromFix(accuracy);

  // First route as soon as a usable position exists, and again whenever the
  // traveller switches between walking and driving.
  useEffect(() => {
    const current = positionRef.current;
    if (!current || !usableFix) return;
    void loadRoute(current, mode);
  }, [mode, usableFix, loadRoute]);

  function switchMode(next: TravelMode) {
    if (next === mode) return;
    // Drop the old line immediately so a driving route is never shown under
    // the walking label (or the reverse) while the new one loads.
    requestIdRef.current += 1;
    planRef.current = null;
    setPlan(null);
    setFailure(null);
    setLoading(false);
    setMode(next);
  }

  function retry() {
    const current = positionRef.current;
    if (!current || !canRouteFromFix(accuracy)) return;
    void loadRoute(current, mode);
  }

  // Coming back online is the cue to retry a route that failed for the network.
  useEffect(() => {
    function onOnline() {
      const current = positionRef.current;
      if (current && canRouteFromFix(accuracy) && !planRef.current) void loadRoute(current, mode);
    }
    window.addEventListener("online", onOnline);
    return () => window.removeEventListener("online", onOnline);
  }, [accuracy, mode, loadRoute]);

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
  const direct = position && !plan ? readDirect(position, accuracy, destination) : null;
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

  // Distance to go along the road, measured on the drawn route (plus however
  // far the traveller currently is from it), not the crow-flies distance.
  const metresLeft =
    reading && plan
      ? reading.state === "arrived"
        ? reading.metresRemaining
        : Math.round(routeMetresRemaining(position as LatLng, plan.geometry) + reading.metresFromRoute)
      : 0;

  async function askSindbad() {
    if (!plan || !reading) return;
    setAiBusy(true);
    setAiReply(null);
    setAiUnavailable(false);
    const question =
      "I am already on my way to " + place.name + " in " + place.city + ", " + place.country +
      " right now, travelling by " + (mode === "walking" ? "foot" : "car") +
      ". This is live, in-progress navigation, not trip planning - do not suggest creating, adding to, or editing a trip in the app." +
      " I am " + formatDistance(metresLeft) + " away, heading " + HEADING_LABEL[reading.heading] +
      ". Give me a short, practical, real-time tip for the rest of this specific walk or drive: anything to watch out for right now on the way to this exact destination." +
      " Respond only in " + localeNames[locale] + ".";
    try {
      const res = await fetch("/api/ai/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: question, localHour: new Date().getHours() }),
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

  const failureMessage = (code: RouteFailure["code"]): string => {
    switch (code) {
      case "offline":
        return dict.navigation.offline;
      case "no_route_nearby":
        return dict.navigation.noRouteNearby;
      case "too_far_for_walking":
        return dict.navigation.tooFarForWalking;
      case "profile_mismatch":
        return dict.navigation.routeConfigError;
      case "provider_not_configured":
        return dict.navigation.routingDisabled;
      default:
        return dict.navigation.routeUnavailable;
    }
  };

  const locationMessage =
    locationFailure === "denied"
      ? dict.navigation.locationDenied + " " + dict.navigation.enableLocation
      : locationFailure === "unavailable"
        ? dict.navigation.locationUnavailable
        : locationFailure === "timeout"
          ? dict.navigation.locationTimeout
          : null;

  const fixTooCoarse = position !== null && !canRouteFromFix(accuracy);
  const fixApproximate = usableFix && accuracy !== null && accuracy > 60;
  const done = plan && reading ? progressRatio(plan.distanceMeters, metresLeft) : 0;
  const stale = failure !== null && plan !== null;

  return (
    <div className="mx-auto flex h-[calc(100dvh-136px)] max-w-3xl flex-col gap-3 overflow-y-auto px-4 py-4 md:h-[calc(100dvh-64px)]">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="text-lg font-semibold text-brand-950 dark:text-sand-50">{place.name}</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            {place.address ? place.address : place.city + ", " + place.country}
          </p>
        </div>
        <Link href={"/" + locale + "/explore/" + place.id}>
          <Button size="sm" variant="ghost">
            {dict.navigation.details}
          </Button>
        </Link>
      </div>

      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant={mode === "walking" ? "primary" : "secondary"} aria-pressed={mode === "walking"} onClick={() => switchMode("walking")}>
          🚶 {dict.navigation.walking}
        </Button>
        <Button size="sm" variant={mode === "driving" ? "primary" : "secondary"} aria-pressed={mode === "driving"} onClick={() => switchMode("driving")}>
          🚗 {dict.navigation.driving}
        </Button>
        <Button size="sm" variant={follow ? "primary" : "ghost"} aria-pressed={follow} onClick={() => setFollow(!follow)}>
          🎯 {dict.navigation.recenter}
        </Button>
      </div>

      <p className="text-[11px] leading-relaxed text-slate-500 dark:text-slate-400">{dict.navigation.privacyNotice}</p>

      <div role="status" aria-live="polite" className="space-y-2 empty:hidden">
        {locationMessage && <InlineAlert tone={locationFailure === "timeout" ? "info" : "warning"}>{locationMessage}</InlineAlert>}
        {!position && !locationFailure && <InlineAlert tone="info">{dict.navigation.locating}</InlineAlert>}
        {fixTooCoarse && <InlineAlert tone="warning">{dict.navigation.inaccurateLocation}</InlineAlert>}
        {fixApproximate && !fixTooCoarse && <InlineAlert tone="info">{dict.navigation.approximateLocation}</InlineAlert>}
        {usableFix && loading && <InlineAlert tone="info">{plan ? dict.navigation.recalculating : dict.navigation.calculating}</InlineAlert>}
      </div>

      <div className="min-h-[240px] flex-1 overflow-hidden rounded-2xl">
        <RouteMapView
          className="h-full min-h-[240px] w-full"
          destination={destination}
          position={position}
          geometry={plan ? plan.geometry : []}
          follow={follow}
        />
      </div>

      {failure && !loading && (
        <Card className="space-y-2 p-3">
          <InlineAlert tone="warning">{stale ? dict.navigation.routeStale : failureMessage(failure.code)}</InlineAlert>
          {!stale && failure.code !== "offline" && failure.code !== "provider_not_configured" && (
            <p className="text-xs text-slate-600 dark:text-slate-400">{dict.navigation.routeUnavailableBody}</p>
          )}
          <div className="flex flex-wrap gap-2">
            {failure.retryable && usableFix && (
              <Button size="sm" onClick={retry}>
                {dict.navigation.retry}
              </Button>
            )}
            <a href={externalMapsUrl} target="_blank" rel="noopener noreferrer">
              <Button size="sm" variant="secondary">
                {dict.navigation.openExternal}
              </Button>
            </a>
          </div>
        </Card>
      )}

      {direct && !loading && (
        <Card className="space-y-1 p-3">
          <p className="text-xs text-slate-500 dark:text-slate-400">{dict.navigation.straightLine}</p>
          <p className="text-xl font-semibold text-brand-950 dark:text-sand-50">{formatDistance(direct.straightMetres)}</p>
          <p className="text-xs text-slate-600 dark:text-slate-400">
            {dict.navigation.heading}: <strong>{HEADING_LABEL[direct.heading]}</strong>
          </p>
          {direct.state === "arrived" ? (
            <InlineAlert tone="success">{dict.navigation.arrived}</InlineAlert>
          ) : (
            <p className="text-xs text-slate-500 dark:text-slate-400">{dict.navigation.straightLineNote}</p>
          )}
        </Card>
      )}

      {reading && plan && (
        <Card className="space-y-3 p-3">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-xs text-slate-500 dark:text-slate-400">{dict.navigation.remaining}</p>
              <p className="text-xl font-semibold text-brand-950 dark:text-sand-50">{formatDistance(metresLeft)}</p>
            </div>
            <div className="text-end">
              <p className="text-xs text-slate-500 dark:text-slate-400">{dict.navigation.eta}</p>
              <p className="text-xl font-semibold text-brand-950 dark:text-sand-50">{formatDuration(remainingSeconds(plan, metresLeft))}</p>
            </div>
          </div>

          <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-200">
            <div className="h-full rounded-full bg-turquoise-500 transition-all" style={{ width: Math.round(done * 100) + "%" }} />
          </div>

          <div className="flex items-center justify-between gap-2 text-xs text-slate-600 dark:text-slate-400">
            <span>
              {dict.navigation.heading}: <strong>{HEADING_LABEL[reading.heading]}</strong>
            </span>
            {plan.provider === "public-experimental" && <Badge tone="sun">β</Badge>}
          </div>

          <InlineAlert tone={guardianTone}>{guardianMessage}</InlineAlert>
          {guardianState === "arrived" && <p className="text-sm text-slate-600 dark:text-slate-400">{dict.navigation.arrivedBody}</p>}
          {plan.destinationOffsetMeters > 100 && (
            <p className="text-xs text-slate-500 dark:text-slate-400">
              {dict.navigation.routeEndsAway} {formatDistance(plan.destinationOffsetMeters)}
            </p>
          )}
          {plan.durationBasis === "pace" && <p className="text-xs text-slate-500 dark:text-slate-400">{dict.navigation.paceNote}</p>}
          {plan.provider === "public-experimental" && <p className="text-xs text-slate-500 dark:text-slate-400">{dict.navigation.publicRouterNotice}</p>}
          <p className="text-[11px] text-slate-400">{dict.navigation.routeCredit}</p>
        </Card>
      )}

      <Card className="space-y-2 p-3">
        <p className="text-sm font-semibold text-brand-950 dark:text-sand-50">🛡️ {dict.navigation.guardian}</p>
        <p className="text-xs text-slate-600 dark:text-slate-400">{dict.navigation.tipDaylight}</p>
        <p className="text-xs text-slate-600 dark:text-slate-400">{dict.navigation.tipBattery}</p>

        {aiReply && <InlineAlert tone="info">{aiReply}</InlineAlert>}
        {aiUnavailable && <p className="text-xs text-slate-500 dark:text-slate-400">{dict.navigation.aiUnavailable}</p>}

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
