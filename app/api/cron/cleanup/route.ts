import { NextResponse } from "next/server";
import { sweepExpired } from "@/lib/collections";
import { safeEqual } from "@/lib/crypto";

export const maxDuration = 300;

/**
 * Deletes expired files. Vercel Cron calls this (see vercel.json) with
 * `Authorization: Bearer $CRON_SECRET`. Links stop working the moment they expire either way;
 * this only frees the storage.
 */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  const auth = req.headers.get("authorization") ?? "";
  if (!secret || !safeEqual(auth, `Bearer ${secret}`)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  let total = 0;
  // Each sweep handles up to 200 links; keep going while there's a backlog.
  for (let i = 0; i < 10; i++) {
    const n = await sweepExpired(true);
    total += n;
    if (n < 200) break;
  }
  return NextResponse.json({ deleted: total });
}
