import "server-only";
import { parseJsonResponseWithLimit } from "@/lib/http/bounded-body";

const WEATHER_RESPONSE_LIMIT_BYTES = 256 * 1024;

export interface WeatherSnapshot {
  temperatureC: number;
  condition: string;
  icon: string;
  isDay: boolean;
}

export function isWeatherConfigured(): boolean {
  return Boolean(process.env.OPENWEATHER_API_KEY);
}

/** Returns live weather, or null if the provider isn't configured / the call fails. Never fabricates data. */
export async function getCurrentWeather(lat: number, lng: number): Promise<WeatherSnapshot | null> {
  const apiKey = process.env.OPENWEATHER_API_KEY;
  if (!apiKey) return null;

  try {
    const url = `https://api.openweathermap.org/data/2.5/weather?lat=${lat}&lon=${lng}&units=metric&appid=${apiKey}`;
    const res = await fetch(url, { signal: AbortSignal.timeout(8000), next: { revalidate: 600 } });
    if (!res.ok) return null;
    const json = await parseJsonResponseWithLimit<{
      main?: { temp?: number };
      weather?: Array<{ main?: string; icon?: string }>;
    }>(res, WEATHER_RESPONSE_LIMIT_BYTES);
    if (typeof json.main?.temp !== "number") return null;
    const icon = json.weather?.[0]?.icon ?? "01d";
    return {
      temperatureC: Math.round(json.main.temp),
      condition: json.weather?.[0]?.main ?? "Clear",
      icon,
      isDay: icon.endsWith("d"),
    };
  } catch {
    return null;
  }
}
