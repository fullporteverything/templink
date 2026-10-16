import { NextResponse } from "next/server";
import { getLive } from "@/lib/live";

/** Public activity feed for the homepage. Cached briefly at the edge so traffic spikes stay cheap. */
export async function GET() {
  const data = await getLive();
  return NextResponse.json(data, {
    headers: { "Cache-Control": "public, s-maxage=15, stale-while-revalidate=60" },
  });
}
