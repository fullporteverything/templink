import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { unlockCookieName } from "@/lib/auth";
import { getCollection } from "@/lib/collections";
import { sign, verifyPassword } from "@/lib/crypto";

const attempts = new Map<string, { n: number; until: number }>();

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const c = getCollection(id);
  if (!c?.password_hash) return NextResponse.json({ error: "Not found." }, { status: 404 });

  const a = attempts.get(id);
  if (a && a.n >= 10 && a.until > Date.now()) {
    return NextResponse.json({ error: "Too many attempts. Wait a few minutes." }, { status: 429 });
  }

  const { password } = (await req.json().catch(() => ({}))) as { password?: string };
  if (typeof password !== "string" || !verifyPassword(password, c.password_hash)) {
    const cur = a && a.until > Date.now() ? a : { n: 0, until: Date.now() + 5 * 60_000 };
    attempts.set(id, { n: cur.n + 1, until: cur.until });
    return NextResponse.json({ error: "Wrong password." }, { status: 401 });
  }

  attempts.delete(id);
  (await cookies()).set(unlockCookieName(id), sign(`unlock:${id}`), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: Math.max(60, Math.floor((c.expires_at - Date.now()) / 1000)),
  });
  return NextResponse.json({ ok: true });
}
