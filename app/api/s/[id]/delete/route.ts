import { NextResponse } from "next/server";
import { getCollection, purgeCollection } from "@/lib/collections";
import { safeEqual } from "@/lib/crypto";

/** Uploader-initiated delete, authorised by the private manage token. */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const c = getCollection(id);
  const { token } = (await req.json().catch(() => ({}))) as { token?: string };
  if (!c || typeof token !== "string" || !safeEqual(token, c.manage_token)) {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }
  if (c.status !== "deleted") purgeCollection(id, "deleted");
  return NextResponse.json({ ok: true });
}
