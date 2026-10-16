import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { clientIp, unlockCookieName } from "@/lib/auth";
import { getCollection } from "@/lib/collections";
import { hashIp, sign, verifyPassword } from "@/lib/crypto";
import { clearHits, hit, overLimit } from "@/lib/ratelimit";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const c = await getCollection(id);
  if (!c?.password_hash) return NextResponse.json({ error: "Not found." }, { status: 404 });

  // Per link and per visitor, so one person can't lock everyone else out of a link.
  const key = `unlock:${id}:${hashIp(await clientIp())}`;
  if (await overLimit(key, 10, 10 * 60_000)) {
    return NextResponse.json({ error: "Too many attempts. Wait a few minutes." }, { status: 429 });
  }

  const { password } = (await req.json().catch(() => ({}))) as { password?: string };
  if (typeof password !== "string" || !verifyPassword(password, c.password_hash)) {
    await hit(key);
    return NextResponse.json({ error: "Wrong password." }, { status: 401 });
  }

  await clearHits(key);
  (await cookies()).set(unlockCookieName(id), sign(`unlock:${id}`), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: Math.max(60, Math.floor((c.expires_at - Date.now()) / 1000)),
  });
  return NextResponse.json({ ok: true });
}
