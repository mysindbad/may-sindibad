import { setWorkerUrl } from "maplibre-gl";

/**
 * Point MapLibre at the worker file served from /public (copied there by
 * scripts/copy-maplibre-worker.mjs). Without this the library looks for the
 * worker beside its bundled chunk, gets an HTML 404, and GeoJSON layers such
 * as the navigation route line never render. Safe to call repeatedly; browser
 * only.
 */
let configured = false;

export function configureMapWorker(): void {
  if (configured || typeof window === "undefined") return;
  setWorkerUrl(new URL("/maplibre-gl-worker.mjs", window.location.origin).href);
  configured = true;
}
