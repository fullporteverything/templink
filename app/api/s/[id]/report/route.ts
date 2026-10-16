import { NextResponse } from "next/server";
import { getCollection } from "@/lib/collections";
import { createMessage } from "@/lib/inbox";

const REASONS = ["Malware or phishing", "Copyright infringement", "Illegal content", "Spam", "Other"];

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!getCollection(id)) return NextResponse.json({ error: "Not found." }, { status: 404 });
  const data = (await req.json().catch(() => ({}))) as { reason?: string; details?: string; email?: string };
  const reason = REASONS.includes(data.reason ?? "") ? data.reason! : "Other";
  const res = await createMessage({
    kind: "report",
    subject: reason,
    body: (data.details ?? "").trim() || reason,
    email: data.email,
    collectionId: id,
  });
  if (res.error) return NextResponse.json({ error: res.error }, { status: 400 });
  return NextResponse.json({ ok: true });
}
