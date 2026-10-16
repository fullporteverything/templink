import { NextResponse } from "next/server";
import { createMessage } from "@/lib/inbox";

export async function POST(req: Request) {
  const data = (await req.json().catch(() => ({}))) as Record<string, string | undefined>;
  const res = await createMessage({
    kind: "contact",
    name: data.name,
    email: data.email,
    subject: data.subject,
    body: data.message ?? "",
  });
  if (res.error) return NextResponse.json({ error: res.error }, { status: 400 });
  return NextResponse.json({ ok: true });
}
