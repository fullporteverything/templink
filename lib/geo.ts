import "server-only";
import { headers } from "next/headers";

export type Geo = { city: string | null; country: string | null; lat: number | null; lon: number | null };

/**
 * Approximate visitor location from Vercel's edge headers (absent locally). Coordinates are
 * rounded to one decimal (about 10 km) so we only ever keep city-level data.
 */
export async function requestGeo(): Promise<Geo> {
  const h = await headers();
  const num = (v: string | null) => {
    const n = v == null ? NaN : Number(v);
    return Number.isFinite(n) ? Math.round(n * 10) / 10 : null;
  };
  let city = h.get("x-vercel-ip-city");
  try {
    city = city ? decodeURIComponent(city) : null;
  } catch {
    /* keep raw */
  }
  return {
    city: city?.slice(0, 80) || null,
    country: h.get("x-vercel-ip-country")?.slice(0, 2) || null,
    lat: num(h.get("x-vercel-ip-latitude")),
    lon: num(h.get("x-vercel-ip-longitude")),
  };
}
