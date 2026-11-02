#!/usr/bin/env node
// maplibre-gl 6.x starts its web worker from a file that sits NEXT TO ITS OWN
// BUNDLE (maplibre-gl-worker.mjs). Once a bundler (Turbopack/webpack) folds the
// library into /_next/static/chunks/*.js that sibling file does not exist, the
// worker request comes back as an HTML 404 and every GeoJSON / vector layer -
// including the navigation route line - silently fails to render.
//
// The fix is to serve the worker ourselves and point MapLibre at it with
// setWorkerUrl() (see src/lib/maps/worker.ts). The file is copied from the
// installed package at dev/build time, not committed, so it can never drift
// from the maplibre-gl version it belongs to.
import { copyFileSync, existsSync, mkdirSync } from "node:fs";
import path from "node:path";

const root = process.cwd();
const source = path.join(root, "node_modules", "maplibre-gl", "dist", "maplibre-gl-worker.mjs");
const target = path.join(root, "public", "maplibre-gl-worker.mjs");

if (!existsSync(source)) {
  console.error("copy-maplibre-worker: " + source + " not found. Run npm install first.");
  process.exit(1);
}
mkdirSync(path.dirname(target), { recursive: true });
copyFileSync(source, target);
console.log("copy-maplibre-worker: public/maplibre-gl-worker.mjs updated");
