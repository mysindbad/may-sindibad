import "server-only";
import { parseJsonResponseWithLimit } from "@/lib/http/bounded-body";

const WEATHER_RESPONSE_LIMIT_BYTES = 256 * 1024;

export interface WeatherSnapshot {
  temperatureC: number;
  condition: string;
  icon: string;
  isDay: boolean;
}

// WMO weather codes (used by Open-Meteo) collapsed into the handful of
// conditions the UI actually distinguishes. See
// https://open-meteo.com/en/docs#weathervariables for the full table.
const WMO_CONDITIONS: Record<number, { condition: string; icon: string }> = {
  0: { condition: "Clear", icon: "☀️" },
  1: { condition: "Mostly clear", icon: "🌤️" },
  2: { condition: "Partly cloudy", icon: "⛅" },
  3: { condition: "Overcast", icon: "☁️" },
  45: { condition: "Fog", icon: "🌫️" },
  48: { condition: "Fog", icon: "🌫️" },
  51: { condition: "Drizzle", icon: "🌦️" },
  53: { condition: "Drizzle", icon: "🌦️" },
  55: { condition: "Drizzle", icon: "🌦️" },
  56: { condition: "Freezing drizzle", icon: "🌧️" },
  57: { condition: "Freezing drizzle", icon: "🌧️" },
  61: { condition: "Rain", icon: "🌧️" },
  63: { condition: "Rain", icon: "🌧️" },
  65: { condition: "Heavy rain", icon: "🌧️" },
  66: { condition: "Freezing rain", icon: "🌧️" },
  67: { condition: "Freezing rain", icon: "🌧️" },
  71: { condition: "Snow", icon: "🌨️" },
  73: { condition: "Snow", icon: "🌨️" },
  75: { condition: "Heavy snow", icon: "🌨️" },
  77: { condition: "Snow grains", icon: "🌨️" },
  80: { condition: "Rain showers", icon: "🌦️" },
  81: { condition: "Rain showers", icon: "🌦️" },
  82: { condition: "Violent rain showers", icon: "⛈️" },
  85: { condition: "Snow showers", icon: "🌨️" },
  86: { condition: "Snow showers", icon: "🌨️" },
  95: { condition: "Thunderstorm", icon: "⛈️" },
  96: { condition: "Thunderstorm", icon: "⛈️" },
  99: { condition: "Thunderstorm", icon: "⛈️" },
};

/** Open-Meteo needs no API key, so weather is always available - kept only so call sites read clearly. */
export function isWeatherConfigured(): boolean {
  return true;
}

/** Returns live weather from Open-Meteo, or null if the call fails. Never fabricates data. */
export async function getCurrentWeather(lat: number, lng: number): Promise<WeatherSnapshot | null> {
  try {
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}&current=temperature_2m,weather_code,is_day&timezone=auto`;
    const res = await fetch(url, { signal: AbortSignal.timeout(8000), next: { revalidate: 600 } });
    if (!res.ok) return null;
    const json = await parseJsonResponseWithLimit<{
      current?: { temperature_2m?: number; weather_code?: number; is_day?: number };
    }>(res, WEATHER_RESPONSE_LIMIT_BYTES);
    if (typeof json.current?.temperature_2m !== "number") return null;
    const mapped = WMO_CONDITIONS[json.current.weather_code ?? -1] ?? { condition: "Clear", icon: "☀️" };
    return {
      temperatureC: Math.round(json.current.temperature_2m),
      condition: mapped.condition,
      icon: mapped.icon,
      isDay: json.current.is_day !== 0,
    };
  } catch {
    return null;
  }
}
